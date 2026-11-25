// Druckwerk auf dem Server: baut die Seite aus denselben Bausteinen wie die Vorschau (kern/druck.ts) und lässt den
// Druckdienst (Hilfscontainer mit Chromium) daraus das PDF machen. Gelesen wird als der Benutzer – wer ein Objekt
// nicht sehen darf, bekommt auch keinen Ausdruck davon.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { dateiname, druckSeite, listenfolge, type Druckdaten, type Einstellungen } from '../kern/druck';
import { KENNUNG, type ObjektModell, type Werte } from '../kern/modell';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { alsBenutzer, spalte, tabelle, type Db } from './db';
import { Ablehnung, befehlAusfuehren } from './protokoll';
import { Dienstfehler, ablageHindernis, ablegen } from './ablage';
import type { Benutzer } from './anmeldung';

/** Zeile aus der Datenbank -> Werte des Modells (Zahlen kommen als Text an). */
export const werteAus = (m: ObjektModell, z: Record<string, unknown> | undefined): Werte =>
  Object.fromEntries(m.felder.map((f) => [f.name, f.art === 'zahl' && z?.[f.name] != null ? Number(z[f.name]) : ((z?.[f.name] ?? null) as Werte[string])]));

export async function seiteBauen(db: Db, register: Modulregister, wer: Benutzer, ausdruckId: string, objektId: string): Promise<{ html: string; name: string; projekt: string | null; projektordner: string | null; ordner: string }> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId);
  if (!a) throw new Ablehnung('Diesen Ausdruck gibt es nicht');
  const m = register.modell(a.objekt)!;
  const t = await alsBenutzer(db, wer, async (c) => {
    const zeile = (await c.query(`select * from ${tabelle(m.name)} where id = $1 and not geloescht`, [objektId])).rows[0];
    if (!zeile) throw new Ablehnung(`${m.titel} nicht gefunden`);
    const werte = werteAus(m, zeile);
    // Verweise der gedruckten Felder vorab auflösen
    const namen = new Map<string, string>();
    for (const f of m.felder.filter((x) => x.art === 'verweis' && werte[x.name])) {
      const ziel = register.modell(f.ziel!)!;
      const z = (await c.query(`select * from ${tabelle(ziel.name)} where id = $1`, [werte[f.name]])).rows[0];
      namen.set(`${ziel.name}:${werte[f.name]}`, String(z?.[ziel.anzeigeFeld] ?? ''));
    }
    // Listen: die Einträge, die am Objekt hängen – gelesen als der Benutzer, in der Reihenfolge des Berichts
    const kinder = new Map<string, { id: string; werte: Werte }[]>();
    const bildIds: string[] = [];
    for (const b of a.bloecke) if (b.art === 'liste' || b.art === 'bilder') {
      const k = register.modell(b.objekt)!;
      const filter = Object.entries(b.art === 'liste' ? b.filter ?? {} : {});
      const zeilen = (await c.query(`select * from ${tabelle(k.name)} where ${spalte(b.ueber)} = $1 and not geloescht${filter.map(([n], i) => ` and ${spalte(n)} = $${i + 2}`).join('')}`, [objektId, ...filter.map(([, w]) => w)])).rows
        .map((z) => ({ id: z.id as string, werte: werteAus(k, z) })).sort(listenfolge);
      kinder.set(b.id, zeilen);
      if (b.art === 'bilder') {
        bildIds.push(...zeilen.map((z) => z.id));   // welche Fotos der Benutzer sehen darf, steht damit fest
        continue;
      }
      for (const f of k.felder.filter((x) => x.art === 'verweis' && b.spalten.includes(x.name))) {
        const ziel = register.modell(f.ziel!)!;
        const ids = [...new Set(zeilen.map((z) => z.werte[f.name]).filter(Boolean))];
        if (ids.length) for (const z of (await c.query(`select id, ${spalte(ziel.anzeigeFeld)} as name from ${tabelle(ziel.name)} where id = any($1)`, [ids])).rows) namen.set(`${ziel.name}:${z.id}`, String(z.name ?? ''));
      }
    }
    const projekt = m.projektFeld && m.projektFeld !== 'id' ? namen.get(`projekt:${werte[m.projektFeld]}`) ?? '' : '';
    const buero = werteAus(register.modell('buero')!, (await c.query('select * from o_buero where id = $1', [BUERO_ID])).rows[0]);
    const e: Einstellungen = {};
    // bei doppelten Einträgen (zwei Geräte ohne Netz) gilt überall derselbe: der mit der kleinsten Kennung
    for (const r of (await c.query('select stelle, wert from o_druckeinstellung where ausdruck = $1 and not geloescht order by id desc', [a.id])).rows) e[r.stelle] = r.wert;
    const projektId = m.projektFeld && m.projektFeld !== 'id' ? (werte[m.projektFeld] as string | null) : null;
    const projektordner = projektId ? ((await c.query('select ordner from o_projekt where id = $1', [projektId])).rows[0]?.ordner as string | undefined) || null : null;
    return { werte, buero, projekt, namen, kinder, e, bildIds, projektId, projektordner };
  });
  // Im PDF steckt das Vorschaubild selbst – der Druckdienst lädt nichts nach
  const bilder = new Map<string, string>();
  if (t.bildIds.length) for (const v of (await db.query('select id, bild from kern_vorschau where id = any($1)', [t.bildIds])).rows) bilder.set(v.id, `data:image/jpeg;base64,${(v.bild as Buffer).toString('base64')}`);
  const d: Druckdaten = { werte: t.werte, buero: t.buero, projekt: t.projekt, verweis: (ziel, id) => t.namen.get(`${ziel}:${id}`) ?? '', kinder: (id) => t.kinder.get(id) ?? [], modell: (o) => register.modell(o)!, bild: (id) => bilder.get(id) ?? '' };
  return { html: druckSeite(a, m, d, t.e), name: dateiname(a, m, d), projekt: t.projektId, projektordner: t.projektordner, ordner: (t.e['seite.ordner'] || a.ordner || '').trim() };
}

