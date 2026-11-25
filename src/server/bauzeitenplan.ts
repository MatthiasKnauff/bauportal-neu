// Bauzeitenplan auf dem Server: der Ausdruck als PDF (dieselben Seiten wie die Vorschau, über den Druckdienst) und das
// Ablegen im Projektordner. Gelesen wird als der Benutzer – wer den Plan nicht sehen darf, bekommt auch keinen Ausdruck.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import { KENNUNG, type Werte } from '../kern/modell';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { STANDARD, planDruck, type Druckoptionen, type Plandaten } from '../module/bauzeitenplan/druck';
import { planAus, type Plan } from '../module/bauzeitenplan/plan';
import { alsBenutzer, tabelle, type Db } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';
import { pdfAus, werteAus } from './druck';
import { Dienstfehler, ablageHindernis, ablegen } from './ablage';
import { ortSuchen } from './wetter';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Befehl } from '../kern/befehl';
import { altplanLesen, type Altplan } from '../module/bauzeitenplan/austausch';
import { abgleicher, merken, type Vorschau, type Zahl } from './uebernahme';

export async function planLaden(db: Db, register: Modulregister, wer: Benutzer, version: string): Promise<{ plan: Plan; projekt: string; projektName: string; versionName: string; buero: string; ordner: string | null }> {
  if (!KENNUNG.test(version)) throw new Ablehnung('Version fehlt');
  const d = await alsBenutzer(db, wer, async (c) => {
    const v = (await c.query("select id, projekt, name from o_version where id = $1 and bereich = 'bauzeitenplan' and not geloescht", [version])).rows[0];
    if (!v) throw new Ablehnung('Diese Version des Bauzeitenplans gibt es nicht');
    const lies = async (o: string) => (await c.query(`select * from ${tabelle(o)} where version = $1 and not geloescht`, [version])).rows.map((z) => ({ id: z.id as string, werte: werteAus(register.modell(o)!, z) }));
    const p = (await c.query('select name, nummer, strasse, plz, ort, ordner from o_projekt where id = $1', [v.projekt])).rows[0] ?? {};
    const buero = (await c.query('select name from o_buero where id = $1', [BUERO_ID])).rows[0]?.name as string | undefined;
    return { v, p, buero: buero ?? '', vorgaenge: await lies('vorgang'), links: await lies('verknuepfung'), zeitplan: (await lies('zeitplan'))[0]?.werte as Werte | undefined, frei: await lies('freier_tag') };
  });
  let land = '';
  if (!d.zeitplan?.bundesland && (d.p.ort || d.p.plz)) { try { land = (await ortSuchen([d.p.strasse, [d.p.plz, d.p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))).land; } catch { /* ohne Land: bundesweite Feiertage */ } }
  const plan = planAus({ vorgaenge: d.vorgaenge, links: d.links, zeitplan: d.zeitplan, frei: d.frei, land, heute: new Date().toLocaleDateString('sv') });
  return { plan, projekt: d.v.projekt, projektName: [d.p.nummer, d.p.name].filter(Boolean).join(' · '), versionName: d.v.name, buero: d.buero, ordner: d.p.ordner || null };
}

export const plandaten = (l: Awaited<ReturnType<typeof planLaden>>): Plandaten => ({
  titel: `Bauzeitenplan ${l.projektName}`, unter: `Version „${l.versionName}“`, buero: l.buero, zeilen: l.plan.zeilen, links: l.plan.links,
  kal: l.plan.kal, ende: l.plan.erg.endeDatum, heute: new Date().toLocaleDateString('sv'),
});

const optionen = (o: unknown): Druckoptionen => ({ ...STANDARD, ...((o && typeof o === 'object' ? o : {}) as Partial<Druckoptionen>) });
const dateiname = (l: Awaited<ReturnType<typeof planLaden>>) => `Bauzeitenplan ${l.projektName} ${l.versionName} ${new Date().toLocaleDateString('sv')}.pdf`.replace(/[\\/:*?"<>|]+/g, '-');

export function bauzeitenplanRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/bauzeitenplan/pdf', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { version?: string; optionen?: unknown };
    const l = await planLaden(e.db, e.register, req.benutzer!, String(b.version ?? ''));
    const pdf = await pdfAus(planDruck(plandaten(l), optionen(b.optionen)).html);
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(dateiname(l))}`).send(pdf);
  });
  app.post('/api/bauzeitenplan/ablegen', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { version?: string; optionen?: unknown };
    const l = await planLaden(e.db, e.register, req.benutzer!, String(b.version ?? ''));
    const hindernis = await ablageHindernis(e.db, e.umgebung, l.ordner);
    if (hindernis) throw new Ablehnung(hindernis);
    try {
      const wo = await ablegen(e.db, { umgebung: e.umgebung, projekt: l.projekt, projektordner: l.ordner, unterordner: 'Bauzeitenplan', name: dateiname(l), daten: await pdfAus(planDruck(plandaten(l), optionen(b.optionen)).html) });
      return { pfad: wo.pfad };
    } catch (err) { if (err instanceof Dienstfehler) return reply.code(err.status).send({ fehler: err.message }); throw err; }
  });
}

/**
 * Einen Plan (aus der Gantt-App oder einer Sicherung) in eine Version übernehmen – über die gemeinsame Übernahme:
 * Vorschau, wiederholbar, von Hand Geändertes bleibt. vor: Anfang der Kennungen dieser Quelle.
 */
export async function planUebernehmen(c: PoolClient, register: Modulregister, ziel: { projekt: string; version: string }, alt: Altplan, vor: string): Promise<{ je: Record<string, Zahl>; hinweise: string[]; liste: Befehl[] }> {
  const { liste, je, ort, abgleichen } = abgleicher(c, register, ziel, 'uebernahme', ['uebernahme']);
  const meins = (k: string) => k.startsWith(vor);
  // Kalender: je Version einer – vorhandenen weiterführen
  const zp = (await c.query('select * from o_zeitplan where version = $1 and not geloescht order by id limit 1', [ziel.version])).rows[0];
  const kopf = () => ({ id: randomUUID(), gesehen: 0, herkunft: 'uebernahme' });
  const zw: Werte = { anfang: alt.zeitplan.anfang, arbeitswoche: alt.zeitplan.arbeitswoche, bundesland: alt.zeitplan.bundesland };
  if (!zp) { liste.push({ ...kopf(), objekt: 'zeitplan', art: 'anlegen', objektId: randomUUID(), werte: { ...ziel, ...zw, notiz: '' } }); je.zeitplan = { neu: 1, geaendert: 0, entfernt: 0, unveraendert: 0, behalten: 0 }; }
  else {
    const anders = Object.fromEntries(Object.entries(zw).filter(([k, w]) => String(zp[k] ?? '') !== String(w ?? '')));
    if (Object.keys(anders).length) liste.push({ ...kopf(), objekt: 'zeitplan', art: 'aendern', objektId: zp.id, werte: anders });
    je.zeitplan = { neu: 0, geaendert: Object.keys(anders).length ? 1 : 0, entfernt: 0, unveraendert: Object.keys(anders).length ? 0 : 1, behalten: 0 };
  }
  const fremd = (await c.query('select count(*)::int as n from o_vorgang where version = $1 and not geloescht and not kennung like $2', [ziel.version, `${vor}%`])).rows[0].n as number;
  await abgleichen('freier_tag', alt.frei, meins);
  await abgleichen('vorgang', alt.vorgaenge, meins);
  await abgleichen('verknuepfung', alt.links.map((l) => ({ kennung: l.kennung, werte: () => ({ ...l.werte, von: ort.vorgang!.get(l.von)!, nach: ort.vorgang!.get(l.nach)! }) })), meins);
  return { je, liste, hinweise: [
    ...(fremd ? [`In dieser Version stehen schon ${fremd} Leistungen, die nicht aus dieser Quelle stammen – sie bleiben, die übernommenen kommen dazu. Für einen sauberen Stand vorher eine leere Version anlegen.`] : []),
    ...alt.hinweise,
    'Alles Übernommene trägt die Marke „übernommen“. Die Übernahme lässt sich wiederholen: Von Hand Geändertes bleibt, nichts wird doppelt angelegt.',
  ] };
}

export function planEinlesenRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  // Plan aus einer Datei (Gantt-App oder Sicherung) in die gewählte Version – Vorschau, übernommen wird über /api/uebernehmen
  app.post('/api/bauzeitenplan/einlesen', { preHandler: e.nurAngemeldet, bodyLimit: 30 * 1024 * 1024 }, async (req): Promise<Vorschau> => {
    const b = (req.body ?? {}) as { version?: string; inhalt?: string };
    if (!KENNUNG.test(b.version ?? '')) throw new Ablehnung('Version fehlt');
    let alt: Altplan;
    try { alt = altplanLesen(JSON.parse(String(b.inhalt ?? '')), 'datei:'); } catch (x) { throw new Ablehnung(x instanceof SyntaxError ? 'Die Datei ist nicht lesbar (erwartet wird ein Bauzeitenplan als .gantt- oder .json-Datei)' : (x as Error).message); }
    const plan = await alsBenutzer(e.db, req.benutzer!, async (c) => {
      const v = (await c.query("select projekt from o_version where id = $1 and bereich = 'bauzeitenplan' and not geloescht", [b.version])).rows[0];
      if (!v) throw new Ablehnung('Diese Version des Bauzeitenplans gibt es nicht');
      if (!(await c.query("select bp_darf('vorgang', 'schreiben', $1) as d", [v.projekt])).rows[0].d) throw new Ablehnung('Dazu fehlt dir das Recht');
      return planUebernehmen(c, e.register, { projekt: v.projekt, version: b.version! }, alt, 'datei:');
    });
    return merken(req.benutzer!.id, plan);
  });
}
