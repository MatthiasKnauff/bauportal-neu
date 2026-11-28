// Druckwerk auf dem Server: baut die Seite aus denselben Bausteinen wie die Vorschau (kern/druck.ts) und lässt den
// Druckdienst (Hilfscontainer mit Chromium) daraus das PDF machen. Gelesen wird als der Benutzer – wer ein Objekt
// nicht sehen darf, bekommt auch keinen Ausdruck davon.
import { DRUCKQUELLEN } from '../module/druckquellen';
import { wirksam } from '../kern/erben';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { alleBloecke, ohneTeile, dateiname, druckSeite, druckSeiten, listenfolge, passt, verzeichnisSpalten, type Druckdaten, type Einstellungen } from '../kern/druck';
import { KENNUNG, type ObjektModell, type Werte } from '../kern/modell';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { alsBenutzer, spalte, tabelle, type Absender, type Db } from './db';
import { Ablehnung, befehlAusfuehren, ALLES_GESEHEN } from './protokoll';
import { logoDaten } from './logo';
import { Dienstfehler, ablageHindernis, ablegen, ordnerZurRolle, platzhalterAus } from './ablage';
import type { Benutzer } from './anmeldung';

/** Zeile aus der Datenbank -> Werte des Modells (Zahlen kommen als Text an). */
export const werteAus = (m: ObjektModell, z: Record<string, unknown> | undefined): Werte =>
  Object.fromEntries(m.felder.map((f) => [f.name, f.art === 'zahl' && z?.[f.name] != null ? Number(z[f.name]) : ((z?.[f.name] ?? null) as Werte[string])]));

