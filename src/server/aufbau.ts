// Aufbau des Programms für die Verwaltung (Punkt 31): was beim Bauen aus dem Quelltext gelesen wurde (tools/aufbau.mjs),
// dazu was nur das laufende Programm weiß – seine Server-Stellen, die Hilfsdienste und die Tabellen der Datenbank.
// Als Daten für die grafische Ansicht und als Text für Entwickler:innen und KI.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Modulregister } from '../kern/modul';
import type { Db } from './db';
import { Ablehnung } from './protokoll';

export interface Baustein { pfad: string; bereich: string; zeilen: number; beschreibung: string; bindetEin: string[]; stelltBereit: string[] }
export interface Quelltext { erzeugt: string; bereiche: { id: string; titel: string; text: string }[]; bausteine: Baustein[] }
const DIENSTE = [
  { name: 'Dateidienst', env: 'DATEIDIENST_URL', vorgabe: 'http://dateidienst:8000', zweck: 'spricht mit dem Dateiserver (SMB): lesen, ablegen' },
  { name: 'IFC-Dienst', env: 'IFCDIENST_URL', vorgabe: 'http://ifcdienst:8000', zweck: 'liest IFC-Dateien fürs Gebäudemodell' },
  { name: 'Druckdienst', env: 'DRUCKDIENST_URL', vorgabe: 'http://druckdienst:8000', zweck: 'macht aus der fertigen Seite das PDF (Chromium)' },
  { name: 'KI-Ausgang', env: 'KIDIENST_URL', vorgabe: 'http://kidienst:8000', zweck: 'die eine Stelle, die mit einer KI spricht' },
];

let quelltext: Quelltext | null | undefined;
function lies(): Quelltext | null {
  if (quelltext !== undefined) return quelltext;
  const datei = [process.env.AUFBAU_DATEI, path.join(path.dirname(fileURLToPath(import.meta.url)), 'aufbau.json')].find((p) => p && existsSync(p));
  return (quelltext = datei ? (JSON.parse(readFileSync(datei, 'utf8')) as Quelltext) : null);
}

/** Der Aufbau als Text – zum Weitergeben an Entwickler:innen oder an eine KI. */
export function aufbauText(register: Modulregister, q: Quelltext | null, routen: string[]): string {
  const z: string[] = ['# Bauportal – Aufbau', '', `Erzeugt aus dem laufenden Programm${q ? ` (Quelltext gelesen am ${q.erzeugt.slice(0, 10)})` : ''}.`, '',
    '## Grundsätze', '- Das Datenmodell wird einmal beschrieben (Beipackzettel der Module); Tabellen, Prüfung, Masken und Ausdrucke entstehen daraus.',
    '- Jede Änderung ist ein Befehl im Protokoll (Rückgängig, Abgleich, Herkunft je Wert). Rechte sitzen in der Datenbank.',
    '- Die Oberfläche besteht aus fertigen Bausteinen; Module stellen nur an vorgesehenen Stellschrauben.', '', '## Module und Objekte'];
  for (const m of register.module) {
    z.push('', `### ${m.name} (\`${m.id}\`, braucht: ${m.braucht.join(', ') || '–'})`, m.beschreibung);
    for (const o of m.objekte) {
      z.push('', `**${o.titel}** (\`${o.name}\`)${o.projektFeld ? ' – gehört zu einem Projekt' : ''}${o.versionsBereich ? `, in Versionen (${o.versionsBereich})` : ''} · lesen: ${o.rechte.lesen.join(', ') || 'nur Admin'} · schreiben: ${o.rechte.schreiben.join(', ') || 'nur Admin'}`);
      for (const f of o.felder) z.push(`- \`${f.name}\` ${f.art}${f.ziel ? ` → ${f.ziel}` : ''}${f.pflicht ? ', Pflicht' : ''} – ${f.titel}`);
    }
    if (m.ausdrucke?.length) z.push('', `Ausdrucke: ${m.ausdrucke.map((a) => `${a.titel} (${a.objekt})`).join(', ')}`);
    if (m.kataloge?.length) z.push(`Kataloge: ${m.kataloge.map((k) => `${k.titel} → ${k.objekt}`).join(', ')}`);
  }
  if (q) for (const b of q.bereiche) {
    z.push('', `## ${b.titel}`, b.text);
    for (const d of q.bausteine.filter((x) => x.bereich === b.id)) z.push('', `### \`${d.pfad}\` (${d.zeilen} Zeilen)`, d.beschreibung || '(ohne Beschreibung)', ...(d.stelltBereit.length ? [`Stellt bereit: ${d.stelltBereit.join(', ')}`] : []), ...(d.bindetEin.length ? [`Bindet ein: ${d.bindetEin.join(', ')}`] : []));
  }
  z.push('', '## Server-Stellen', ...routen.map((r) => `- ${r}`), '', '## Hilfsdienste', ...DIENSTE.map((d) => `- ${d.name}: ${d.zweck}`));
  return z.join('\n') + '\n';
}

export function aufbauRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; routen: string[]; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  const admin = (req: FastifyRequest) => { if (req.benutzer!.rolle !== 'admin') throw new Ablehnung('Das dürfen nur Administrator:innen'); };

  app.get('/api/aufbau', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const dienste = await Promise.all(DIENSTE.map(async (d) => {
      try {
        const r = await fetch(`${process.env[d.env] ?? d.vorgabe}/health`, { signal: AbortSignal.timeout(3000) });
        return { name: d.name, zweck: d.zweck, erreichbar: r.ok, version: r.ok ? String(((await r.json()) as { version?: string }).version ?? '') : '' };
      } catch { return { name: d.name, zweck: d.zweck, erreichbar: false, version: '' }; }
    }));
    const tabellen = (await e.db.query("select c.relname as name, greatest(c.reltuples, 0)::bigint as zeilen from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'kern\\_%' or c.relname like 'o\\_%') order by 1")).rows;
    return { quelltext: lies(), routen: e.routen, dienste, tabellen };
  });

  app.get('/api/aufbau/text', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    admin(req);
    return reply.header('content-type', 'text/markdown; charset=utf-8').header('content-disposition', "attachment; filename*=UTF-8''Bauportal-Aufbau.md").send(aufbauText(e.register, lies(), e.routen));
  });
}
