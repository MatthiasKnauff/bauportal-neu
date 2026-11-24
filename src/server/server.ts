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
import { Ablehnung, befehlAusfuehren, befehleSeit, schnappschuss, stand } from './protokoll';
import * as anm from './anmeldung';

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
  await app.register(cookie);
  const dbKennung = await kennung(db);

  // ---------- Live-Strom: neue Befehle gehen an alle verbundenen Geräte ----------
  const geraete = new Set<ServerResponse>();
  let gesendet = await stand(db);
  let kette: Promise<unknown> = Promise.resolve();
  const nacheinander = <T>(f: () => Promise<T>): Promise<T> => {
    const p = kette.then(f, f);
    kette = p.catch(() => undefined);
    return p;
  };
  const schreibe = (r: ServerResponse, b: Protokolliert) => r.write(`id: ${b.seq}\ndata: ${JSON.stringify(b)}\n\n`);
  const verteilen = () => nacheinander(async () => {
    const neu = await befehleSeit(db, gesendet);
    for (const b of neu) {
      for (const g of geraete) schreibe(g, b);
      gesendet = b.seq;
    }
  });
  const puls = setInterval(() => { for (const g of geraete) g.write(': puls\n\n'); }, 25000);
  app.addHook('onClose', async () => { clearInterval(puls); for (const g of geraete) g.end(); });

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
  const nurAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.benutzer) return reply.code(401).send({ fehler: 'Bitte anmelden' });
    if (req.benutzer.rolle !== 'admin') return reply.code(403).send({ fehler: 'Das dürfen nur Administrator:innen' });
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
  }));

  app.post('/api/einrichtung', async (req, reply) => {
    const b = await anm.ersteinrichtung(db, (req.body ?? {}) as Record<string, unknown>);
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

  app.get('/api/benutzer', { preHandler: nurAdmin }, async () => ({ benutzer: await anm.alleBenutzer(db) }));
  app.post('/api/benutzer', { preHandler: nurAdmin }, async (req) => {
    const k = (req.body ?? {}) as Record<string, unknown>;
    return { benutzer: await anm.benutzerAnlegen(db, { ...k, rolle: k.rolle === 'admin' ? 'admin' : 'mitarbeiter' }) };
  });

  // ---------- Abgleich ----------
  app.get('/api/schnappschuss', { preHandler: nurAngemeldet }, async () => ({ kennung: dbKennung, ...(await schnappschuss(db, register)) }));

  app.post('/api/befehle', { preHandler: nurAngemeldet }, async (req) => {
    const liste = ((req.body ?? {}) as { befehle?: unknown[] }).befehle;
    if (!Array.isArray(liste) || liste.length > 500) throw new Ablehnung('Befehle fehlen');
    const ergebnis: { id: string; seq?: number; fehler?: string; felder?: Record<string, string> }[] = [];
    for (const roh of liste) {
      const id = String((roh as { id?: unknown })?.id ?? '');
      try {
        const p = await befehlAusfuehren(db, register, req.benutzer!, roh);
        ergebnis.push({ id, seq: p.seq });
      } catch (err) {
        if (err instanceof Eingabefehler) ergebnis.push({ id, fehler: err.message, felder: err.felder });
        else if (err instanceof Ablehnung) ergebnis.push({ id, fehler: err.message });
        else throw err;
      }
    }
    void verteilen();
    return { ergebnis };
  });

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
    await nacheinander(async () => {
      // Erst alles nachliefern, was dem Gerät fehlt, dann hängt es am Live-Strom.
      let ab = seit;
      for (;;) {
        const teil = await befehleSeit(db, ab, 2000);
        for (const b of teil) schreibe(r, b);
        if (teil.length < 2000) break;
        ab = teil[teil.length - 1]!.seq;
      }
      r.write(`event: aktuell\ndata: {}\n\n`);
      geraete.add(r);
    });
    req.raw.on('close', () => geraete.delete(r));
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