export async function seiteBauen(db: Db, register: Modulregister, wer: Absender, ausdruckId: string, objektId: string, ohne: string[] = []): Promise<{ html: string; name: string; projekt: string | null; projektordner: string | null; ordner: string; d: Druckdaten; e: Einstellungen }> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId);
  if (!a) throw new Ablehnung('Diesen Ausdruck gibt es nicht');
  const m = register.modell(a.objekt)!;
  const t = await alsBenutzer(db, wer, async (c) => {
    const zeile = (await c.query(`select * from ${tabelle(m.name)} where id = $1 and not geloescht`, [objektId])).rows[0];
    if (!zeile) throw new Ablehnung(`${m.titel} nicht gefunden`);
    let werte = werteAus(m, zeile);
    // Erbende Felder (z. B. LV ← Projekt ← Büro): gedruckt wird der wirksame Wert
    if (m.erben) {
      const ebenen: (Werte | undefined)[] = [];
      for (const e of m.erben.ebenen) {
        const ziel = register.modell(e.objekt)!, id = e.ueber ? werte[e.ueber] : ziel.einzeln;
        const z = id ? (await c.query(`select * from ${tabelle(ziel.name)} where id = $1 and not geloescht`, [id])).rows[0] : undefined;
        ebenen.push(z ? werteAus(ziel, z) : undefined);
      }
      werte = wirksam(m, werte, ebenen).werte;
    }
    // Verweise der gedruckten Felder vorab auflösen
    const namen = new Map<string, string>();
    for (const f of m.felder.filter((x) => (x.art === 'verweis' || (x.art === 'mehrfach' && x.ziel)) && werte[x.name])) {   // auch mehrere Verweise („a,b“)
      const ziel = register.modell(f.ziel!)!;
      for (const id of String(werte[f.name]).split(',').filter(Boolean)) {
        const z = (await c.query(`select * from ${tabelle(ziel.name)} where id = $1`, [id])).rows[0];
        namen.set(`${ziel.name}:${id}`, String(z?.[ziel.anzeigeFeld] ?? ''));
      }
    }
    // Listen: die Einträge, die am Objekt hängen – gelesen als der Benutzer, in der Reihenfolge des Berichts
    const kinder = new Map<string, { id: string; werte: Werte }[]>();
    const bildIds: string[] = [];
    // (aller Vorlagen – welche gedruckt wird, entscheidet die Einstellung des Büros)
    for (const b of alleBloecke(a)) if (b.art === 'liste' || b.art === 'bilder' || b.art === 'lv' || b.art === 'kasten') {
      const k = register.modell(b.objekt)!;
      const filter = Object.entries(b.art === 'liste' ? b.filter ?? {} : {});
      const ohne = b.art === 'lv' && b.ohne ? ` and ${spalte(b.ohne)} is null` : '';
      const zeilen = (await c.query(`select * from ${tabelle(k.name)} where ${spalte(b.ueber)} = $1 and not geloescht${ohne}${filter.map(([n], i) => ` and ${spalte(n)} = $${i + 2}`).join('')}`, [objektId, ...filter.map(([, w]) => w)])).rows
        .map((z) => ({ id: z.id as string, werte: werteAus(k, z) })).filter((z) => passt(b, z.werte)).sort(listenfolge);
      kinder.set(b.id, zeilen);
      if (b.art === 'lv') {   // Reihenfolge nach OZ, keine Verweise; Bilder je Position (Skizzen, Fotos) – nur die, die der Benutzer sehen darf
        if (b.bilder && zeilen.length) {
          const q = register.modell(b.bilder.objekt)!;
          const bz = (await c.query(`select * from ${tabelle(q.name)} where ${spalte(b.bilder.bezug)} = any($1) and not geloescht order by id`, [zeilen.map((z) => z.id)])).rows.map((z) => ({ id: z.id as string, werte: werteAus(q, z) }));
          kinder.set(`${b.id}.bilder`, bz); bildIds.push(...bz.map((z) => z.id));
        }
        continue;
      }
      if (b.art === 'bilder') {
        bildIds.push(...zeilen.map((z) => z.id));   // welche Fotos der Benutzer sehen darf, steht damit fest
        continue;
      }
      for (const f of k.felder.filter((x) => x.art === 'verweis' && (b.art === 'kasten' || b.spalten.includes(x.name)))) {
        const ziel = register.modell(f.ziel!)!;
        const ids = [...new Set(zeilen.map((z) => z.werte[f.name]).filter(Boolean))];
        if (ids.length) for (const z of (await c.query(`select id, ${spalte(ziel.anzeigeFeld)} as name from ${tabelle(ziel.name)} where id = any($1)`, [ids])).rows) namen.set(`${ziel.name}:${z.id}`, String(z.name ?? ''));
      }
    }
    // Berechnete Blöcke: was ihre Druckquellen brauchen, einmal lesen (als der Benutzer) – gerechnet wird wie im Browser
    const geholt = new Map<string, { id: string; werte: Werte }[]>();
    for (const b of alleBloecke(a)) if (b.art === 'berechnet') for (const x of DRUCKQUELLEN[b.quelle]?.braucht ?? []) {
      const wert = x.fest ?? String(x.wert === 'id' ? objektId : werte[x.wert] ?? ''), k = `${x.objekt}|${x.feld}|${wert}`;
      if (geholt.has(k) || !wert) continue;
      const ziel = register.modell(x.objekt); if (!ziel) continue;
      geholt.set(k, (await c.query(`select * from ${tabelle(ziel.name)} where ${x.feld === 'id' ? 'id' : spalte(x.feld)} = $1 and not geloescht`, [wert])).rows.map((z) => ({ id: z.id as string, werte: werteAus(ziel, z) })));
    }
    const projekt = m.projektFeld && m.projektFeld !== 'id' ? namen.get(`projekt:${werte[m.projektFeld]}`) ?? '' : '';
    const buero = werteAus(register.modell('buero')!, (await c.query('select * from o_buero where id = $1', [BUERO_ID])).rows[0]);
    const e: Einstellungen = {};
    // bei doppelten Einträgen (zwei Geräte ohne Netz) gilt überall derselbe: der mit der kleinsten Kennung
    for (const r of (await c.query('select stelle, wert from o_druckeinstellung where ausdruck = $1 and not geloescht order by id desc', [a.id])).rows) e[r.stelle] = r.wert;
    Object.assign(e, ohneTeile(a, ohne));   // für diesen Ausdruck weggelassene Teile (z. B. ohne Fotos, für die Bauherr:in)
    const projektId = m.projektFeld && m.projektFeld !== 'id' ? (werte[m.projektFeld] as string | null) : null;
    const pz = projektId ? (await c.query('select * from o_projekt where id = $1', [projektId])).rows[0] : undefined;
    const projektordner = (pz?.ordner as string | undefined) || null;
    // das Projekt selbst (Platzhalter {projekt.feld}), seine Verweise aufgelöst – z. B. die Bauherrschaft
    const pm = register.modell('projekt')!, projektwerte = pz ? werteAus(pm, pz) : undefined;
    if (projektwerte) for (const f of pm.felder.filter((x) => x.art === 'verweis' && projektwerte[x.name])) {
      const ziel = register.modell(f.ziel!)!;
      const z = (await c.query(`select ${spalte(ziel.anzeigeFeld)} as name from ${tabelle(ziel.name)} where id = $1`, [projektwerte[f.name]])).rows[0];
      namen.set(`${ziel.name}:${projektwerte[f.name]}`, String(z?.name ?? ''));
    }
    // wohin „Im Projektordner ablegen“ das PDF legt: die Rolle des Ausdrucks (kern/ablageordner)
    const rolle = a.rolle ? register.ablagerolle(a.rolle) : undefined;
    const ordner = rolle && projektId ? await ordnerZurRolle(c, rolle, { projekt: projektId }, await platzhalterAus(c, register, m.name, objektId, werte, String(pz?.nummer ?? ''))) : '';
    return { werte, buero, projekt, namen, kinder, e, bildIds, projektId, projektordner, projektwerte, geholt, ordner };
  });
  // Im PDF steckt das Vorschaubild selbst – der Druckdienst lädt nichts nach
  const bilder = new Map<string, string>();
  if (t.bildIds.length) for (const v of (await db.query('select id, bild from kern_vorschau where id = any($1)', [t.bildIds])).rows) bilder.set(v.id, `data:image/jpeg;base64,${(v.bild as Buffer).toString('base64')}`);
  const d: Druckdaten = { werte: t.werte, buero: t.buero, logo: await logoDaten(db), projekt: t.projekt, projektwerte: t.projektwerte, verweis: (ziel, id) => t.namen.get(`${ziel}:${id}`) ?? '', kinder: (id) => t.kinder.get(id) ?? [], modell: (o) => register.modell(o)!, bild: (id) => bilder.get(id) ?? '',
    berechnet: (blockId) => { const b = alleBloecke(a).find((x) => x.id === blockId); const q = b?.art === 'berechnet' ? DRUCKQUELLEN[b.quelle] : undefined;
      return q ? q.tabellen((o, f, w) => t.geholt.get(`${o}|${f}|${w}`) ?? [], { id: objektId, werte: t.werte }) : []; } };
  return { html: druckSeite(a, m, d, t.e), name: dateiname(a, m, d), projekt: t.projektId, projektordner: t.projektordner, ordner: t.ordner, d, e: t.e };
}

