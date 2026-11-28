// Schnittstelle für die Prüf-KI: Eine andere KI kontrolliert und berät das Bauportal. Sie liest den Aufbau (Netz,
// Umfeld, Prüfregeln), den Quelltext und den Zustand des Betriebs – nie Daten aus Projekten – und schickt Ratschläge
// zurück, die in Verwaltung → Ratschläge landen. Ändern kann sie nichts. Zugang nur mit einem Prüf-Schlüssel, den
// Administrator:innen in Verwaltung → Prüf-KI erzeugen (einmal angezeigt, gespeichert nur als Prüfsumme).
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { REGELN, codeNetz, datenNetz, pruefen, umfeld, type Netz } from '../kern/aufbaunetz';
import { KENNUNG } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import { geheimnisLesen, geheimnisSetzen } from './ablage';
import { aufbauText, dateiText, diensteZustand, lies } from './aufbau';
import { SYSTEM, type Db } from './db';
import { pruefeBereich } from './bereich';
import { Ablehnung, befehlAusfuehren, ALLES_GESEHEN } from './protokoll';

const pruefsumme = (t: string) => createHash('sha256').update(t).digest('hex');
const OFFEN_HOECHSTENS = 100;

declare module 'fastify' { interface FastifyRequest { pruefzugang?: { id: string; name: string } } }

