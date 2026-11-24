// Ablage: Verbindung zum Dateiserver über den Dateidienst (eigener Hilfscontainer, Python).
// Die Originale bleiben auf dem Dateiserver; das Bauportal reicht nur durch, was der Benutzer am Projekt sehen darf.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Eingabefehler } from '../kern/modell';
import { ABLAGE_ID } from '../module/verwaltung/beipackzettel';
import { alsBenutzer, type Db } from './db';
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
export async function ablegen(db: Db, e: { umgebung: string; projekt: string; projektordner: string | null; unterordner: string; name: string; daten: Buffer }): Promise<{ ort: 'ablage' | 'bauportal'; pfad: string }> {
  const z = (await db.query('select freigabe from o_ablage where id = $1', [ABLAGE_ID])).rows[0];
  if (e.umgebung !== 'test' && z?.freigabe && e.projektordner) {
    const r = (await (await dienst('/schreiben', { zugang: await zugang(db), pfad: sauber(e.projektordner, e.unterordner), name: e.name, inhalt: e.daten.toString('base64') }, 300000)).json()) as { name: string };
    return { ort: 'ablage', pfad: sauber(e.unterordner, r.name) };
  }
  const ordner = path.join(process.env.DATEN_PFAD ?? '/data', 'originale', e.projekt);
  mkdirSync(ordner, { recursive: true });
  const datei = `${randomBytes(8).toString('hex')}-${e.name}`;
  writeFileSync(path.join(ordner, datei), e.daten, { flag: 'wx' });
  return { ort: 'bauportal', pfad: datei };
}

/** Warum im Projektordner gerade nichts abgelegt werden kann – oder null, wenn es geht. */
export async function ablageHindernis(db: Db, umgebung: string, projektordner: string | null): Promise<string | null> {
  if (umgebung === 'test') return 'Der Testserver legt nichts im Projektordner ab – er darf den Dateiserver nur lesen';
  if (!(await db.query('select freigabe from o_ablage where id = $1', [ABLAGE_ID])).rows[0]?.freigabe) return 'Die Ablage ist noch nicht eingerichtet (Verwaltung → Ablage)';
  return projektordner ? null : 'Diesem Projekt ist noch kein Ordner auf dem Dateiserver zugeordnet (Projekte → Ordner wählen)';
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
