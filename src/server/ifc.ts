// IFC einlesen: Der IFC-Dienst (Hilfscontainer, Python) liest die Datei, hier wird sie mit dem vorhandenen
// Gebäudemodell verglichen. Erst die Vorschau („was würde sich ändern“), dann – nach Bestätigung – die Übernahme
// als ein Vorgang: alles oder nichts. Was von Hand eingetragen wurde, überschreibt ein neuer Planstand nicht.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import { KENNUNG, type Werte } from '../kern/modell';
import { alsBenutzer, tabelle, type Db } from './db';
import { Ablehnung, vorgangAusfuehren } from './protokoll';
import type { Benutzer } from './anmeldung';

interface Gelesen {
  schema: string;
  gebaeude: { kennung: string; name: string }[];
  geschosse: { kennung: string; name: string; ebene: number; hoehe: number | null; gebaeude: string | null }[];
  raeume: { kennung: string; nummer: string; name: string; nutzung: string; flaeche: number | null; hoehe: number | null; geschoss: string | null }[];
  bauteile: { kennung: string; art: string; name: string; geschoss: string | null; lage: string; menge: number | null; einheit: string; abmessung: string; aufbau: string }[];
  uebersprungen: Record<string, number>;
  flaechen_aus_geometrie: number;
}
type Zahl = { neu: number; geaendert: number; entfernt: number; unveraendert: number; behalten: number };
export interface Vorschau { token: string; schema: string; je: Record<string, Zahl>; uebersprungen: Record<string, number>; flaechenAusGeometrie: number; ohneGeschoss: number; befehle: number }

const plaene = new Map<string, { wer: string; befehle: Befehl[]; bis: number }>();

async function lies(datei: Buffer): Promise<Gelesen> {
  let r: Response;
  try {
    r = await fetch(`${process.env.IFCDIENST_URL ?? 'http://ifcdienst:8000'}/auswerten`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: new Uint8Array(datei), signal: AbortSignal.timeout(300000),
    });
  } catch { throw new Ablehnung('Der IFC-Dienst des Bauportals antwortet nicht'); }
  const d = (await r.json().catch(() => ({}))) as Gelesen & { fehler?: string };
  if (!r.ok) throw new Ablehnung(d.fehler ?? `Der IFC-Dienst meldet Fehler ${r.status}`);
  return d;
}

