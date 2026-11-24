// Fotos zum Tagesbericht: Der Browser schickt das Original und ein Vorschaubild (er verkleinert selbst – der Server
// braucht dafür kein Bildprogramm). Das Original geht in den Projektordner (ablage.ts: ablegen), das Vorschaubild
// in die Datenbank; das Foto selbst ist ein Objekt wie alle anderen (Beschriftung, Löschen, Rückgängig).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { KENNUNG } from '../kern/modell';
import { ABLAGE_ID } from '../module/verwaltung/beipackzettel';
import { alsBenutzer, type Db } from './db';
import { Dienstfehler, ablegen, originalLesen } from './ablage';
import { Ablehnung, befehlAusfuehren } from './protokoll';
import type { Benutzer } from './anmeldung';

const ARTEN: [string, (b: Buffer) => boolean][] = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  ['image/heic', (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)/.test(b.subarray(8, 12).toString('latin1'))],
];
const bildart = (b: Buffer) => ARTEN.find(([, passt]) => passt(b))?.[0];
const GRENZE_ORIGINAL = 40 * 1024 * 1024, GRENZE_VORSCHAU = 800 * 1024;

export interface Hochgeladen { projekt: string; bericht: string; name: string; original: Buffer; vorschau: Buffer; beschriftung?: string; kennung?: string; herkunft?: string }

export async function fotoAblegen(db: Db, register: Modulregister, umgebung: string, wer: Benutzer, f: Hochgeladen): Promise<{ id: string; ort: string }> {
  if (!KENNUNG.test(f.projekt) || !KENNUNG.test(f.bericht)) throw new Ablehnung('Projekt und Bericht fehlen');
  if (!f.original.length || f.original.length > GRENZE_ORIGINAL) throw new Ablehnung('Das Foto fehlt oder ist größer als 40 MB');
  if (!bildart(f.original)) throw new Ablehnung('Das ist kein Foto, das das Bauportal kennt (JPEG, PNG, WebP, HEIC)');
  if (bildart(f.vorschau) !== 'image/jpeg' || f.vorschau.length > GRENZE_VORSCHAU) throw new Ablehnung('Das Vorschaubild fehlt');
  const name = f.name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/^\.+/, '').trim().slice(0, 120) || 'Foto.jpg';
  // Darf der Benutzer in diesem Projekt Fotos anlegen, und gehört der Bericht dazu? Das entscheidet die Datenbank.
  const z = await alsBenutzer(db, wer, async (c) => {
    if (!(await c.query("select bp_darf('foto', 'schreiben', $1) as d", [f.projekt])).rows[0].d) throw new Ablehnung('Dazu fehlt dir das Recht');
    const b = (await c.query('select nummer, datum from o_tagesbericht where id = $1 and projekt = $2 and not geloescht', [f.bericht, f.projekt])).rows[0];
    if (!b) throw new Ablehnung('Den Bericht gibt es nicht (mehr)');
    return { bericht: b as { nummer: string | null; datum: string }, ordner: (await c.query('select ordner from o_projekt where id = $1', [f.projekt])).rows[0]?.ordner as string | undefined,
      reihe: (await c.query('select coalesce(max(reihe), 0) + 1 as n from o_foto where bericht = $1', [f.bericht])).rows[0].n as number };
  });
  const basis = ((await db.query('select fotos_ordner from o_ablage where id = $1', [ABLAGE_ID])).rows[0]?.fotos_ordner as string | undefined)?.trim() || 'Bautagebuch/Fotos';
  const wo = await ablegen(db, { umgebung, projekt: f.projekt, projektordner: z.ordner || null, unterordner: `${basis}/${z.bericht.datum} Bericht ${Number(z.bericht.nummer ?? 0)}`, name, daten: f.original });
  const id = randomUUID();
  await db.query('insert into kern_vorschau (id, bild) values ($1, $2)', [id, f.vorschau]);
  await befehlAusfuehren(db, register, wer, { id: randomUUID(), gesehen: 0, objekt: 'foto', art: 'anlegen', objektId: id, ...(f.herkunft ? { herkunft: f.herkunft } : {}),
    werte: { projekt: f.projekt, bericht: f.bericht, name: wo.pfad.split('/').pop()!.replace(/^[0-9a-f]{16}-/, ''), beschriftung: f.beschriftung ?? '', ort: wo.ort, pfad: wo.pfad, reihe: Number(z.reihe), kennung: f.kennung ?? '' } });
  return { id, ort: wo.ort };
}

export function fotoRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  const { db } = e;
  /** Das Foto, wie der Benutzer es sehen darf. */
  const foto = (wer: Benutzer, id: string) => alsBenutzer(db, wer, async (c) =>
    (KENNUNG.test(id) ? (await c.query('select f.projekt, f.ort, f.pfad, f.name, p.ordner from o_foto f join o_projekt p on p.id = f.projekt where f.id = $1', [id])).rows[0] : undefined) as { projekt: string; ort: string; pfad: string; name: string; ordner: string } | undefined);

  app.post('/api/foto', { preHandler: e.nurAngemeldet, bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const b = (req.body ?? {}) as { projekt?: string; bericht?: string; name?: string; original?: string; vorschau?: string };
    try {
      const r = await fotoAblegen(db, e.register, e.umgebung, req.benutzer!, { projekt: String(b.projekt ?? ''), bericht: String(b.bericht ?? ''), name: String(b.name ?? ''),
        original: Buffer.from(String(b.original ?? ''), 'base64'), vorschau: Buffer.from(String(b.vorschau ?? ''), 'base64') });
      e.nachBefehlen();
      return r;
    } catch (err) { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; }
  });

  app.get('/api/foto/vorschau/:id', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const bild = (await foto(req.benutzer!, id)) ? (await db.query('select bild from kern_vorschau where id = $1', [id])).rows[0]?.bild as Buffer | undefined : undefined;
    if (!bild) return reply.code(404).send({ fehler: 'Das Foto gibt es nicht' });
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400').header('x-content-type-options', 'nosniff').send(bild);
  });

  app.get('/api/foto/original/:id', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const f = await foto(req.benutzer!, (req.params as { id: string }).id);
    if (!f) return reply.code(404).send({ fehler: 'Das Foto gibt es nicht' });
    try {
      const strom = await originalLesen(db, { projekt: f.projekt, projektordner: f.ordner || null, ort: f.ort, pfad: f.pfad });
      const endung = f.name.split('.').pop()!.toLowerCase();
      const art = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[endung];
      return reply.header('content-type', art ?? 'application/octet-stream').header('content-disposition', `${art ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
        .header('cache-control', 'private, no-store').header('x-content-type-options', 'nosniff').send(strom);
    } catch (err) { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; }
  });
}
