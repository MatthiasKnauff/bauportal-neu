// Handbuch im Bauportal (Entscheidung 25.11.2026): HTML und PDF in drei Stufen, entsteht aus dem Programm (kern/handbuch).
// Neu erzeugt wird nachts um 3:00 – und nur, wenn sich der Inhalt geändert hat (z. B. nach einem Update); fehlt es beim Start,
// sofort. Zugang abgestuft: Anwender:innen alle, Administrator:innen und Entwickler:innen nur Admins (die Prüf-KI über ihren Weg).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { STUFEN, handbuchHtml, type Handbuchstufe } from '../kern/handbuch';
import type { Modulregister } from '../kern/modul';
import { aufbauText, lies } from './aufbau';
import type { Db } from './db';
import { pdfAus } from './druck';
import { Ablehnung } from './protokoll';

const ordner = () => path.join(process.env.DATEN_PFAD ?? '/data', 'handbuch');
const datei = (stufe: Handbuchstufe, endung: 'html' | 'pdf' | 'hash') => path.join(ordner(), `${stufe}.${endung}`);

/** Erzeugt die Handbücher neu, deren Inhalt sich geändert hat. Liefert, welche neu sind. */
export async function handbuecherErzeugen(e: { db: Db; register: Modulregister; version: string; routen: string[] }): Promise<Handbuchstufe[]> {
  mkdirSync(ordner(), { recursive: true });
  const buero = String((await e.db.query('select name from o_buero limit 1')).rows[0]?.name ?? '');
  const neu: Handbuchstufe[] = [];
  for (const { wert: stufe } of STUFEN) {
    // ohne Datum gerechnet: nur ein anderer Inhalt zählt als Änderung
    const roh = handbuchHtml(e.register.module, stufe, { buero, version: e.version, erzeugt: '', aufbau: stufe === 'entwickler' ? aufbauText(e.register, lies(), e.routen) : undefined });
    const hash = createHash('sha256').update(roh).digest('hex');
    if (existsSync(datei(stufe, 'hash')) && readFileSync(datei(stufe, 'hash'), 'utf8') === hash && existsSync(datei(stufe, 'html'))) continue;
    const html = roh.replace(' · erzeugt am  aus dem Programm', ` · erzeugt am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })} aus dem Programm`);
    writeFileSync(datei(stufe, 'html'), html);
    try { writeFileSync(datei(stufe, 'pdf'), await pdfAus(html)); } catch { /* ohne Druckdienst: HTML ist da, das PDF kommt beim nächsten Lauf */ continue; }
    writeFileSync(datei(stufe, 'hash'), hash);
    neu.push(stufe);
  }
  return neu;
}

/** Nachts um 3:00 (Zeit in Berlin) prüfen und bei Änderungen neu erzeugen. */
function naechsteNacht(): number {
  const jetzt = new Date(), berlin = new Date(jetzt.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const ziel = new Date(berlin); ziel.setHours(3, 0, 0, 0); if (ziel <= berlin) ziel.setDate(ziel.getDate() + 1);
  return ziel.getTime() - berlin.getTime();
}

export function handbuchRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; version: string; routen: string[]; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  // Beim Schließen des Servers enden die Zeitgeber, ein laufender Durchgang wird abgewartet – sonst arbeitet er mit einer
  // Datenbank weiter, die es nicht mehr gibt (Neustart, Tests)
  let laeuft: Promise<unknown> = Promise.resolve(), zu = false;
  const lauf = () => (laeuft = handbuecherErzeugen(e).catch((err) => app.log.warn({ err }, 'Handbuch nicht erzeugt')));
  const start = setTimeout(lauf, 5000).unref();   // beim Start: fehlt es oder hat sich das Programm geändert, gleich
  let nacht: ReturnType<typeof setTimeout> | undefined;
  const planen = () => { if (!zu) nacht = setTimeout(() => { void lauf().finally(planen); }, naechsteNacht()).unref(); };
  planen();
  app.addHook('onClose', async () => { zu = true; clearTimeout(start); clearTimeout(nacht); await laeuft; });

  app.get('/api/handbuch', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const q = req.query as { stufe?: string; format?: string };
    const stufe = (STUFEN.find((x) => x.wert === q.stufe)?.wert ?? 'anwender') as Handbuchstufe;
    if (stufe !== 'anwender' && req.benutzer!.rolle !== 'admin') throw new Ablehnung('Dieses Handbuch ist nur für Administrator:innen');
    const pdf = q.format === 'pdf', d = datei(stufe, pdf ? 'pdf' : 'html');
    if (!existsSync(d)) { await lauf(); if (!existsSync(d)) throw new Ablehnung('Das Handbuch wird gerade erzeugt – bitte gleich noch einmal'); }
    const name = `Bauportal-Handbuch-${stufe}.${pdf ? 'pdf' : 'html'}`;
    return reply.header('content-type', pdf ? 'application/pdf' : 'text/html; charset=utf-8').header('content-disposition', `${pdf ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`)
      .header('x-content-type-options', 'nosniff').header('cache-control', 'private, no-store').send(readFileSync(d));
  });
}
