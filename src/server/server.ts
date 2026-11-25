// Der Server: ein Programm für Oberfläche, Anmeldung, Befehle und Abgleich.
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import statisch from '@fastify/static';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import type { Modulregister } from '../kern/modul';
import { Eingabefehler } from '../kern/modell';
import type { Protokolliert } from '../kern/befehl';
import { kennung, type Db } from './db';
import { ROLLEN } from '../kern/rechte';
import { Ablehnung, befehlAusfuehren, befehleSeit, schnappschuss, stand } from './protokoll';
import * as anm from './anmeldung';
import { versionKopieren, versionsregelnAnmelden } from './versionen';
import { gebaeudemodellRegelnAnmelden } from './gebaeudemodell';
import { ablageRouten } from './ablage';
import { ifcRouten } from './ifc';
import { assistentRouten } from './assistent';
import { uebernahmeRouten } from './uebernahme';
import { druckRouten } from './druck';
import { kiRouten } from './ki';
import { updateRouten } from './updates';
import { wetterRouten } from './wetter';
import { fotoRouten } from './foto';
import { aufbauRouten } from './aufbau';
import { altdatenRouten } from './altdaten';

export interface Einstellungen {
  db: Db;
  register: Modulregister;
  version: string;
  umgebung: string;
  uiVerzeichnis?: string;
}

const COOKIE = 'bp_sitzung';

declare module 'fastify' {
  interface FastifyRequest { benutzer: anm.Benutzer | null }
}

