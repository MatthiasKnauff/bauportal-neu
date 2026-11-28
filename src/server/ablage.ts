// Ablage: Verbindung zum Dateiserver über den Dateidienst (eigener Hilfscontainer, Python).
// Die Originale bleiben auf dem Dateiserver; das Bauportal reicht nur durch, was der Benutzer am Projekt sehen darf.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ablageordner, wahlBezug, type Ablagerolle, type Platzhalter } from '../kern/ablageordner';
import { Eingabefehler } from '../kern/modell';
import { ABLAGE_ID } from '../module/verwaltung/beipackzettel';
import type { Modulregister } from '../kern/modul';
import { alsBenutzer, spalte, tabelle, type Db, type Verbindung } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';

// ---------- Geheimnisse: verschlüsselt in der Datenbank, der Schlüssel liegt im Daten-Volume ----------
let schluessel: Buffer | undefined;
function holeSchluessel(): Buffer {
  if (schluessel) return schluessel;
  const ordner = process.env.DATEN_PFAD ?? '/data';
  const datei = path.join(ordner, 'schluessel');
  if (!existsSync(datei)) {
    mkdirSync(ordner, { recursive: true });
    writeFileSync(datei, randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  return (schluessel = readFileSync(datei));
}
export async function geheimnisSetzen(db: Db, name: string, wert: string): Promise<void> {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', holeSchluessel(), iv);
  const text = Buffer.concat([iv, c.update(wert, 'utf8'), c.final(), c.getAuthTag()]).toString('base64');
  await db.query('insert into kern_geheimnis (name, wert) values ($1,$2) on conflict (name) do update set wert = excluded.wert, geaendert = now()', [name, text]);
}
export async function geheimnisLesen(db: Db, name: string): Promise<string | null> {
  const r = await db.query('select wert from kern_geheimnis where name = $1', [name]);
  if (!r.rows[0]) return null;
  const roh = Buffer.from(r.rows[0].wert, 'base64');
  const d = createDecipheriv('aes-256-gcm', holeSchluessel(), roh.subarray(0, 12));
  d.setAuthTag(roh.subarray(roh.length - 16));
  return Buffer.concat([d.update(roh.subarray(12, roh.length - 16)), d.final()]).toString('utf8');
}

// ---------- Dateidienst ----------
class Dienstfehler extends Error { constructor(text: string, public status: number) { super(text); } }
interface Zugang { freigabe: string; benutzer: string; kennwort: string; domaene: string }
export interface Eintrag { name: string; ordner: boolean; groesse: number; geaendert: string; kennung: string }

async function zugang(db: Db): Promise<Zugang> {
  const z = (await db.query('select freigabe, benutzer, domaene from o_ablage where id = $1', [ABLAGE_ID])).rows[0];
  if (!z?.freigabe) throw new Dienstfehler('Die Ablage ist noch nicht eingerichtet (Verwaltung → Ablage)', 409);
  return { freigabe: z.freigabe, benutzer: z.benutzer, domaene: z.domaene, kennwort: (await geheimnisLesen(db, 'ablage.kennwort')) ?? '' };
}
async function dienst(pfad: string, body: unknown, zeit = 60000): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${process.env.DATEIDIENST_URL ?? 'http://dateidienst:8000'}${pfad}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: JSON.stringify(body), signal: AbortSignal.timeout(zeit),
    });
  } catch { throw new Dienstfehler('Der Dateidienst des Bauportals antwortet nicht', 424); }
  if (r.ok) return r;
  const text = ((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? `Dateidienst meldet Fehler ${r.status}`;
  // 5xx vom Dienst heißt: Dateiserver gestört – für die Oberfläche eine Auskunft, kein Ausfall des Bauportals
  throw new Dienstfehler(text, r.status >= 500 ? 424 : r.status === 401 || r.status === 403 ? 424 : r.status);
}
/**
 * Legt eine neue Datei im Projektordner ab – wenn das geht: Ablage eingerichtet, Projekt hat einen Ordner und
 * dieser Server darf dort schreiben (der Testserver nie). Sonst bleibt die Datei im Speicher des Bauportals.
 * Liefert, wo das Original jetzt liegt.
 */
export async function ablegen(db: Db, e: { umgebung: string; projekt: string; projektordner: string | null; unterordner: string; name: string; daten: Buffer; ersetzen?: boolean }): Promise<{ ort: 'ablage' | 'bauportal'; pfad: string }> {
  const z = (await db.query('select freigabe from o_ablage where id = $1', [ABLAGE_ID])).rows[0];
  if (e.umgebung !== 'test' && z?.freigabe && e.projektordner) {
    // ersetzen (Entscheidung E3, 27.11.2026): eine gleichnamige ältere Fassung wandert in den Papierkorb des Projektordners
    const r = (await (await dienst('/schreiben', { zugang: await zugang(db), pfad: sauber(e.projektordner, e.unterordner), name: e.name, inhalt: e.daten.toString('base64'),
      ...(e.ersetzen ? { papierkorb: sauber(e.projektordner, PAPIERKORB) } : {}) }, 300000)).json()) as { name: string };
    return { ort: 'ablage', pfad: sauber(e.unterordner, r.name) };
  }
  const ordner = path.join(process.env.DATEN_PFAD ?? '/data', 'originale', e.projekt);
  mkdirSync(ordner, { recursive: true });
  const datei = `${randomBytes(8).toString('hex')}-${e.name}`;
  writeFileSync(path.join(ordner, datei), e.daten, { flag: 'wx' });
  return { ort: 'bauportal', pfad: datei };
}

/** Ordner im Projektordner, in den ersetzte Fassungen wandern */
export const PAPIERKORB = '_Papierkorb';

/** Der Ordner zu einer Rolle für dieses Projekt (kern/ablageordner): Verwaltung, gemerkte Wahl des Projekts, ab Werk.
 *  Gelesen als der Benutzer (c) – was er nicht sehen darf, zählt nicht. */
export async function ordnerZurRolle(c: Verbindung, rolle: Ablagerolle, q: { projekt: string | null; art?: string; firma?: string | null; gewerk?: string | null }, p: Platzhalter): Promise<string> {
  const r = (await c.query('select ordner, fest from o_ablageregel where rolle = $1 and not geloescht order by id limit 1', [rolle.id])).rows[0] as { ordner: string | null; fest: boolean | null } | undefined;
  const bezug = wahlBezug(r?.ordner?.trim() ? r.ordner : rolle.ordner, q);
  const wahl = q.projekt && q.art ? (await c.query('select ordner from o_ablagewahl where projekt = $1 and art = $2 and coalesce(bezug, \'\') = $3 and not geloescht order by id limit 1', [q.projekt, q.art, bezug])).rows[0]?.ordner as string | undefined : undefined;
  return ablageordner(rolle, { regel: r ? { ordner: r.ordner ?? '', fest: !!r.fest } : undefined, wahl }, p).ordner;
}

/** Platzhalter des Ablageordners aus einem Eintrag: Projektnummer, LV (Nummer Name) mit seinem Gewerk, Firma (Feld firma oder bieter). */
export async function platzhalterAus(c: Verbindung, register: Modulregister, objekt: string, id: string, werte: Record<string, unknown>, projektnummer: string): Promise<Platzhalter & { firmaId: string | null }> {
  const name = async (ziel: string, wert: unknown) => {
    const m = register.modell(ziel);
    return m && typeof wert === 'string' && wert ? String((await c.query(`select ${spalte(m.anzeigeFeld)} as n from ${tabelle(m.name)} where id = $1`, [wert])).rows[0]?.n ?? '') : '';
  };
  const lvId = objekt === 'lv' ? id : (werte.lv as string | undefined);
  const lv = lvId ? (await c.query('select nummer, name, gewerk from o_lv where id = $1', [lvId])).rows[0] as { nummer: string | null; name: string | null; gewerk: string | null } | undefined : undefined;
  // Firma: das Feld „firma“ bzw. „bieter“, wenn es auf einen Kontakt verweist (im Protokoll der Besprechung ist „bieter“ ein Text)
  const firmaFeld = register.modell(objekt)?.felder.find((f) => (f.name === 'firma' || f.name === 'bieter') && f.art === 'verweis' && f.ziel === 'kontakt');
  const firmaId = firmaFeld ? ((werte[firmaFeld.name] as string | undefined) || null) : null;
  return { projekt: projektnummer, lv: lv ? [lv.nummer, lv.name].filter(Boolean).join(' ') : '', gewerk: lv ? await name('gewerk', lv.gewerk) : '',
    firma: await name('kontakt', firmaId), datum: new Date().toISOString().slice(0, 10), firmaId };
}

/** Text (je Seite, Scans über die Texterkennung) und Vorschaubild einer hochgeladenen Datei – der Dateidienst speichert dabei nichts. */
export async function dateiLesen(name: string, daten: Buffer): Promise<{ seiten: string[]; ocr: boolean; vorschau: string }> {
  return (await (await dienst('/lesen', { name, inhalt: daten.toString('base64') }, 300000)).json()) as { seiten: string[]; ocr: boolean; vorschau: string };
}

/** Wörter mit Stelle je Seite und das Seitenbild (LV oder Angebot aus einer Datei) – der Dateidienst speichert dabei nichts. */
export async function woerterLesen(name: string, daten: Buffer): Promise<{ seiten: { bild: string | null; woerter: [number, number, number, number, string][] }[]; ocr: boolean }> {
  return (await (await dienst('/woerter', { name, inhalt: daten.toString('base64') }, 600000)).json()) as { seiten: { bild: string | null; woerter: [number, number, number, number, string][] }[]; ocr: boolean };
}

/** Warum im Projektordner gerade nichts abgelegt werden kann – oder null, wenn es geht. */
export async function ablageHindernis(db: Db, umgebung: string, projektordner: string | null): Promise<string | null> {
  if (umgebung === 'test') return 'Der Testserver legt nichts im Projektordner ab – er darf den Dateiserver nur lesen';
  if (!(await db.query('select freigabe from o_ablage where id = $1', [ABLAGE_ID])).rows[0]?.freigabe) return 'Die Ablage ist noch nicht eingerichtet (Verwaltung → Ablage)';
  return projektordner ? null : 'Diesem Projekt ist noch kein Ordner auf dem Dateiserver zugeordnet (Projekte → Ordner wählen)';
}

/** Vorschaubild einer Datei im Projektordner (für ein Dokument, das auf eine vorhandene Datei verweist – nichts wird kopiert). */
export async function vorschauAusAblage(db: Db, projektordner: string, pfad: string, breite = 600): Promise<Buffer> {
  return Buffer.from(await (await dienst('/vorschau', { zugang: await zugang(db), pfad: sauber(projektordner, pfad), breite }, 60000)).arrayBuffer());
}

/** Das Original wieder holen – als Strom, von dort, wo es abgelegt wurde. */
export async function originalLesen(db: Db, e: { projekt: string; projektordner: string | null; ort: string; pfad: string }): Promise<Readable> {
  if (e.ort === 'ablage') {
    if (!e.projektordner) throw new Dienstfehler('Diesem Projekt ist kein Ordner auf dem Dateiserver mehr zugeordnet', 409);
    return Readable.fromWeb((await dienst('/datei', { zugang: await zugang(db), pfad: sauber(e.projektordner, e.pfad) })).body as never);
  }
  const datei = path.join(process.env.DATEN_PFAD ?? '/data', 'originale', e.projekt, path.basename(e.pfad));
  if (!existsSync(datei)) throw new Dienstfehler('Das Original liegt nicht mehr im Speicher des Bauportals', 404);
  return createReadStream(datei);
}
/** Vorschaubild aus der Datenbank senden (Foto, Dokument) – wer es sehen darf, hat der Aufrufer geprüft. */
export async function vorschauSenden(db: Db, reply: FastifyReply, id: string, darf: boolean): Promise<FastifyReply> {
  const bild = darf ? (await db.query('select bild from kern_vorschau where id = $1', [id])).rows[0]?.bild as Buffer | undefined : undefined;
  if (!bild) return reply.code(404).send({ fehler: 'Das gibt es nicht (mehr)' });
  return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400').header('x-content-type-options', 'nosniff').send(bild);
}
const DATEIARTEN: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
/** Original senden (Foto, Dokument): im Browser zeigen, was er kann, sonst herunterladen. */
export async function originalSenden(db: Db, reply: FastifyReply, d: { projekt: string; ordner: string | null; ort: string; pfad: string; name: string } | undefined): Promise<FastifyReply> {
  if (!d) return reply.code(404).send({ fehler: 'Das gibt es nicht (mehr)' });
  try {
    const strom = await originalLesen(db, { projekt: d.projekt, projektordner: d.ordner || null, ort: d.ort, pfad: d.pfad });
    const art = DATEIARTEN[d.name.split('.').pop()!.toLowerCase()];
    return reply.header('content-type', art ?? 'application/octet-stream').header('content-disposition', `${art ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.name)}`)
      .header('cache-control', 'private, no-store').header('x-content-type-options', 'nosniff').send(strom);
  } catch (err) { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; }
}
export { Dienstfehler };

const sauber = (...teile: string[]) => teile.flatMap((t) => t.split(/[\\/]+/)).filter(Boolean).join('/');

const ARTEN: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain; charset=utf-8' };

export function ablageRouten(app: FastifyInstance, e: { db: Db; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  const { db } = e;
  const nurLesen = e.umgebung === 'test';   // der Testserver verändert die Ablage nie
  const melde = (reply: FastifyReply, err: unknown) => {
    if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message });
    throw err;
  };
  const admin = (req: FastifyRequest) => { if (req.benutzer!.rolle !== 'admin') throw new Ablehnung('Das dürfen nur Administrator:innen'); };
  /** Ordner des Projekts – nur, wenn der Benutzer das Projekt sehen darf (das entscheidet die Datenbank). */
  const projektordner = async (wer: Benutzer, projekt: unknown): Promise<string> => {
    const z = await alsBenutzer(db, wer, async (c) => (await c.query('select ordner from o_projekt where id = $1 and not geloescht', [String(projekt ?? '').match(/^[0-9a-f-]{36}$/i) ? projekt : null])).rows[0]);
    if (!z) throw new Dienstfehler('Das Projekt gibt es nicht oder du darfst es nicht sehen', 404);
    if (!z.ordner) throw new Dienstfehler('Diesem Projekt ist noch kein Ordner auf dem Dateiserver zugeordnet', 409);
    return z.ordner as string;
  };

  // Eingangsordner (Scans vom Kopierer): zeigen, Datei holen, nach dem Ablegen in den Unterordner „verarbeitet“ –
  // der Testserver zeigt und liest nur, verschoben wird nur auf der Produktion.
  const eingang = async (req: FastifyRequest) => {
    const darf = await alsBenutzer(db, req.benutzer!, async (c) => (await c.query("select bp_darf('dokument', 'schreiben', null) as d")).rows[0].d as boolean);
    if (!darf) throw new Ablehnung('Dazu fehlt dir das Recht');
    const z = (await db.query('select eingang, eingang_fertig from o_ablage where id = $1', [ABLAGE_ID])).rows[0];
    if (!z?.eingang) throw new Dienstfehler('Der Eingangsordner ist noch nicht eingerichtet (Verwaltung → Ablage)', 409);
    return { ordner: sauber(z.eingang as string), fertig: sauber(z.eingang as string, (z.eingang_fertig as string) || 'verarbeitet') };
  };
  const dateiImEingang = (q: unknown) => { const n = String((q as { name?: unknown } | null)?.name ?? ''); if (!n || /[\\/]/.test(n)) throw new Ablehnung('Ungültiger Dateiname'); return n; };
  app.get('/api/eingang', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    try {
      const o = await eingang(req);
      const r = (await (await dienst('/liste', { zugang: await zugang(db), pfad: o.ordner })).json()) as { eintraege: Eintrag[] };
      return { dateien: r.eintraege.filter((x) => !x.ordner), nurLesen, fertig: o.fertig };
    } catch (err) { return melde(reply, err); }
  });
  app.get('/api/eingang/datei', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    try {
      const o = await eingang(req), name = dateiImEingang(req.query);
      const r = await dienst('/datei', { zugang: await zugang(db), pfad: sauber(o.ordner, name) });
      return reply.header('content-type', 'application/octet-stream').header('cache-control', 'private, no-store').send(Readable.fromWeb(r.body as never));
    } catch (err) { return melde(reply, err); }
  });
  app.post('/api/eingang/fertig', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    try {
      const o = await eingang(req), name = dateiImEingang(req.body);
      if (nurLesen) return { verschoben: false };
      await dienst('/verschieben', { zugang: await zugang(db), pfad: sauber(o.ordner, name), nach: o.fertig });
      return { verschoben: true };
    } catch (err) { return melde(reply, err); }
  });

  app.get('/api/ablage/zustand', { preHandler: e.nurAngemeldet }, async () => {
    const z = (await db.query('select freigabe from o_ablage where id = $1', [ABLAGE_ID])).rows[0];
    return { eingerichtet: !!z?.freigabe, kennwortGesetzt: (await geheimnisLesen(db, 'ablage.kennwort')) !== null, nurLesen };
  });

  app.post('/api/ablage/kennwort', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const k = (req.body as { kennwort?: unknown } | null)?.kennwort;
    if (typeof k !== 'string' || !k) throw new Eingabefehler({ kennwort: 'Bitte das Kennwort eintragen' });
    await geheimnisSetzen(db, 'ablage.kennwort', k);
    return { ok: true };
  });

  app.post('/api/ablage/pruefen', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    admin(req);
    try {
      const r = (await (await dienst('/liste', { zugang: await zugang(db), pfad: '' })).json()) as { eintraege: Eintrag[] };
      return { ok: true, ordner: r.eintraege.filter((x) => x.ordner).length, dateien: r.eintraege.filter((x) => !x.ordner).length };
    } catch (err) { return melde(reply, err); }
  });

  // Ordner der ganzen Freigabe durchblättern, um einem Projekt seinen Ordner zuzuordnen – für alle, die Projekte ändern dürfen.
  app.get('/api/ablage/ordner', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const darf = await alsBenutzer(db, req.benutzer!, async (c) => (await c.query("select bp_darf('projekt', 'schreiben', null) as d")).rows[0].d as boolean);
    if (!darf) throw new Ablehnung('Dazu fehlt dir das Recht');
    try {
      const r = (await (await dienst('/liste', { zugang: await zugang(db), pfad: sauber(String((req.query as { pfad?: string }).pfad ?? '')) })).json()) as { eintraege: Eintrag[] };
      return { ordner: r.eintraege.filter((x) => x.ordner).map((x) => x.name) };
    } catch (err) { return melde(reply, err); }
  });

  app.get('/api/ablage/liste', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const q = req.query as { projekt?: string; pfad?: string };
    try {
      const ordner = await projektordner(req.benutzer!, q.projekt);
      return await (await dienst('/liste', { zugang: await zugang(db), pfad: sauber(ordner, q.pfad ?? '') })).json();
    } catch (err) { return melde(reply, err); }
  });

  // Alle Dateien des Projektordners mit Unterordnern (für „Alle Dateien“: filtern nach Art, Zeit, Ordner, Suche)
  app.get('/api/ablage/alle', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const q = req.query as { projekt?: string };
    try {
      const ordner = await projektordner(req.benutzer!, q.projekt);
      return await (await dienst('/alle', { zugang: await zugang(db), pfad: sauber(ordner, '') }, 120000)).json();
    } catch (err) { return melde(reply, err); }
  });

  // Vorschaubild einer Datei (PDF: erste Seite, Bilder verkleinert) – erzeugt vom Dateidienst, nur das Vorschaubild kommt in
  // die Datenbank (kern_vorschau). Der Schlüssel enthält Pfad, Änderungszeit und Breite: ändert sich die Datei, entsteht ein neues.
  const BREITEN = [160, 320, 640];
  app.get('/api/ablage/vorschau', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const q = req.query as { projekt?: string; pfad?: string; geaendert?: string; breite?: string };
    const breite = BREITEN.find((b) => b >= Number(q.breite ?? 0)) ?? BREITEN.at(-1)!;
    try {
      const ordner = await projektordner(req.benutzer!, q.projekt);
      const pfad = sauber(ordner, q.pfad ?? '');
      const h = createHash('sha256').update(`ablage|${pfad}|${q.geaendert ?? ''}|${breite}`).digest('hex');
      const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
      let bild = (await db.query('select bild from kern_vorschau where id = $1', [id])).rows[0]?.bild as Buffer | undefined;
      if (!bild) {
        bild = Buffer.from(await (await dienst('/vorschau', { zugang: await zugang(db), pfad, breite }, 60000)).arrayBuffer());
        await db.query('insert into kern_vorschau (id, bild) values ($1, $2) on conflict (id) do nothing', [id, bild]);
      }
      return reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=604800, immutable').header('X-Content-Type-Options', 'nosniff').send(bild);
    } catch (err) { return melde(reply, err); }
  });

  app.get('/api/ablage/datei', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const q = req.query as { projekt?: string; pfad?: string; laden?: string };
    try {
      const ordner = await projektordner(req.benutzer!, q.projekt);
      const r = await dienst('/datei', { zugang: await zugang(db), pfad: sauber(ordner, q.pfad ?? '') });
      const name = sauber(q.pfad ?? '').split('/').pop() ?? 'datei';
      const art = ARTEN[name.split('.').pop()!.toLowerCase()];
      reply.header('Content-Type', art ?? 'application/octet-stream').header('Content-Length', r.headers.get('content-length') ?? undefined)
        .header('Content-Disposition', `${art && !q.laden ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`)
        .header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff');   // im Browser gezeigt werden nur PDF, Bilder und reiner Text
      return reply.send(Readable.fromWeb(r.body as never));
    } catch (err) { return melde(reply, err); }
  });
}
