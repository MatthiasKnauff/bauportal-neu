// Büro-Logo (wie im bisherigen Bauportal): ein Bild für den Briefkopf der Ausdrucke. Der Browser verkleinert es vor dem
// Hochladen (höchstens Vorschaubild-Größe, PNG) – im Bauportal liegt also nur ein kleines Bild, kein Original.
// Wer es ändern darf, entscheidet das Recht am Büro: der Stand wird als Befehl am Büro vermerkt (Feld „logo“), erst
// danach wird das Bild abgelegt; über den Abgleich sehen alle Geräte das neue Logo.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import type { Db } from './db';
import { Ablehnung, befehlAusfuehren, ALLES_GESEHEN } from './protokoll';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GROESSE = 600 * 1024;

/** Das Logo als data:-Adresse für das PDF (der Druckdienst holt keine Adressen) – '' ohne Logo. */
export async function logoDaten(db: Db): Promise<string> {
  const r = (await db.query('select bild from kern_logo where id = 1')).rows[0] as { bild: Buffer } | undefined;
  return r ? `data:image/png;base64,${r.bild.toString('base64')}` : '';
}

export function logoRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  app.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: GROESSE }, (_req, body, fertig) => fertig(null, body));
  const vermerken = (req: FastifyRequest, logo: string) =>
    befehlAusfuehren(e.db, e.register, req.benutzer!, { id: randomUUID(), gesehen: ALLES_GESEHEN, objekt: 'buero', art: 'aendern', objektId: BUERO_ID, werte: { logo } });

  app.post('/api/buero/logo', { preHandler: e.nurAngemeldet, bodyLimit: GROESSE }, async (req) => {
    const bild = req.body;
    if (!Buffer.isBuffer(bild) || bild.length < 100 || !bild.subarray(0, 8).equals(PNG)) throw new Ablehnung('Bitte ein Bild wählen (PNG, JPG oder WebP)');
    await vermerken(req, new Date().toISOString());   // prüft das Recht am Büro
    await e.db.query('insert into kern_logo (id, bild) values (1, $1) on conflict (id) do update set bild = excluded.bild, geaendert = now()', [bild]);
    e.nachBefehlen();
    return { ok: true };
  });
  app.post('/api/buero/logo/weg', { preHandler: e.nurAngemeldet }, async (req) => {
    await vermerken(req, '');
    await e.db.query('delete from kern_logo where id = 1');
    e.nachBefehlen();
    return { ok: true };
  });
  app.get('/api/logo', { preHandler: e.nurAngemeldet }, async (_req, reply) => {
    const r = (await e.db.query('select bild from kern_logo where id = 1')).rows[0] as { bild: Buffer } | undefined;
    if (!r) return reply.code(404).send({ fehler: 'Kein Logo' });
    return reply.header('content-type', 'image/png').header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=86400').send(r.bild);
  });
}
