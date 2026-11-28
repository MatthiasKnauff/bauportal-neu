// Zentrale Versandstelle: verschickt, was im Postausgang wartet – jede Minute ein Blick, entschieden wird in
// module/verwaltung/versand.ts (gleich oder gebündelt). Jeder Stand (verschickt, Fehler) ist ein Befehl im Protokoll.
// Der Testserver verschickt nie etwas: dort bleiben Nachrichten „zurückgehalten“ (die Daten sind oft eine Kopie mit echten Adressen).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { MAILSERVER_ID } from '../module/verwaltung/beipackzettel';
import { ortszeit, pakete, type Anhang } from '../module/verwaltung/versand';
import { lvAlsX83 } from '../module/ava/gaeb';
import { originalLesen } from './ablage';
import { BUERO, sender, type Sender } from './postfach';
import { SYSTEM, alsBenutzer, tabelle, type Absender, type Db } from './db';
import { pdfAus, seiteBauen, werteAus } from './druck';
import { Ablehnung, ALLES_GESEHEN, vorgangAusfuehren } from './protokoll';



/** Wer die Nachricht angelegt hat – mit dessen Rechten entstehen die Anhänge (wer ein LV nicht sehen darf, kann es auch nicht verschicken). */
export async function anlegerVon(db: Db, id: string): Promise<Absender | null> {
  const z = (await db.query("select benutzer_id, benutzer_name from kern_befehl where objekt = 'nachricht' and objekt_id = $1 and art = 'anlegen' order by seq limit 1", [id])).rows[0];
  return z ? { id: String(z.benutzer_id), name: String(z.benutzer_name ?? '') } : null;
}