/** Mehrere Einträge in einem PDF (z. B. ausgewählte Tagesberichte) – jeder wie einzeln gedruckt, nacheinander. */
export async function seitenBauen(db: Db, register: Modulregister, wer: Benutzer, ausdruckId: string, ids: string[], ohne: string[] = []): Promise<{ html: string; name: string }> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId);
  if (!a) throw new Ablehnung('Diesen Ausdruck gibt es nicht');
  const m = register.modell(a.objekt)!;
  const teile: Seite[] = [];
  for (const id of ids) teile.push(await seiteBauen(db, register, wer, ausdruckId, id, ohne));
  if (teile.length === 1) return { html: teile[0]!.html, name: teile[0]!.name };
  return { html: druckSeiten(a, m, teile.map((t) => t.d), teile[0]!.e), name: `${m.titelMehrzahl} (${teile.length}).pdf` };
}
type Seite = Awaited<ReturnType<typeof seiteBauen>>;

/** Verzeichnis: viele Einträge eines Objekts als Liste – gelesen als der Benutzer, in der übergebenen Reihenfolge. */
export async function verzeichnisBauen(db: Db, register: Modulregister, wer: Benutzer, ausdruckId: string, ids: string[], filter: string): Promise<{ html: string; name: string }> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId && x.verzeichnis);
  if (!a) throw new Ablehnung('Diesen Ausdruck gibt es nicht');
  const m = register.modell(a.objekt)!;
  const t = await alsBenutzer(db, wer, async (c) => {
    const reihe = new Map(ids.map((id, i) => [id, i]));
    const zeilen = (await c.query(`select * from ${tabelle(m.name)} where id = any($1) and not geloescht`, [ids])).rows
      .map((z) => ({ id: z.id as string, werte: werteAus(m, z) })).sort((x, y) => reihe.get(x.id)! - reihe.get(y.id)!);
    const e: Einstellungen = {};
    for (const r of (await c.query('select stelle, wert from o_druckeinstellung where ausdruck = $1 and not geloescht order by id desc', [a.id])).rows) e[r.stelle] = r.wert;
    // verwiesene Einträge der Spalten („bieter“ und „bieter.telefon“): einmal ganz laden – Name und Werte
    const ziele = new Map<string, Werte>();
    const spalten = a.bloecke.flatMap((b) => (b.art === 'verzeichnis' ? verzeichnisSpalten(b, m, e, (o) => register.modell(o)) : []));
    for (const f of m.felder.filter((x) => x.art === 'verweis' && spalten.some((n) => n.split('.')[0] === x.name))) {
      const ziel = register.modell(f.ziel!)!;
      const v = [...new Set(zeilen.map((z) => z.werte[f.name]).filter(Boolean))];
      if (v.length) for (const z of (await c.query(`select * from ${tabelle(ziel.name)} where id = any($1)`, [v])).rows) ziele.set(`${ziel.name}:${z.id}`, werteAus(ziel, z));
    }
    const buero = werteAus(register.modell('buero')!, (await c.query('select * from o_buero where id = $1', [BUERO_ID])).rows[0]);
    return { zeilen, ziele, buero, e };
  });
  const d: Druckdaten = { werte: {}, buero: t.buero, logo: await logoDaten(db), projekt: '', verweis: (ziel, id) => String(t.ziele.get(`${ziel}:${id}`)?.[register.modell(ziel)!.anzeigeFeld] ?? ''), zielwerte: (ziel, id) => t.ziele.get(`${ziel}:${id}`), modell: (o) => register.modell(o)!, bild: () => '',
    kinder: (id) => (a.bloecke.find((b) => b.id === id)?.art === 'verzeichnis' ? t.zeilen : []),
    extra: { anzahl: `${t.zeilen.length} ${t.zeilen.length === 1 ? m.titel : m.titelMehrzahl}`, filter: filter.slice(0, 500), datum: new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) } };
  return { html: druckSeite(a, m, d, t.e), name: dateiname(a, m, d) };
}