export async function baueServer(e: Einstellungen): Promise<FastifyInstance> {
  const { db, register } = e;
  const app = Fastify({ trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
  // jede Server-Stelle merken – die Verwaltung zeigt sie unter „Aufbau“
  const routen: string[] = [];
  app.addHook('onRoute', (r) => { if (r.url.startsWith('/api/') || r.url === '/health') for (const m of [r.method].flat()) if (m !== 'HEAD') routen.push(`${m} ${r.url}`); });
  await app.register(cookie);
  const dbKennung = await kennung(db);
  versionsregelnAnmelden(register);
  gebaeudemodellRegelnAnmelden();

  // ---------- Live-Strom: neue Befehle gehen an alle verbundenen Geräte ----------
  interface Geraet { r: ServerResponse; wer: anm.Benutzer; pos: number }
  const geraete = new Set<Geraet>();
  let kette: Promise<unknown> = Promise.resolve();
  const nacheinander = <T>(f: () => Promise<T>): Promise<T> => {
    const p = kette.then(f, f);
    kette = p.catch(() => undefined);
    return p;
  };
  const schreibe = (r: ServerResponse, b: Protokolliert) => r.write(`id: ${b.seq}\ndata: ${JSON.stringify(b)}\n\n`);
  // Jedes Gerät bekommt nur, was sein Benutzer sehen darf – gefiltert von der Datenbank.
  const verteilen = (rechteGeaendert = false) => nacheinander(async () => {
    const ziel = await stand(db);
    for (const g of [...geraete]) {
      if (rechteGeaendert && !(await anm.istAktiv(db, g.wer.id))) { g.r.end(); geraete.delete(g); continue; }
      if (g.pos < ziel) {
        for (const b of await befehleSeit(db, g.wer, g.pos)) schreibe(g.r, b);
        g.pos = ziel;
      }
      if (rechteGeaendert) g.r.write('event: rechte\ndata: {}\n\n');
    }
  });
  const puls = setInterval(() => { for (const g of geraete) g.r.write(': puls\n\n'); }, 25000);
  app.addHook('onClose', async () => { clearInterval(puls); for (const g of geraete) g.r.end(); });

  // ---------- Fehler in verständlicher Form ----------
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof Eingabefehler) return reply.code(400).send({ fehler: err.message, felder: err.felder });
    if (err instanceof Ablehnung) return reply.code(409).send({ fehler: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
    app.log.error(err);
    console.error(err);
    return reply.code(500).send({ fehler: 'Auf dem Server ist ein Fehler aufgetreten' });
  });

  // ---------- Sitzung ----------
  app.decorateRequest('benutzer', null);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    // Schreibende Aufrufe nur von der eigenen Seite
    const herkunft = req.headers.origin;
    if (req.method !== 'GET' && herkunft && new URL(herkunft).host !== req.host) {
      return reply.code(403).send({ fehler: 'Aufruf von fremder Seite abgelehnt' });
    }
    req.benutzer = await anm.sitzungBenutzer(db, req.cookies[COOKIE]);
  });
  const nurAngemeldet = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.benutzer) return reply.code(401).send({ fehler: 'Bitte anmelden' });
  };
  const setzeCookie = (req: FastifyRequest, reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.protocol === 'https', maxAge: anm.SITZUNG_TAGE * 86400 });

  // Bremse gegen Kennwort-Raten: nach 5 Fehlversuchen eine Minute Pause
  const fehlversuche = new Map<string, { anzahl: number; bis: number }>();

  app.get('/health', async () => ({ status: 'ok', version: e.version, umgebung: e.umgebung }));

  app.get('/api/zustand', async (req) => ({
    version: e.version,
    umgebung: e.umgebung,
    kennung: dbKennung,
    eingerichtet: await anm.eingerichtet(db),
    benutzer: req.benutzer,
    module: register.module,
    rollen: ROLLEN,
    ...(req.benutzer ? await anm.meineRechte(db, register, req.benutzer) : {}),
  }));

  app.post('/api/einrichtung', async (req, reply) => {
    const b = await anm.ersteinrichtung(db, register, (req.body ?? {}) as anm.Einrichtung);
    setzeCookie(req, reply, await anm.sitzungAnlegen(db, b.id));
    return { benutzer: b };
  });

  app.post('/api/anmelden', async (req, reply) => {
    const { anmeldename, kennwort } = (req.body ?? {}) as Record<string, unknown>;
    const schluessel = `${req.ip}|${String(anmeldename).toLowerCase()}`;
    const f = fehlversuche.get(schluessel);
    if (f && f.anzahl >= 5 && f.bis > Date.now()) return reply.code(429).send({ fehler: 'Zu viele Fehlversuche – bitte eine Minute warten' });
    const ok = await anm.anmelden(db, anmeldename, kennwort);
    if (!ok) {
      fehlversuche.set(schluessel, { anzahl: (f && f.bis > Date.now() ? f.anzahl : 0) + 1, bis: Date.now() + 60000 });
      return reply.code(401).send({ fehler: 'Anmeldename oder Kennwort stimmt nicht' });
    }
    fehlversuche.delete(schluessel);
    setzeCookie(req, reply, ok.token);
    return { benutzer: ok.benutzer };
  });

  app.post('/api/abmelden', async (req, reply) => {
    await anm.abmelden(db, req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  // Kennwort: das eigene ändern (mit dem alten Kennwort) oder – als Administrator:in – das eines anderen setzen.
  app.post('/api/kennwort', { preHandler: nurAngemeldet }, async (req, reply) => {
    const k = (req.body ?? {}) as { benutzerId?: string; kennwort?: unknown; altesKennwort?: unknown };
    const ich = req.benutzer!;
    const ziel = k.benutzerId ?? ich.id;
    if (ziel !== ich.id) {
      if (ich.rolle !== 'admin') return reply.code(403).send({ fehler: 'Das dürfen nur Administrator:innen' });
      if (!(await db.query('select 1 from o_benutzer where id = $1 and not geloescht', [ziel])).rowCount) throw new Ablehnung('Benutzer gibt es nicht');
    } else if (!(await anm.kennwortStimmt(db, ich.id, k.altesKennwort))) {
      throw new Eingabefehler({ altesKennwort: 'Das bisherige Kennwort stimmt nicht' });
    }
    await anm.kennwortSetzen(db, ziel, k.kennwort);
    await anm.andereSitzungenBeenden(db, ziel, ziel === ich.id ? req.cookies[COOKIE] : undefined);
    return { ok: true };
  });

  // ---------- Abgleich ----------
  app.get('/api/schnappschuss', { preHandler: nurAngemeldet }, async (req) => ({ kennung: dbKennung, ...(await schnappschuss(db, register, req.benutzer!)) }));

  app.post('/api/befehle', { preHandler: nurAngemeldet }, async (req) => {
    const liste = ((req.body ?? {}) as { befehle?: unknown[] }).befehle;
    if (!Array.isArray(liste) || liste.length > 500) throw new Ablehnung('Befehle fehlen');
    const ergebnis: { id: string; seq?: number; fehler?: string; felder?: Record<string, string> }[] = [];
    let rechteGeaendert = false;
    for (const roh of liste) {
      const id = String((roh as { id?: unknown })?.id ?? '');
      try {
        const p = await befehlAusfuehren(db, register, req.benutzer!, roh);
        ergebnis.push({ id, seq: p.seq });
        if (p.objekt === 'benutzer' || p.objekt === 'recht' || p.objekt === 'projekt_mitglied') rechteGeaendert = true;
      } catch (err) {
        if (err instanceof Eingabefehler) ergebnis.push({ id, fehler: err.message, felder: err.felder });
        else if (err instanceof Ablehnung) ergebnis.push({ id, fehler: err.message });
        else throw err;
      }
    }
    void verteilen(rechteGeaendert);
    return { ergebnis };
  });

  app.post('/api/version/kopieren', { preHandler: nurAngemeldet }, async (req) => {
    const p = await versionKopieren(db, register, req.benutzer!, (req.body ?? {}) as Record<string, unknown>);
    void verteilen();
    return { versionId: p.objektId, seq: p.seq };
  });

  ablageRouten(app, { db, umgebung: e.umgebung, nurAngemeldet });
  ifcRouten(app, { db, register, nurAngemeldet });
  assistentRouten(app, { db, register, nurAngemeldet });
  druckRouten(app, { db, register, umgebung: e.umgebung, nurAngemeldet });
  kiRouten(app, { db, nurAngemeldet });
  wetterRouten(app, { db, nurAngemeldet });
  fotoRouten(app, { db, register, umgebung: e.umgebung, nurAngemeldet, nachBefehlen: () => void verteilen() });
  aufbauRouten(app, { db, register, routen, nurAngemeldet });
  altdatenRouten(app, { db, register, umgebung: e.umgebung, nurAngemeldet, nachBefehlen: () => void verteilen() });
  updateRouten(app, { db, register, version: e.version, umgebung: e.umgebung, nurAngemeldet });
  uebernahmeRouten(app, { db, register, nurAngemeldet, nachBefehlen: () => void verteilen() });

  app.get('/api/strom', { preHandler: nurAngemeldet }, async (req, reply) => {
    const q = Number((req.query as { seit?: string }).seit ?? 0);
    const letzte = Number(req.headers['last-event-id'] ?? 0);
    const seit = Math.max(Number.isFinite(q) ? q : 0, Number.isFinite(letzte) ? letzte : 0);
    reply.hijack();
    const r = reply.raw;
    r.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    r.write('retry: 2000\n\n');
    const wer = req.benutzer!;
    const g: Geraet = { r, wer, pos: 0 };
    await nacheinander(async () => {
      // Erst alles nachliefern, was dem Gerät fehlt, dann hängt es am Live-Strom.
      g.pos = await stand(db);
      let ab = seit;
      for (;;) {
        const teil = await befehleSeit(db, wer, ab, 2000);
        for (const b of teil) schreibe(r, b);
        if (teil.length < 2000) break;
        ab = teil[teil.length - 1]!.seq;
      }
      r.write(`event: aktuell\ndata: {}\n\n`);
      geraete.add(g);
    });
    req.raw.on('close', () => geraete.delete(g));
  });

  // ---------- Oberfläche ----------
  if (e.uiVerzeichnis && existsSync(e.uiVerzeichnis)) {
    await app.register(statisch, {
      root: e.uiVerzeichnis,
      setHeaders(res, pfad) {
        if (pfad.includes('/assets/')) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else res.header('Cache-Control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ fehler: 'Nicht gefunden' });
    });
  }
  return app;
}