const DATEIART: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', dwg: 'application/acad', dxf: 'application/dxf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
/** Die Anhänge eines Pakets aus dem aktuellen Stand: PDF über das Druckwerk, X83 aus LV und Positionen, abgelegte Dokumente im Original. */
export async function anhaengeBauen(db: Db, register: Modulregister, wer: Absender, liste: Anhang[]): Promise<{ filename: string; content: Buffer | string; contentType: string }[]> {
  const aus = [];
  for (const a of liste) {
    if (a.art === 'druck') {
      const s = await seiteBauen(db, register, wer, a.ausdruck, a.id);
      aus.push({ filename: s.name, content: await pdfAus(s.html), contentType: 'application/pdf' });
      continue;
    }
    if (a.art === 'dokument') {   // das Original von dort, wo es liegt (Projektordner oder Speicher des Bauportals) – nur, wenn der Benutzer es sehen darf
      const d = await alsBenutzer(db, wer, async (c) => (await c.query('select d.projekt, d.ort, d.pfad, d.name, p.ordner from o_dokument d join o_projekt p on p.id = d.projekt where d.id = $1 and not d.geloescht', [a.id])).rows[0] as
        { projekt: string; ort: string; pfad: string; name: string; ordner: string | null } | undefined);
      if (!d) throw new Ablehnung('Ein Dokument für den Anhang gibt es nicht (mehr)');
      const teile: Buffer[] = [];
      for await (const t of await originalLesen(db, { projekt: d.projekt, projektordner: d.ordner, ort: d.ort, pfad: d.pfad })) teile.push(Buffer.from(t as Uint8Array));
      aus.push({ filename: d.name, content: Buffer.concat(teile), contentType: DATEIART[d.name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' });
      continue;
    }
    const lvM = register.modell('lv')!, posM = register.modell('lv_position')!, prM = register.modell('projekt')!;
    const x = await alsBenutzer(db, wer, async (c) => {
      const lv = (await c.query(`select * from ${tabelle('lv')} where id = $1 and not geloescht`, [a.id])).rows[0];
      if (!lv) throw new Ablehnung('Das LV für den Anhang gibt es nicht (mehr)');
      const w = werteAus(lvM, lv);
      const pos = (await c.query(`select * from ${tabelle('lv_position')} where lv = $1 and not geloescht`, [a.id])).rows.map((z) => ({ id: z.id as string, werte: werteAus(posM, z) }));
      const pr = w.projekt ? werteAus(prM, (await c.query(`select * from ${tabelle('projekt')} where id = $1`, [w.projekt])).rows[0]) : null;
      return lvAlsX83(w, pos, [pr?.nummer, pr?.name].filter(Boolean).join(' '));
    });
    aus.push({ filename: x.name, content: x.xml, contentType: 'application/xml' });
  }
  return aus;
}

/** Ein Durchgang: fällige Nachrichten verschicken (bzw. auf dem Testserver zurückhalten). Gibt zurück, wie viele Pakete es waren. */
export async function versandLauf(db: Db, register: Modulregister, umgebung: string, jetzt = new Date()): Promise<number> {
  const m = register.modell('nachricht')!;
  const N = (await db.query("select * from o_nachricht where not geloescht and stand = 'wartet'")).rows.map((z) => ({ id: z.id as string, werte: werteAus(m, z) }));
  if (!N.length) return 0;
  const s = werteAus(register.modell('mailserver')!, (await db.query('select * from o_mailserver where id = $1', [MAILSERVER_ID])).rows[0]);
  // noch nicht eingerichtet: alles wartet weiter (außer auf dem Testserver, der ohnehin nichts verschickt)
  if (umgebung !== 'test' && !s.absender) return 0;
  const { pakete: P, lauf } = pakete(N, jetzt, { buendeln: String(s.buendeln ?? ''), uhrzeit: String(s.uhrzeit ?? ''), letzter: String(s.letzter_lauf ?? '') });
  if (!P.length) return 0;
  const zeit = `${ortszeit(jetzt).tag} ${ortszeit(jetzt).uhr}`;
  const stand = (ids: string[], werte: Record<string, string>) => ids.map((id) => ({ id: randomUUID(), gesehen: ALLES_GESEHEN, herkunft: 'versand', objekt: 'nachricht', art: 'aendern' as const, objektId: id, werte }));
  const befehle = [];
  if (umgebung === 'test') {
    for (const p of P) befehle.push(...stand(p.ids, { stand: 'zurueckgehalten', fehler: 'Der Testserver verschickt keine Mails.' }));
  } else {
    // je Postfach eine Verbindung (ab Werk das Büro; eigenes Postfach der Benutzer:in, wenn so gewählt)
    const sender_ = new Map<string, Promise<Sender>>();
    const ueber = (pf: string) => { const k = pf || BUERO; if (!sender_.has(k)) sender_.set(k, sender(db, register, k)); return sender_.get(k)!; };
    for (const p of P) {
      let v: Sender;
      try { v = await ueber(p.postfach); } catch (e) { befehle.push(...stand(p.ids, { stand: 'fehler', fehler: (e as Error).message })); continue; }
      try {
        let attachments: Awaited<ReturnType<typeof anhaengeBauen>> = [];
        if (p.anhaenge?.length) {
          const wer = await anlegerVon(db, p.ids[0]!);
          if (!wer) throw new Ablehnung('Wer die Nachricht angelegt hat, steht nicht im Protokoll – Anhänge entstehen nur mit deren Rechten');
          attachments = await anhaengeBauen(db, register, wer, p.anhaenge);
        }
        await v.senden({ to: p.an, subject: p.betreff, text: p.text, attachments });
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

  // jede Minute ein Durchgang – nie zwei zugleich
  let laeuft = false;
  const takt = setInterval(() => {
    if (laeuft) return; laeuft = true;
    versandLauf(db, e.register, e.umgebung).then((n) => { if (n) e.nachBefehlen(); }, (err) => console.error('Versandstelle:', err)).finally(() => { laeuft = false; });
  }, 60000);
  app.addHook('onClose', async () => { clearInterval(takt); });
}
