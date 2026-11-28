// Postfächer (28.11.2026): über welches Postfach eine Mail hinausgeht – das Büro (ab Werk) oder das eigene einer Benutzer:in.
// Je Postfach wählbar: ein gängiger Mailserver (SMTP, gesendete Mails per IMAP in „Gesendet“) oder Microsoft 365 mit
// Microsoft-Anmeldung (OAuth, verschickt über Microsoft Graph – ohne gespeichertes Kennwort). Kennwörter, die Anmeldung bei
// Microsoft und das Geheimnis der Büro-App stehen verschlüsselt in der Datenbank (geheimnisSetzen), nie in den Feldern.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { ImapFlow } from 'imapflow';
import { Eingabefehler, type Werte } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import { MAILSERVER_ID } from '../module/verwaltung/beipackzettel';
import { geheimnisLesen, geheimnisSetzen } from './ablage';
import { SYSTEM, type Db } from './db';
import { pruefeBereich } from './bereich';
import { werteAus } from './druck';
import { Ablehnung, ALLES_GESEHEN, befehlAusfuehren, regelAnmelden } from './protokoll';

/** Kennung eines Postfachs: „buero“ oder die Kennung des Objekts „postfach“. */
export type PostfachId = string;
export const BUERO = 'buero';
const geheim = (pf: PostfachId, was: 'kennwort' | 'm365') => (pf === BUERO ? (was === 'kennwort' ? 'mail.kennwort' : 'mail.m365') : `postfach.${pf}.${was}`);
const APP_GEHEIMNIS = 'm365.geheimnis';
const GRAPH = 'https://graph.microsoft.com';
const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read';

export interface Mail { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer | string; contentType: string }[] }
export interface Sender { von: string | { name: string; address: string }; senden: (m: Mail) => Promise<void>; pruefen: () => Promise<void> }

/** Werte des Postfachs und der Büro-Einstellungen (Absendername, App für Microsoft 365). */
async function laden(db: Db, register: Modulregister, pf: PostfachId): Promise<{ w: Werte; buero: Werte }> {
  const buero = werteAus(register.modell('mailserver')!, (await db.query('select * from o_mailserver where id = $1', [MAILSERVER_ID])).rows[0]);
  if (pf === BUERO) return { w: buero, buero };
  const z = (await db.query('select * from o_postfach where id = $1 and not geloescht', [pf])).rows[0];
  if (!z) throw new Ablehnung('Dieses Postfach gibt es nicht (mehr)');
  return { w: werteAus(register.modell('postfach')!, z), buero };
}

