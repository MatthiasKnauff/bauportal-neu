// Das Gebäude als Dreiecke für die 3D-Ansicht. Der IFC-Dienst rechnet es beim Einlesen eines Plans nebenher (mit ausgeschnittenen
// Öffnungen – das dauert länger als das Einlesen selbst); gespeichert wird es je Version im Speicher des Bauportals (Datenordner),
// erst wenn der Plan übernommen ist. In der Datenbank steht nichts davon – es ist abgeleitet und jederzeit neu zu rechnen.
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { KENNUNG } from '../kern/modell';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { SYSTEM, alsBenutzer, type Db } from './db';
import { Ablehnung, befehlAusfuehren } from './protokoll';

const datei = (version: string) => path.join(process.env.DATEN_PFAD ?? '/data', 'netz', `${version}.json.gz`);

/** Startet die Rechnung im IFC-Dienst; liefert das gepackte Netz oder null (ohne Fehler: die 3D-Ansicht fehlt dann nur). */
export async function netzRechnen(ifc: Buffer): Promise<Buffer | null> {
  try {
    const r = await fetch(`${process.env.IFCDIENST_URL ?? 'http://ifcdienst:8000'}/netz`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: new Uint8Array(ifc), signal: AbortSignal.timeout(15 * 60000),
    });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; }
}

/** Legt das Netz einer Version ab (ersetzt ein älteres in einem Schritt) und vermerkt das an der Version – als Befehl, damit
 *  offene 3D-Ansichten über den Abgleich davon erfahren und neu laden. */
export async function netzSpeichern(db: Db, register: Modulregister, version: string, netz: Buffer): Promise<void> {
  const ziel = datei(version);
  await mkdir(path.dirname(ziel), { recursive: true });
  await writeFile(`${ziel}.neu`, netz);
  await rename(`${ziel}.neu`, ziel);
  await befehlAusfuehren(db, register, SYSTEM, { id: randomUUID(), gesehen: 0, objekt: 'version', art: 'aendern', objektId: version, werte: { netz: new Date().toISOString() } });
}
export const netzDa = async (version: string) => !!(await stat(datei(version)).catch(() => null));

export function netzRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.get('/api/netz/:version', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const version = (req.params as { version: string }).version;
    if (!KENNUNG.test(version)) throw new Ablehnung('Die Version fehlt');
    // lesen darf, wer die Version sieht (Rechte in der Datenbank)
    const da = await alsBenutzer(e.db, req.benutzer!, async (c) => (await c.query('select 1 from o_version where id = $1 and not geloescht', [version])).rowCount);
    if (!da) throw new Ablehnung('Diese Version gibt es nicht');
    const s = await stat(datei(version)).catch(() => null);
    if (!s) return reply.code(404).send({ fehler: 'Für diese Version gibt es noch keine 3D-Ansicht' });
    return reply.header('content-type', 'application/json').header('content-encoding', 'gzip').header('cache-control', 'no-cache').header('last-modified', s.mtime.toUTCString())
      .send(createReadStream(datei(version)));
  });
}