export function prueferRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; routen: string[]; version: string; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  // Schlüssel: bpp_<Kennung des Zugangs>_<Zufall>; geprüft gegen die gespeicherte Prüfsumme, nur bei eingeschaltetem Zugang
  const nurPruefer = async (req: FastifyRequest, reply: FastifyReply) => {
    const m = /^Bearer bpp_([0-9a-f-]{36})_([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization ?? '');
    const fehlt = () => reply.code(401).send({ fehler: 'Prüf-Schlüssel fehlt oder gilt nicht' });
    if (!m) return fehlt();
    const z = (await e.db.query('select id, name from o_pruefzugang where id = $1 and aktiv and not geloescht', [m[1]])).rows[0];
    const soll = z ? await geheimnisLesen(e.db, `pruef.${m[1]}`) : null;
    const ist = pruefsumme(`${m[1]}_${m[2]}`);
    if (!z || !soll || !timingSafeEqual(Buffer.from(soll), Buffer.from(ist))) return fehlt();
    req.pruefzugang = { id: z.id, name: z.name };
  };
  const netz = (sicht: unknown): Netz => {
    if (sicht === 'code') { const q = lies(); if (!q) throw new Ablehnung('Der Quelltext-Aufbau liegt nur im gebauten Programm vor'); return codeNetz(q); }
    if (sicht === 'daten' || sicht === undefined) return datenNetz(e.register.module);
    throw new Ablehnung('sicht ist „daten“ oder „code“');
  };

  // Für den Bereich Prüfung (ändern): Schlüssel erzeugen (ein neuer ersetzt den alten)
  app.post('/api/pruefer/schluessel', { preHandler: e.nurAngemeldet }, async (req) => {
    await pruefeBereich(e.db, req, 'pruefung', 'schreiben');
    const id = String((req.body as { zugang?: unknown } | null)?.zugang ?? '');
    if (!KENNUNG.test(id) || !(await e.db.query('select 1 from o_pruefzugang where id = $1 and not geloescht', [id])).rowCount) throw new Ablehnung('Den Zugang gibt es nicht');
    const geheim = randomBytes(24).toString('base64url');
    await geheimnisSetzen(e.db, `pruef.${id}`, pruefsumme(`${id}_${geheim}`));
    return { schluessel: `bpp_${id}_${geheim}` };
  });

  const P = { preHandler: nurPruefer };
  app.get('/api/pruefer', P, async (req) => ({
    bauportal: 'Bauportal (Neuaufbau) – Schnittstelle für die Prüf-KI', version: e.version, umgebung: e.umgebung, zugang: req.pruefzugang!.name,
    auftrag: 'Kontrolliere den Aufbau und berate uns: Wo verstößt etwas gegen die Regeln, wo lässt sich vereinfachen, wo fehlt etwas? Ändern kannst du nichts – schicke Ratschläge. Daten aus Projekten siehst du nicht.',
    grundsaetze: 'Siehe CLAUDE.md im Quelltext: kein alter Code, Ursache statt zusätzlicher Absicherungen, Bausteine wiederverwenden, Datenmodell einmal beschreiben, jede Änderung ein Befehl im Protokoll, Rechte in der Datenbank, höchstens 50 ms je Klick.',
    regeln: REGELN,
    wege: {
      'GET /api/pruefer/aufbau': 'der ganze Aufbau als Text (Markdown): Module, Objekte, Felder, Dateien, Server-Stellen',
      'GET /api/pruefer/netz?sicht=daten|code': 'Bausteine, Gruppen und Kanten (Verweise bzw. „bindet ein“)',
      'GET /api/pruefer/umfeld?sicht=daten|code&wahl=<id>&tiefe=1|2': 'Herkunft und Ziel eines Bausteins',
      'GET /api/pruefer/pruefung': 'Befunde der Prüfregeln',
      'GET /api/pruefer/quelltext?pfad=<pfad>': 'Text einer Datei (Pfade aus netz?sicht=code oder aufbau)',
      'GET /api/pruefer/betrieb': 'Version, Hilfsdienste, Server-Stellen, Tabellennamen',
      'GET /api/pruefer/ratschlaege': 'deine Ratschläge mit Stand und unserer Antwort',
      'POST /api/pruefer/ratschlag': '{ titel, text, baustein?, regel? } – ein neuer Ratschlag',
    },
  }));
  app.get('/api/pruefer/aufbau', P, async (_req, reply) => reply.header('content-type', 'text/markdown; charset=utf-8').send(aufbauText(e.register, lies(), e.routen)));
  app.get('/api/pruefer/netz', P, async (req) => netz((req.query as { sicht?: string }).sicht));
  app.get('/api/pruefer/umfeld', P, async (req) => {
    const q = req.query as { sicht?: string; wahl?: string; tiefe?: string };
    const n = netz(q.sicht);
    if (!n.knoten.some((k) => k.id === q.wahl)) throw new Ablehnung('wahl: einen Baustein aus netz angeben');
    return { wahl: q.wahl, spalten: umfeld(n, q.wahl!, q.tiefe === '2' ? 2 : 1) };
  });
  app.get('/api/pruefer/pruefung', P, async () => ({ regeln: REGELN, befunde: pruefen(lies(), e.register.module) }));
  app.get('/api/pruefer/quelltext', P, async (req, reply) => {
    const t = dateiText(String((req.query as { pfad?: string }).pfad ?? ''));
    if (t === null) throw new Ablehnung('Diese Datei kennt der Aufbau nicht');
    return reply.header('content-type', 'text/plain; charset=utf-8').send(t);
  });
  app.get('/api/pruefer/betrieb', P, async () => ({
    version: e.version, umgebung: e.umgebung, dienste: await diensteZustand(), routen: e.routen,
    tabellen: (await e.db.query("select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'kern\\_%' or c.relname like 'o\\_%') order by 1")).rows.map((r) => r.name as string),
  }));
  app.get('/api/pruefer/ratschlaege', P, async (req) => (await e.db.query(
    "select id, titel, stand, baustein, regel, text, antwort, eingang from o_pruefrat where zugang = $1 and not geloescht order by eingang desc nulls last, titel", [req.pruefzugang!.id])).rows);
  app.post('/api/pruefer/ratschlag', P, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const text = (k: string, max: number) => String(b[k] ?? '').trim().slice(0, max);
    if (!text('titel', 200)) throw new Ablehnung('titel fehlt');
    const offen = Number((await e.db.query("select count(*) from o_pruefrat where zugang = $1 and stand = 'offen' and not geloescht", [req.pruefzugang!.id])).rows[0].count);
    if (offen >= OFFEN_HOECHSTENS) throw new Ablehnung(`Es sind schon ${OFFEN_HOECHSTENS} Ratschläge offen – bitte warten, bis wir sie beantwortet haben`);
    const id = randomUUID();
    await befehlAusfuehren(e.db, e.register, SYSTEM, { id: randomUUID(), gesehen: ALLES_GESEHEN, herkunft: 'pruef_ki', objekt: 'pruefrat', art: 'anlegen', objektId: id, werte: {
      titel: text('titel', 200), text: text('text', 8000), baustein: text('baustein', 300), regel: text('regel', 100), stand: 'offen', antwort: '',
      eingang: new Date().toLocaleDateString('sv', { timeZone: 'Europe/Berlin' }), zugang: req.pruefzugang!.id,
    } });
    e.nachBefehlen();
    return { id };
  });
}