/** Microsoft-Anmeldung der Büro-App: Mandant, Anwendungs-ID und Geheimnis. */
async function app(db: Db, buero: Werte): Promise<{ mandant: string; id: string; geheimnis: string }> {
  const geheimnis = await geheimnisLesen(db, APP_GEHEIMNIS);
  if (!buero.m365_mandant || !buero.m365_app || !geheimnis) throw new Ablehnung('Microsoft 365 ist noch nicht eingerichtet (Verwaltung → Mail & Versand: Mandant, Anwendungs-ID, Geheimnis)');
  return { mandant: String(buero.m365_mandant), id: String(buero.m365_app), geheimnis };
}
/** Austausch beim Microsoft-Anmeldedienst (Code → Token, Token erneuern); fetch ist für die Tests austauschbar. */
export async function tokenHolen(a: { mandant: string; id: string; geheimnis: string }, form: Record<string, string>, holen: typeof fetch = fetch): Promise<{ access_token: string; refresh_token?: string }> {
  const r = await holen(`https://login.microsoftonline.com/${encodeURIComponent(a.mandant)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: a.id, client_secret: a.geheimnis, scope: SCOPE, ...form }).toString() });
  const j = await r.json() as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Ablehnung(`Microsoft hat die Anmeldung nicht angenommen: ${String(j.error_description ?? r.status).split('\n')[0]}`);
  return { access_token: j.access_token, refresh_token: j.refresh_token };
}
/** Die Adresse, unter der man sich bei Microsoft anmeldet (Anmeldung im Browser, zurück an „zurueck“). */
export const anmeldeAdresse = (a: { mandant: string; id: string }, zurueck: string, state: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(a.mandant)}/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: a.id, response_type: 'code', redirect_uri: zurueck, response_mode: 'query', scope: SCOPE, state, prompt: 'select_account' })}`;

/** Fertige Mail als MIME (für Graph und für „Gesendet“ per IMAP). */
const mime = (von: Sender['von'], m: Mail) => new MailComposer({ from: von, to: m.to, subject: m.subject, text: m.text, attachments: m.attachments }).compile().build();

/** Wie dieses Postfach verschickt. */
export async function sender(db: Db, register: Modulregister, pf: PostfachId, holen: typeof fetch = fetch): Promise<Sender> {
  const { w, buero } = await laden(db, register, pf);
  const adresse = String(w.absender ?? ''), name = String(buero.absender_name ?? '');
  if (!adresse) throw new Ablehnung(pf === BUERO ? 'Der Absender des Büros fehlt (Verwaltung → Mail & Versand)' : 'Die Adresse des Postfachs fehlt');
  const von = name ? { name, address: adresse } : adresse;
  if (w.art === 'm365') {
    const a = await app(db, buero), rt = await geheimnisLesen(db, geheim(pf, 'm365'));
    if (!rt) throw new Ablehnung('Das Postfach ist noch nicht bei Microsoft angemeldet („Mit Microsoft anmelden“)');
    const zugang = async () => { const t = await tokenHolen(a, { grant_type: 'refresh_token', refresh_token: rt }, holen); if (t.refresh_token && t.refresh_token !== rt) await geheimnisSetzen(db, geheim(pf, 'm365'), t.refresh_token); return t.access_token; };
    return { von, pruefen: async () => { await zugang(); },
      senden: async (m) => {   // Graph nimmt die fertige Mail (MIME, Base64) – sie steht dann im Postfach unter „Gesendete Elemente“
        const r = await holen(`${GRAPH}/v1.0/me/sendMail`, { method: 'POST', headers: { authorization: `Bearer ${await zugang()}`, 'content-type': 'text/plain' }, body: (await mime(von, m)).toString('base64') });
        if (!r.ok) throw new Ablehnung(`Microsoft 365 hat die Mail abgelehnt (${r.status}): ${(await r.text()).slice(0, 200)}`);
      } };
  }
  if (!w.host) throw new Ablehnung(pf === BUERO ? 'Der Mailserver ist noch nicht eingerichtet (Verwaltung → Mail & Versand)' : 'Der Mailserver des Postfachs fehlt');
  const kennwort = (await geheimnisLesen(db, geheim(pf, 'kennwort'))) ?? '';
  const port = Number(w.port || 587), ssl = w.sicherheit === 'ssl';
  const transport = nodemailer.createTransport({ host: String(w.host), port, secure: ssl, requireTLS: !ssl,
    auth: w.benutzer ? { user: String(w.benutzer), pass: kennwort } : undefined, connectionTimeout: 20000 });
  return { von, pruefen: async () => { await transport.verify(); },
    senden: async (m) => {
      await transport.sendMail({ from: von, ...m });
      // wie bei jedem Mailprogramm: eine Kopie unter „Gesendet“ (IMAP) – geht das nicht, ist die Mail trotzdem verschickt
      if (w.imap_host) {
        const c = new ImapFlow({ host: String(w.imap_host), port: Number(w.imap_port || 993), secure: true, auth: { user: String(w.benutzer ?? adresse), pass: kennwort }, logger: false });
        try { await c.connect(); const ziel = (await c.list()).find((x) => x.specialUse === '\\Sent')?.path ?? 'Sent'; await c.append(ziel, await mime(von, m), ['\\Seen']); }
        catch (e) { console.error('Gesendet (IMAP):', (e as Error).message); } finally { await c.logout().catch(() => undefined); }
      }
    } };
}

/** Darf der Benutzer dieses Postfach einrichten? Das Büro, wer „Mail & Versand“ ändern darf, ein eigenes nur der Inhaber (oder die Verwaltung). */
async function darfEinrichten(db: Db, req: FastifyRequest, pf: PostfachId, zugang = false): Promise<void> {
  if (req.benutzer!.admin) return;
  if (pf === BUERO) return pruefeBereich(db, req, zugang ? 'zugaenge' : 'mail', zugang ? 'schreiben' : 'lesen');   // Kennwort/Anmeldung des Büros: Zugänge „neu setzen“
  if (pf !== BUERO && (await db.query('select 1 from o_postfach where id = $1 and inhaber = $2 and not geloescht', [pf, req.benutzer!.id])).rowCount) return;
  throw new Ablehnung('Das darf nur die Verwaltung');
}
const FELDER = ['absender', 'art', 'host', 'port', 'sicherheit', 'benutzer', 'imap_host', 'imap_port'];

/** Über ein eigenes Postfach schreibt nur sein:e Inhaber:in (die Versandstelle des Systems darf alles). */
export function postfachregelnAnmelden(): void {
  regelAnmelden('nachricht', 'postfach', {
    async vor(c, _b, _vorher, werte) {
      if (!werte?.postfach) return;
      const r = (await c.query("select (select inhaber from o_postfach where id = $1 and not geloescht) = bp_ich() or current_setting('bp.system', true) = 'an' as ok", [werte.postfach])).rows[0];
      if (!r?.ok) throw new Ablehnung('Über dieses Postfach kann nur seine Inhaberin bzw. sein Inhaber schreiben');
    },
  });
}

export function postfachRouten(app_: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  const { db } = e;
  const meins = async (wer: string) => (await db.query('select id from o_postfach where inhaber = $1 and not geloescht', [wer])).rows[0]?.id as string | undefined;
  const pfAus = (b: unknown) => { const pf = String((b as { postfach?: unknown } | null)?.postfach ?? BUERO); if (pf !== BUERO && !/^[0-9a-f-]{36}$/i.test(pf)) throw new Ablehnung('Unbekanntes Postfach'); return pf; };

  app_.get('/api/postfach/zustand', { preHandler: e.nurAngemeldet }, async (req) => {
    const lage = async (pf: PostfachId) => ({ kennwort: (await geheimnisLesen(db, geheim(pf, 'kennwort'))) !== null, m365: (await geheimnisLesen(db, geheim(pf, 'm365'))) !== null });
    const mein = await meins(req.benutzer!.id);
    return { buero: await lage(BUERO), mein: mein ? { id: mein, ...(await lage(mein)) } : null, appGeheimnis: (await geheimnisLesen(db, APP_GEHEIMNIS)) !== null, nurTest: e.umgebung === 'test' };
  });
  // das eigene Postfach anlegen oder ändern (Mein Konto) – nur die Felder der Verbindung, geprüft wie jede Eingabe
  app_.post('/api/postfach/mein', { preHandler: e.nurAngemeldet }, async (req) => {
    const w = (req.body ?? {}) as Record<string, unknown>, werte: Werte = {};
    for (const k of FELDER) if (k in w) werte[k] = w[k] as Werte[string];
    const da = await meins(req.benutzer!.id), id = da ?? randomUUID();
    await befehlAusfuehren(db, e.register, SYSTEM, { id: randomUUID(), gesehen: ALLES_GESEHEN, objekt: 'postfach', art: da ? 'aendern' : 'anlegen', objektId: id, werte: da ? werte : { inhaber: req.benutzer!.id, ...werte } });
    e.nachBefehlen();
    return { id };
  });
  app_.post('/api/postfach/kennwort', { preHandler: e.nurAngemeldet }, async (req) => {
    const pf = pfAus(req.body); await darfEinrichten(db, req, pf, true);
    const k = (req.body as { kennwort?: unknown }).kennwort;
    if (typeof k !== 'string' || !k) throw new Eingabefehler({ kennwort: 'Bitte das Kennwort eintragen' });
    await geheimnisSetzen(db, geheim(pf, 'kennwort'), k);
    return { ok: true };
  });
  app_.post('/api/postfach/app-geheimnis', { preHandler: e.nurAngemeldet }, async (req) => {
    await pruefeBereich(e.db, req, 'zugaenge', 'schreiben');
    const k = (req.body as { geheimnis?: unknown } | null)?.geheimnis;
    if (typeof k !== 'string' || !k) throw new Eingabefehler({ geheimnis: 'Bitte das Geheimnis der App eintragen' });
    await geheimnisSetzen(db, APP_GEHEIMNIS, k);
    return { ok: true };
  });
  // Prüfen meldet sich nur an – verschickt wird dabei nichts (auch nicht auf dem Testserver)
  app_.post('/api/postfach/pruefen', { preHandler: e.nurAngemeldet }, async (req) => {
    const pf = pfAus(req.body); await darfEinrichten(db, req, pf);
    try { await (await sender(db, e.register, pf)).pruefen(); } catch (err) { throw new Ablehnung(`Das Postfach nimmt die Anmeldung nicht an: ${(err as Error).message}`); }
    return { ok: true };
  });

  // Mit Microsoft anmelden: der Browser geht zu Microsoft und kommt mit einem Code zurück; gespeichert wird nur die Anmeldung
  const offen = new Map<string, { pf: PostfachId; wer: string; zurueck: string; bis: number }>();
  const adresseZurueck = (req: FastifyRequest) => `${process.env.BAUPORTAL_URL?.replace(/\/$/, '') || `${String(req.headers['x-forwarded-proto'] ?? req.protocol)}://${String(req.headers['x-forwarded-host'] ?? req.headers.host)}`}/api/postfach/m365/zurueck`;
  app_.post('/api/postfach/m365/start', { preHandler: e.nurAngemeldet }, async (req) => {
    const pf = pfAus(req.body); await darfEinrichten(db, req, pf, true);
    const { buero } = await laden(db, e.register, pf), a = await app(db, buero), state = randomBytes(24).toString('hex'), zurueck = adresseZurueck(req);
    for (const [k, v] of offen) if (v.bis < Date.now()) offen.delete(k);
    offen.set(state, { pf, wer: req.benutzer!.id, zurueck, bis: Date.now() + 15 * 60000 });
    return { adresse: anmeldeAdresse(a, zurueck, state) };
  });
  app_.get('/api/postfach/m365/zurueck', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error_description?: string };
    const o = q.state ? offen.get(q.state) : undefined; if (q.state) offen.delete(q.state);
    const seite = (text: string) => reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>Bauportal</title><p style="font:16px system-ui;margin:2rem">${text.replace(/</g, '&lt;')}</p><script>setTimeout(()=>{try{window.close()}catch{}},2500)</script>`);
    if (!o || o.bis < Date.now() || !q.code) return seite(`Die Anmeldung bei Microsoft hat nicht geklappt${q.error_description ? `: ${q.error_description}` : ''}. Bitte im Bauportal noch einmal „Mit Microsoft anmelden“.`);
    try {
      const { buero } = await laden(db, e.register, o.pf), t = await tokenHolen(await app(db, buero), { grant_type: 'authorization_code', code: q.code, redirect_uri: o.zurueck });
      if (!t.refresh_token) throw new Ablehnung('Microsoft hat keine dauerhafte Anmeldung geliefert (Berechtigung offline_access fehlt)');
      const ich = await (await fetch(`${GRAPH}/v1.0/me`, { headers: { authorization: `Bearer ${t.access_token}` } })).json() as { mail?: string; userPrincipalName?: string };
      await geheimnisSetzen(db, geheim(o.pf, 'm365'), t.refresh_token);
      const konto = String(ich.mail || ich.userPrincipalName || '');
      await befehlAusfuehren(db, e.register, SYSTEM, { id: randomUUID(), gesehen: ALLES_GESEHEN, objekt: o.pf === BUERO ? 'mailserver' : 'postfach', art: 'aendern', objektId: o.pf === BUERO ? MAILSERVER_ID : o.pf,
        werte: { m365_konto: konto, art: 'm365' } });
      e.nachBefehlen();
      return seite(`Angemeldet bei Microsoft 365 als ${konto}. Dieses Fenster kann geschlossen werden.`);
    } catch (err) { return seite((err as Error).message); }
  });
}
