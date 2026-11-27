// Zentrale Versandstelle: verschickt, was im Postausgang wartet – jede Minute ein Blick, entschieden wird in
// module/verwaltung/versand.ts (gleich oder gebündelt). Jeder Stand (verschickt, Fehler) ist ein Befehl im Protokoll.
// Der Testserver verschickt nie etwas: dort bleiben Nachrichten „zurückgehalten“ (die Daten sind oft eine Kopie mit echten Adressen).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { Eingabefehler } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import { MAILSERVER_ID } from '../module/verwaltung/beipackzettel';
import { ortszeit, pakete } from '../module/verwaltung/versand';
import { geheimnisLesen, geheimnisSetzen } from './ablage';
import { SYSTEM, type Db } from './db';
import { werteAus } from './druck';
import { Ablehnung, ALLES_GESEHEN, vorgangAusfuehren } from './protokoll';

const KENNWORT = 'mail.kennwort';

async function verbindung(db: Db, register: Modulregister) {
  const s = werteAus(register.modell('mailserver')!, (await db.query('select * from o_mailserver where id = $1', [MAILSERVER_ID])).rows[0]);
  if (!s.host || !s.absender) throw new Ablehnung('Der Mailserver ist noch nicht eingerichtet (Verwaltung → Mail & Versand)');
  const port = Number(s.port || 587), ssl = s.sicherheit === 'ssl';
  const transport = nodemailer.createTransport({ host: String(s.host), port, secure: ssl, requireTLS: !ssl,
    auth: s.benutzer ? { user: String(s.benutzer), pass: (await geheimnisLesen(db, KENNWORT)) ?? '' } : undefined, connectionTimeout: 20000 });
  return { s, transport, von: s.absender_name ? { name: String(s.absender_name), address: String(s.absender) } : String(s.absender) };
}

/** Ein Durchgang: fällige Nachrichten verschicken (bzw. auf dem Testserver zurückhalten). Gibt zurück, wie viele Pakete es waren. */
export async function versandLauf(db: Db, register: Modulregister, umgebung: string, jetzt = new Date()): Promise<number> {
  const m = register.modell('nachricht')!;
  const N = (await db.query("select * from o_nachricht where not geloescht and stand = 'wartet'")).rows.map((z) => ({ id: z.id as string, werte: werteAus(m, z) }));
  if (!N.length) return 0;
  const s = werteAus(register.modell('mailserver')!, (await db.query('select * from o_mailserver where id = $1', [MAILSERVER_ID])).rows[0]);
  // noch nicht eingerichtet: alles wartet weiter (außer auf dem Testserver, der ohnehin nichts verschickt)
  if (umgebung !== 'test' && (!s.host || !s.absender)) return 0;
  const { pakete: P, lauf } = pakete(N, jetzt, { buendeln: String(s.buendeln ?? ''), uhrzeit: String(s.uhrzeit ?? ''), letzter: String(s.letzter_lauf ?? '') });
  if (!P.length) return 0;
  const zeit = `${ortszeit(jetzt).tag} ${ortszeit(jetzt).uhr}`;
  const stand = (ids: string[], werte: Record<string, string>) => ids.map((id) => ({ id: randomUUID(), gesehen: ALLES_GESEHEN, herkunft: 'versand', objekt: 'nachricht', art: 'aendern' as const, objektId: id, werte }));
  const befehle = [];
  if (umgebung === 'test') {
    for (const p of P) befehle.push(...stand(p.ids, { stand: 'zurueckgehalten', fehler: 'Der Testserver verschickt keine Mails.' }));
  } else {
    let v: Awaited<ReturnType<typeof verbindung>> | null = null, grund = '';
    try { v = await verbindung(db, register); } catch (e) { grund = (e as Error).message; }
    for (const p of P) {
      if (!v) { befehle.push(...stand(p.ids, { stand: 'fehler', fehler: grund })); continue; }
      try {
        await v.transport.sendMail({ from: v.von, to: p.an, subject: p.betreff, text: p.text });
        befehle.push(...stand(p.ids, { stand: 'verschickt', verschickt_am: zeit, fehler: '' }));
      } catch (e) { befehle.push(...stand(p.ids, { stand: 'fehler', fehler: (e as Error).message.slice(0, 300) })); }
    }
  }
  if (lauf) befehle.push({ id: randomUUID(), gesehen: ALLES_GESEHEN, herkunft: 'versand', objekt: 'mailserver', art: 'aendern' as const, objektId: MAILSERVER_ID, werte: { letzter_lauf: lauf } });
  await vorgangAusfuehren(db, register, SYSTEM, befehle);
  return P.length;
}

export function versandRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  const { db } = e;
  const admin = (req: FastifyRequest) => { if (req.benutzer!.rolle !== 'admin') throw new Ablehnung('Das dürfen nur Administrator:innen'); };

  app.get('/api/mail/zustand', { preHandler: e.nurAngemeldet }, async () => {
    const z = (await db.query('select host, absender from o_mailserver where id = $1', [MAILSERVER_ID])).rows[0];
    return { eingerichtet: !!z?.host && !!z?.absender, kennwortGesetzt: (await geheimnisLesen(db, KENNWORT)) !== null, nurTest: e.umgebung === 'test' };
  });
  app.post('/api/mail/kennwort', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const k = (req.body as { kennwort?: unknown } | null)?.kennwort;
    if (typeof k !== 'string' || !k) throw new Eingabefehler({ kennwort: 'Bitte das Kennwort eintragen' });
    await geheimnisSetzen(db, KENNWORT, k);
    return { ok: true };
  });
  // Prüfen meldet sich nur am Mailserver an – verschickt wird dabei nichts (auch nicht auf dem Testserver)
  app.post('/api/mail/pruefen', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const v = await verbindung(db, e.register);
    try { await v.transport.verify(); } catch (err) { throw new Ablehnung(`Der Mailserver nimmt die Anmeldung nicht an: ${(err as Error).message}`); }
    return { ok: true };
  });

  // jede Minute ein Durchgang – nie zwei zugleich
  let laeuft = false;
  const takt = setInterval(() => {
    if (laeuft) return; laeuft = true;
    versandLauf(db, e.register, e.umgebung).then((n) => { if (n) e.nachBefehlen(); }, (err) => console.error('Versandstelle:', err)).finally(() => { laeuft = false; });
  }, 60000);
  app.addHook('onClose', async () => { clearInterval(takt); });
}