/** Verzeichnis: viele Einträge eines Objekts als Liste – gelesen als der Benutzer, in der übergebenen Reihenfolge. */
export async function verzeichnisBauen(db: Db, register: Modulregister, wer: Benutzer, ausdruckId: string, ids: string[], filter: string): Promise<{ html: string; name: string }> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId && x.verzeichnis);
  if (!a) throw new Ablehnung('Diesen Ausdruck gibt es nicht');
  const m = register.modell(a.objekt)!;
  const t = await alsBenutzer(db, wer, async (c) => {
    const reihe = new Map(ids.map((id, i) => [id, i]));
    const zeilen = (await c.query(`select * from ${tabelle(m.name)} where id = any($1) and not geloescht`, [ids])).rows
      .map((z) => ({ id: z.id as string, werte: werteAus(m, z) })).sort((x, y) => reihe.get(x.id)! - reihe.get(y.id)!);
    const namen = new Map<string, string>();
    const spalten = new Set(a.bloecke.flatMap((b) => (b.art === 'verzeichnis' ? b.spalten : [])));
    for (const f of m.felder.filter((x) => x.art === 'verweis' && spalten.has(x.name))) {
      const ziel = register.modell(f.ziel!)!;
      const v = [...new Set(zeilen.map((z) => z.werte[f.name]).filter(Boolean))];
      if (v.length) for (const z of (await c.query(`select id, ${spalte(ziel.anzeigeFeld)} as name from ${tabelle(ziel.name)} where id = any($1)`, [v])).rows) namen.set(`${ziel.name}:${z.id}`, String(z.name ?? ''));
    }
    const buero = werteAus(register.modell('buero')!, (await c.query('select * from o_buero where id = $1', [BUERO_ID])).rows[0]);
    const e: Einstellungen = {};
    for (const r of (await c.query('select stelle, wert from o_druckeinstellung where ausdruck = $1 and not geloescht order by id desc', [a.id])).rows) e[r.stelle] = r.wert;
    return { zeilen, namen, buero, e };
  });
  const d: Druckdaten = { werte: {}, buero: t.buero, projekt: '', verweis: (ziel, id) => t.namen.get(`${ziel}:${id}`) ?? '', modell: (o) => register.modell(o)!, bild: () => '',
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
  await befehlAusfuehren(db, register, wer, { id: randomUUID(), gesehen: 0, objekt: a.objekt, art: 'aendern', objektId, werte: { [a.vermerk]: `${name} · ${zeit}${abgelegt ? ' · im Projektordner' : ''}` } });
}

export function druckRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  app.post('/api/druck/pdf', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { ausdruck?: string; objekt?: string; ids?: unknown; filter?: unknown };
    if (Array.isArray(b.ids)) {   // Verzeichnis: viele Einträge
      const ids = b.ids.map(String).filter((x) => KENNUNG.test(x)).slice(0, 10000);
      if (!ids.length) throw new Ablehnung('Was gedruckt werden soll, fehlt');
      const v = await verzeichnisBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), ids, String(b.filter ?? ''));
      const pdf = await pdfAus(v.html);
      return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(v.name)}`).send(pdf);
    }
    if (!KENNUNG.test(b.objekt ?? '')) throw new Ablehnung('Was gedruckt werden soll, fehlt');
    const { html, name } = await seiteBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!);
    const pdf = await pdfAus(html);
    await vermerken(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!, name, false);
    e.nachBefehlen();
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`).send(pdf);
  });

  // Das PDF in den Projektordner legen – als neue Datei, nie über eine vorhandene
  app.post('/api/druck/ablegen', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { ausdruck?: string; objekt?: string };
    if (!KENNUNG.test(b.objekt ?? '')) throw new Ablehnung('Was gedruckt werden soll, fehlt');
    const s = await seiteBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!);
    if (!s.projekt) throw new Ablehnung('Dieser Ausdruck gehört zu keinem Projekt');
    const hindernis = await ablageHindernis(e.db, e.umgebung, s.projektordner);
    if (hindernis) throw new Ablehnung(hindernis);
    try {
      const wo = await ablegen(e.db, { umgebung: e.umgebung, projekt: s.projekt, projektordner: s.projektordner, unterordner: s.ordner, name: s.name, daten: await pdfAus(s.html) });
      await vermerken(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!, s.name, true);
      e.nachBefehlen();
      return { pfad: wo.pfad };
    } catch (err) { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; }
  });
}