export async function pdfAus(html: string): Promise<Buffer> {
  let r: Response;
  try {
    r = await fetch(`${process.env.DRUCKDIENST_URL ?? 'http://druckdienst:8000'}/pdf`, {
      method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: html, signal: AbortSignal.timeout(90000),
    });
  } catch { throw new Ablehnung('Der Druckdienst des Bauportals antwortet nicht'); }
  if (!r.ok) throw new Ablehnung(((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? `Der Druckdienst meldet Fehler ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Vermerk am Objekt, dass ein PDF entstanden ist („Datei · Zeitpunkt“) – ein Befehl wie jede Änderung. */
async function vermerken(db: Db, register: Modulregister, wer: Benutzer, ausdruckId: string, objektId: string, name: string, abgelegt: boolean): Promise<void> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId);
  if (!a?.vermerk) return;
  const zeit = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  await befehlAusfuehren(db, register, wer, { id: randomUUID(), gesehen: ALLES_GESEHEN, objekt: a.objekt, art: 'aendern', objektId, werte: { [a.vermerk]: `${name} · ${zeit}${abgelegt ? ' · im Projektordner' : ''}` } });
}

/** Weggelassene Teile aus der Anfrage (Titel der Teile des Ausdrucks). */
const ohneAus = (b: { ohne?: unknown }) => (Array.isArray(b.ohne) ? b.ohne.map(String).slice(0, 30) : []);

export function druckRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  app.post('/api/druck/pdf', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { ausdruck?: string; objekt?: string; ids?: unknown; filter?: unknown; ohne?: unknown };
    if (Array.isArray(b.ids)) {   // Verzeichnis: viele Einträge als Liste – sonst mehrere Einträge nacheinander in einem PDF
      const ids = b.ids.map(String).filter((x) => KENNUNG.test(x)).slice(0, 10000);
      if (!ids.length) throw new Ablehnung('Was gedruckt werden soll, fehlt');
      if (!e.register.ausdrucke.find((x) => x.id === b.ausdruck)?.verzeichnis) {
        if (ids.length > 200) throw new Ablehnung('Höchstens 200 Einträge auf einmal');
        const v = await seitenBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), ids, ohneAus(b));
        return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(v.name)}`).send(await pdfAus(v.html));
      }
      const v = await verzeichnisBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), ids, String(b.filter ?? ''));
      const pdf = await pdfAus(v.html);
      return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(v.name)}`).send(pdf);
    }
    if (!KENNUNG.test(b.objekt ?? '')) throw new Ablehnung('Was gedruckt werden soll, fehlt');
    const { html, name } = await seiteBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!, ohneAus(b));
    const pdf = await pdfAus(html);
    await vermerken(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!, name, false);
    e.nachBefehlen();
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`).send(pdf);
  });

  // Das PDF in den Projektordner legen – als neue Datei; nur Ausdrucke mit „ersetzen“ (GEPRÜFT) ersetzen eine ältere Fassung
  app.post('/api/druck/ablegen', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { ausdruck?: string; objekt?: string; ohne?: unknown };
    if (!KENNUNG.test(b.objekt ?? '')) throw new Ablehnung('Was gedruckt werden soll, fehlt');
    const s = await seiteBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!, ohneAus(b));
    if (!s.projekt) throw new Ablehnung('Dieser Ausdruck gehört zu keinem Projekt');
    const hindernis = await ablageHindernis(e.db, e.umgebung, s.projektordner);
    if (hindernis) throw new Ablehnung(hindernis);
    try {
      const wo = await ablegen(e.db, { umgebung: e.umgebung, projekt: s.projekt, projektordner: s.projektordner, unterordner: s.ordner, name: s.name, daten: await pdfAus(s.html),
        ersetzen: !!e.register.ausdrucke.find((x) => x.id === b.ausdruck)?.ersetzen });
      await vermerken(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!, s.name, true);
      e.nachBefehlen();
      return { pfad: wo.pfad };
    } catch (err) { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; }
  });
}
