// Dokumente ablegen (PDF, Scan, Foto ins Fenster gezogen): erst lesen – Text und Vorschaubild über den Dateidienst
// (Scans mit Texterkennung, nichts wird dabei gespeichert) –, dann ablegen: das Original in den Projektordner
// (ablage.ts: ablegen; der Testserver behält es im Speicher des Bauportals), das Vorschaubild in die Datenbank,
// das Dokument als Objekt wie alle anderen (Löschen, Rückgängig). Was daraus wird (Rechnung, Angebot …), legt die Oberfläche an.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { KENNUNG } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { Dienstfehler, ablegen, dateiLesen, originalSenden, vorschauSenden } from './ablage';
import { Ablehnung, befehlAusfuehren } from './protokoll';
import type { Benutzer } from './anmeldung';

const GRENZE = 40 * 1024 * 1024;
const ARTEN: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' };
const endung = (n: string) => n.split('.').pop()!.toLowerCase();
/** Dateiname für den Dateiserver: ohne Zeichen, die Windows nicht mag, höchstens 150 Zeichen vor der Endung. */
export const dateiname = (n: string) => n.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/^\.+/, '').replace(/\s+/g, ' ').trim().slice(0, 160);
const ordnername = (n: string) => n.split(/[\\/]+/).map((t) => t.replace(/[:*?"<>|\x00-\x1f]+/g, '-').replace(/^\.+/, '').trim()).filter(Boolean).join('/');

export interface Abzulegen { id: string; projekt: string; art: string; name: string; unterordner: string; daten: Buffer; vorschau: Buffer; bezugObjekt?: string; bezug?: string; eingang?: string }

export async function dokumentAblegen(db: Db, register: Modulregister, umgebung: string, wer: Benutzer, d: Abzulegen): Promise<{ id: string; ort: string; name: string }> {
  if (!KENNUNG.test(d.projekt) || !KENNUNG.test(d.id)) throw new Ablehnung('Projekt fehlt');
  if (!d.daten.length || d.daten.length > GRENZE) throw new Ablehnung('Die Datei fehlt oder ist größer als 40 MB');
  if (!ARTEN[endung(d.name)]) throw new Ablehnung('Ablegen geht bei PDF und Bildern (Scan, Foto)');
  if (d.vorschau.length > 800 * 1024 || !(d.vorschau[0] === 0xff && d.vorschau[1] === 0xd8)) throw new Ablehnung('Das Vorschaubild fehlt');
  if (d.bezug && !KENNUNG.test(d.bezug)) throw new Ablehnung('Ungültiger Bezug');
  const ordner = await alsBenutzer(db, wer, async (c) => {
    if (!(await c.query("select bp_darf('dokument', 'schreiben', $1) as d", [d.projekt])).rows[0].d) throw new Ablehnung('Dazu fehlt dir das Recht');
    return (await c.query('select ordner from o_projekt where id = $1 and not geloescht', [d.projekt])).rows[0]?.ordner as string | undefined;
  });
  const wo = await ablegen(db, { umgebung, projekt: d.projekt, projektordner: ordner || null, unterordner: ordnername(d.unterordner), name: dateiname(d.name), daten: d.daten });
  await db.query('insert into kern_vorschau (id, bild) values ($1, $2)', [d.id, d.vorschau]);
  const name = wo.pfad.split('/').pop()!.replace(/^[0-9a-f]{16}-/, '');
  await befehlAusfuehren(db, register, wer, { id: randomUUID(), gesehen: 0, objekt: 'dokument', art: 'anlegen', objektId: d.id,
    werte: { projekt: d.projekt, name, art: d.art, eingang: d.eingang ?? new Date().toISOString().slice(0, 10), ort: wo.ort, pfad: wo.pfad, bezug_objekt: d.bezugObjekt ?? null, bezug: d.bezug ?? null } });
  return { id: d.id, ort: wo.ort, name };
}

export function dokumentRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  const { db } = e;
  const dokument = (wer: Benutzer, id: string) => alsBenutzer(db, wer, async (c) =>
    (KENNUNG.test(id) ? (await c.query('select d.projekt, d.ort, d.pfad, d.name, p.ordner from o_dokument d join o_projekt p on p.id = d.projekt where d.id = $1', [id])).rows[0] : undefined) as
      { projekt: string; ort: string; pfad: string; name: string; ordner: string | null } | undefined);
  const fehler = (reply: FastifyReply, err: unknown) => { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; };

  /** Lesen: Text je Seite (Scans mit Texterkennung) und Vorschaubild – gespeichert wird nichts. */
  app.post('/api/dokument/lesen', { preHandler: e.nurAngemeldet, bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; inhalt?: string };
    const daten = Buffer.from(String(b.inhalt ?? ''), 'base64'), name = String(b.name ?? '');
    if (!daten.length || daten.length > GRENZE) return reply.code(400).send({ fehler: 'Die Datei fehlt oder ist größer als 40 MB' });
    if (!ARTEN[endung(name)]) return reply.code(415).send({ fehler: 'Ablegen geht bei PDF und Bildern (Scan, Foto)' });
    try { return await dateiLesen(name, daten); } catch (err) { return fehler(reply, err); }
  });

  app.post('/api/dokument/ablegen', { preHandler: e.nurAngemeldet, bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    try {
      const r = await dokumentAblegen(db, e.register, e.umgebung, req.benutzer!, { id: String(b.id ?? ''), projekt: String(b.projekt ?? ''), art: String(b.art ?? ''), name: String(b.name ?? ''),
        unterordner: String(b.unterordner ?? ''), daten: Buffer.from(String(b.inhalt ?? ''), 'base64'), vorschau: Buffer.from(String(b.vorschau ?? ''), 'base64'),
        bezugObjekt: b.bezug_objekt || undefined, bezug: b.bezug || undefined, eingang: /^\d{4}-\d{2}-\d{2}$/.test(String(b.eingang ?? '')) ? b.eingang : undefined });
      e.nachBefehlen();
      return r;
    } catch (err) { return fehler(reply, err); }
  });

  app.get('/api/dokument/vorschau/:id', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    return vorschauSenden(db, reply, id, !!(await dokument(req.benutzer!, id)));
  });
  app.get('/api/dokument/original/:id', { preHandler: e.nurAngemeldet }, async (req, reply) => originalSenden(db, reply, await dokument(req.benutzer!, (req.params as { id: string }).id)));
}
