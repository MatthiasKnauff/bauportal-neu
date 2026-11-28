// Fehler melden und Frage stellen (wie bisher am „?“ der Kopfleiste): jede:r Angemeldete darf melden. Der Server legt die
// Meldung als Befehl an (das Objekt „meldung“ darf sonst nur sehen, wer den Bereich „System“ hat) und legt das verkleinerte
// Bildschirmfoto (JPEG, höchstens Vorschau-Größe) in kern_meldung_bild ab – kein Original. Wer gefragt hat, sieht seine
// eigenen Fragen und die Antworten über /api/meldung/meine.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import { SYSTEM, alsBenutzer, type Db } from './db';
import { pruefeBereich } from './bereich';
import type { Befehl } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { Ablehnung, befehlAusfuehren, regelAnmelden, ALLES_GESEHEN } from './protokoll';

const JPEG = 'data:image/jpeg;base64,';
const BILD_HOECHSTENS = 1024 * 1024;

export interface MeineFrage { id: string; kurz: string; text: string; zeit: string; stand: string; antwort: string; gelesen: boolean }

export function meldungRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  app.post('/api/meldung', { preHandler: e.nurAngemeldet, bodyLimit: 2 * BILD_HOECHSTENS }, async (req) => {
    const b = (req.body ?? {}) as { art?: string; text?: string; bild?: string; kontext?: string; app?: string; projekt?: string };
    const art = b.art === 'frage' ? 'frage' : 'fehler';
    const text = String(b.text ?? '').trim().slice(0, 8000);
    if (text.length < 3) throw new Ablehnung(art === 'frage' ? 'Bitte kurz schreiben, worum es geht.' : 'Bitte kurz beschreiben, was passiert ist.');
    let bild: Buffer | null = null;
    if (b.bild) {
      if (!b.bild.startsWith(JPEG)) throw new Ablehnung('Das Bild ließ sich nicht lesen.');
      bild = Buffer.from(b.bild.slice(JPEG.length), 'base64');
      if (bild.length > BILD_HOECHSTENS || bild[0] !== 0xff || bild[1] !== 0xd8) throw new Ablehnung('Das Bild ließ sich nicht lesen.');
    }
    const id = randomUUID();
    await befehlAusfuehren(e.db, e.register, SYSTEM, { id: randomUUID(), gesehen: ALLES_GESEHEN, objekt: 'meldung', art: 'anlegen', objektId: id, werte: {
      art, kurz: text.split('\n')[0]!.slice(0, 120), text, stand: 'neu', antwort: '', von: req.benutzer!.id, zeit: new Date().toISOString().slice(0, 16).replace('T', ' '),
      app: String(b.app ?? '').slice(0, 80), projekt: String(b.projekt ?? '').slice(0, 160), kontext: String(b.kontext ?? '').slice(0, 8000), bild: !!bild, gelesen: false,
    } });
    if (bild) await e.db.query('insert into kern_meldung_bild (id, bild) values ($1, $2)', [id, bild]);
    e.nachBefehlen();
    return { id };
  });

  app.get('/api/meldung/meine', { preHandler: e.nurAngemeldet }, async (req) => {
    const r = await alsBenutzer(e.db, SYSTEM, (c) => c.query(
      `select id, kurz, text, zeit, stand, antwort, gelesen from o_meldung where von = $1 and art = 'frage' and not geloescht order by zeit desc limit 50`, [req.benutzer!.id]));
    return r.rows.map((x) => ({ id: x.id, kurz: x.kurz ?? '', text: x.text ?? '', zeit: x.zeit ?? '', stand: x.stand ?? '', antwort: x.antwort ?? '', gelesen: x.gelesen === true })) as MeineFrage[];
  });

  // Antwort gelesen: vermerkt der Server (die Fragende darf das Objekt selbst nicht ändern)
  app.post('/api/meldung/:id/gelesen', { preHandler: e.nurAngemeldet }, async (req) => {
    const id = (req.params as { id: string }).id;
    const r = await alsBenutzer(e.db, SYSTEM, (c) => c.query('select 1 from o_meldung where id = $1 and von = $2 and not geloescht', [id, req.benutzer!.id]));
    if (!r.rowCount) throw new Ablehnung('Diese Frage gibt es nicht');
    await befehlAusfuehren(e.db, e.register, SYSTEM, { id: randomUUID(), gesehen: ALLES_GESEHEN, objekt: 'meldung', art: 'aendern', objektId: id, werte: { gelesen: true } });
    e.nachBefehlen();
    return { ok: true };
  });

  app.get('/api/meldung/:id/bild', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    await pruefeBereich(e.db, req, 'system', 'lesen');
    const r = (await e.db.query('select bild from kern_meldung_bild where id = $1', [(req.params as { id: string }).id])).rows[0] as { bild: Buffer } | undefined;
    if (!r) return reply.code(404).send({ fehler: 'Kein Bild' });
    return reply.header('content-type', 'image/jpeg').header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=86400').send(r.bild);
  });
}

/** Antwort auf eine Frage: gilt als ungelesen, Stand „beantwortet“ – und geht über die eine Versandstelle (Postausgang) per Mail an die Fragende. */
export function meldungsregelnAnmelden(): void {
  regelAnmelden('meldung', 'antwort', {
    async vor(_c, b, vorher, werte) {
      if (b.art !== 'aendern' || !werte || !('antwort' in werte) || werte.antwort === vorher?.antwort || !String(werte.antwort ?? '').trim()) return;
      werte.gelesen = false;
      if (!('stand' in werte)) werte.stand = 'beantwortet';
    },
    async nach(c, b, vorher, werte) {
      if (b.art !== 'aendern' || !werte || !('antwort' in werte) || werte.antwort === vorher?.antwort || !String(werte.antwort ?? '').trim()) return [];
      const e = { ...(vorher as Werte | undefined), ...werte } as Werte;
      if (e.art !== 'frage' || !e.von) return [];
      const an = String((await c.query('select email from o_benutzer where id = $1 and not geloescht', [e.von])).rows[0]?.email ?? '').trim();
      if (!an.includes('@')) return [];
      const folge: Befehl = { id: randomUUID(), objekt: 'nachricht', art: 'anlegen', objektId: randomUUID(), gesehen: b.gesehen, werte: {
        an, betreff: `Antwort auf deine Frage: ${String(e.kurz ?? '').slice(0, 80)}`, text: `${String(e.antwort)}\n\n– zu deiner Frage vom ${String(e.zeit ?? '')}:\n${String(e.text ?? '')}`,
        art: 'mitteilung', stand: 'wartet', quelle: `meldung|${b.objektId}`,
      } };
      return [folge];
    },
  });
}