/** Vergleicht das Gelesene mit dem Modell einer Version und baut daraus die Befehle. */
export async function planen(db: Db, register: Modulregister, wer: Benutzer, projekt: string, version: string, d: Gelesen): Promise<Omit<Vorschau, 'token'> & { liste: Befehl[] }> {
  return alsBenutzer(db, wer, async (c) => {
    const v = (await c.query("select 1 from o_version where id = $1 and projekt = $2 and bereich = 'gebaeudemodell' and not geloescht", [version, projekt])).rowCount;
    if (!v) throw new Ablehnung('Die Version des Gebäudemodells gibt es nicht (mehr)');
    const liste: Befehl[] = [];
    const je: Record<string, Zahl> = {};
    const kopf = () => ({ id: randomUUID(), gesehen: 0, herkunft: 'ifc' });
    // Kennung im Plan -> Kennung im Bauportal, je Objektart; so finden Geschosse ihr Gebäude und Bauteile ihr Geschoss
    const ort: Record<string, Map<string, string>> = {};

    const abgleichen = async (objekt: string, eintraege: { kennung: string; werte: Werte }[]) => {
      const m = register.modell(objekt)!;
      const z: Zahl = (je[objekt] = { neu: 0, geaendert: 0, entfernt: 0, unveraendert: 0, behalten: 0 });
      const da = new Map<string, Record<string, unknown>>();
      for (const zeile of (await c.query(`select * from ${tabelle(objekt)} where version = $1 and kennung <> ''`, [version])).rows) da.set(zeile.kennung, zeile);
      const karte = (ort[objekt] = new Map<string, string>());
      for (const e of eintraege) {
        const alt = da.get(e.kennung);
        if (!alt) {
          const id = randomUUID();
          karte.set(e.kennung, id);
          liste.push({ ...kopf(), objekt, art: 'anlegen', objektId: id, werte: { projekt, version, kennung: e.kennung, ...e.werte } });
          z.neu++;
          continue;
        }
        const id = alt.id as string;
        karte.set(e.kennung, id);
        if (alt.geloescht) liste.push({ ...kopf(), objekt, art: 'wiederherstellen', objektId: id });
        const stand = alt._stand as Record<string, { herkunft?: string }>;
        const aendern: Werte = {};
        let behalten = false;
        for (const [k, w] of Object.entries(e.werte)) {
          const jetzt = alt[k] ?? null;
          if (jetzt === w || (jetzt === '' && w === null) || !m.felder.some((f) => f.name === k)) continue;
          // Von Hand eingetragen (keine Herkunft „ifc“) und nicht leer: bleibt, auch wenn der Plan jetzt anderes sagt.
          if (stand[k]?.herkunft !== 'ifc' && jetzt !== '' && jetzt !== null) behalten = true; else aendern[k] = w;
        }
        if (Object.keys(aendern).length) { liste.push({ ...kopf(), objekt, art: 'aendern', objektId: id, werte: aendern }); z.geaendert++; }
        else if (alt.geloescht) z.neu++;
        else z.unveraendert++;
        if (behalten) z.behalten++;
        da.delete(e.kennung);
      }
      // Was aus dem Plan stammte und im neuen Stand fehlt, wird entfernt (bleibt im Protokoll und lässt sich zurückholen).
      for (const alt of da.values()) if (!alt.geloescht) { liste.push({ ...kopf(), objekt, art: 'loeschen', objektId: alt.id as string }); z.entfernt++; }
    };

    const gebaeude = d.gebaeude.length ? d.gebaeude : [{ kennung: 'ohne-gebaeude', name: 'Gebäude' }];
    await abgleichen('gebaeude', gebaeude.map((g) => ({ kennung: g.kennung, werte: { name: g.name } })));
    const erstes = ort.gebaeude!.get(gebaeude[0]!.kennung)!;
    await abgleichen('geschoss', d.geschosse.map((g) => ({ kennung: g.kennung, werte: { name: g.name, ebene: g.ebene, hoehe: g.hoehe, gebaeude: (g.gebaeude && ort.gebaeude!.get(g.gebaeude)) || erstes } })));
    const mitGeschoss = d.raeume.filter((r) => r.geschoss && ort.geschoss!.has(r.geschoss));
    await abgleichen('raum', mitGeschoss.map((r) => ({ kennung: r.kennung, werte: { nummer: r.nummer, name: r.name, nutzung: r.nutzung, flaeche: r.flaeche, hoehe: r.hoehe, geschoss: ort.geschoss!.get(r.geschoss!)! } })));
    await abgleichen('bauteil', d.bauteile.map((b) => ({ kennung: b.kennung, werte: {
      name: b.name, art: b.art, lage: b.lage, menge: b.menge, einheit: b.einheit, abmessung: b.abmessung, aufbau: b.aufbau, geschoss: (b.geschoss && ort.geschoss!.get(b.geschoss)) || null } })));
    return { schema: d.schema, je, uebersprungen: d.uebersprungen, flaechenAusGeometrie: d.flaechen_aus_geometrie, ohneGeschoss: d.raeume.length - mitGeschoss.length, befehle: liste.length, liste };
  });
}

export function ifcRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  // IFC-Dateien kommen als Ganzes (bis 300 MB)
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 300 * 1024 * 1024 }, (_req, body, fertig) => fertig(null, body));

  app.post('/api/gebaeudemodell/ifc/vorschau', { preHandler: e.nurAngemeldet, bodyLimit: 300 * 1024 * 1024 }, async (req): Promise<Vorschau> => {
    const q = req.query as { projekt?: string; version?: string };
    if (!KENNUNG.test(q.projekt ?? '') || !KENNUNG.test(q.version ?? '')) throw new Ablehnung('Projekt und Version fehlen');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Ablehnung('Die Datei fehlt');
    const { liste, ...vorschau } = await planen(e.db, e.register, req.benutzer!, q.projekt!, q.version!, await lies(req.body));
    const token = randomUUID();
    for (const [k, p] of plaene) if (p.bis < Date.now()) plaene.delete(k);
    plaene.set(token, { wer: req.benutzer!.id, befehle: liste, bis: Date.now() + 30 * 60000 });
    return { token, ...vorschau };
  });

  app.post('/api/gebaeudemodell/ifc/uebernehmen', { preHandler: e.nurAngemeldet }, async (req) => {
    const token = String((req.body as { token?: unknown } | null)?.token ?? '');
    const plan = plaene.get(token);
    if (!plan || plan.wer !== req.benutzer!.id || plan.bis < Date.now()) throw new Ablehnung('Die Vorschau ist abgelaufen – bitte die Datei noch einmal einlesen');
    plaene.delete(token);
    if (plan.befehle.length) await vorgangAusfuehren(e.db, e.register, req.benutzer!, plan.befehle);
    e.nachBefehlen();
    return { ok: true, befehle: plan.befehle.length };
  });
}
