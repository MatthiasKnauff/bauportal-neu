// Bautagebuch per Sprache: frei erzählen (Mikrofon der Handytastatur), die KI im Büro verteilt den Text auf den
// Tagesbericht – Wetter, Anwesende, Notizen, Mängel, Aufgaben, Weisungen. Vorschau und Übernahme wie überall; Firmen
// werden den Kontakten zugeordnet, wenn der Name passt. Ohne KI kommt der Text als Notiz. Es wird kein Ton gespeichert.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Befehl } from '../kern/befehl';
import { KENNUNG, type Werte } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import { kiText } from './ki';
import { EINTRAGSARTEN } from '../module/bautagebuch/beipackzettel';
import { merken, type Vorschau, type Zahl } from './uebernahme';

interface Geordnet {
  wetter?: string; temperatur?: number | null;
  anwesend?: { firma?: string; personen?: number | null; taetigkeit?: string }[];
  notizen?: string[]; maengel?: { text?: string; firma?: string; frist?: string }[];
  aufgaben?: { text?: string; frist?: string }[]; weisungen?: { text?: string; firma?: string }[];
}
const WETTER = new Set(['sonnig', 'bewoelkt', 'regen', 'schnee', 'frost', 'sturm']);
const text = (w: unknown) => (w == null ? '' : String(w)).trim();
const datum = (w: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(text(w)) ? text(w) : null);

/** Antwort der KI → Gliederung; nur JSON wird gelesen, alles andere zählt als nicht gelesen. */
export function diktatLesen(antwort: string): Geordnet | null {
  const a = antwort.indexOf('{'), e = antwort.lastIndexOf('}');
  if (a < 0 || e <= a) return null;
  try { const g = JSON.parse(antwort.slice(a, e + 1)) as Geordnet; return g && typeof g === 'object' ? g : null; } catch { return null; }
}

/** Gliederung → Befehle für den Bericht (Einträge anhängen, Wetter setzen, wenn es noch leer ist). */
export function diktatBefehle(g: Geordnet, bericht: { id: string; projekt: string; wetter: string; temperatur: number | null }, kontakte: { id: string; name: string }[], reiheAb: number): { liste: Befehl[]; je: Record<string, Zahl> } {
  const firma = (n: unknown) => {
    const t = text(n).toLowerCase();
    if (t.length < 3) return null;
    return kontakte.find((k) => k.name.toLowerCase() === t)?.id ?? kontakte.find((k) => k.name.toLowerCase().includes(t) || t.includes(k.name.toLowerCase()))?.id ?? null;
  };
  const liste: Befehl[] = [], je: Record<string, Zahl> = {};
  let reihe = reiheAb;
  const eintrag = (art: string, werte: Werte) => {
    liste.push({ id: randomUUID(), gesehen: 0, herkunft: 'ki', objekt: 'bericht_eintrag', art: 'anlegen', objektId: randomUUID(),
      werte: { projekt: bericht.projekt, bericht: bericht.id, art, text: '', firma: null, personen: null, frist: null, erledigt: false, kennung: '', reihe: ++reihe, ...werte } });
    (je[EINTRAGSARTEN.find((e) => e.wert === art)!.mehrzahl] ??= { neu: 0, geaendert: 0, entfernt: 0, unveraendert: 0, behalten: 0 }).neu++;
  };
  for (const x of g.anwesend ?? []) { const f = firma(x.firma); if (f || text(x.firma) || text(x.taetigkeit)) eintrag('anwesend', { firma: f, personen: Number(x.personen) > 0 ? Math.round(Number(x.personen)) : null, text: [f ? '' : text(x.firma), text(x.taetigkeit)].filter(Boolean).join(' – ') }); }
  for (const x of g.notizen ?? []) if (text(x)) eintrag('notiz', { text: text(x) });
  for (const x of g.maengel ?? []) if (text(x.text)) { const f = firma(x.firma); eintrag('mangel', { text: text(x.text) + (!f && text(x.firma) ? ` (${text(x.firma)})` : ''), firma: f, frist: datum(x.frist) }); }
  for (const x of g.aufgaben ?? []) if (text(x.text)) eintrag('aufgabe', { text: text(x.text), frist: datum(x.frist) });
  for (const x of g.weisungen ?? []) if (text(x.text)) { const f = firma(x.firma); eintrag('weisung', { text: text(x.text) + (!f && text(x.firma) ? ` (${text(x.firma)})` : ''), firma: f }); }
  const w: Werte = {};
  if (!bericht.wetter && WETTER.has(text(g.wetter))) w.wetter = text(g.wetter);
  if (bericht.temperatur == null && typeof g.temperatur === 'number' && Number.isFinite(g.temperatur)) w.temperatur = Math.round(g.temperatur * 10) / 10;
  if (Object.keys(w).length) { liste.push({ id: randomUUID(), gesehen: 0, herkunft: 'ki', objekt: 'tagesbericht', art: 'aendern', objektId: bericht.id, werte: w }); je.tagesbericht = { neu: 0, geaendert: 1, entfernt: 0, unveraendert: 0, behalten: 0 }; }
  return { liste, je };
}

export function diktatRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/bautagebuch/diktat', { preHandler: e.nurAngemeldet }, async (req): Promise<Vorschau> => {
    const b = (req.body ?? {}) as { bericht?: string; text?: string; anbindung?: string };
    if (!KENNUNG.test(b.bericht ?? '')) throw new Ablehnung('Bericht fehlt');
    const t = text(b.text);
    if (!t) throw new Ablehnung('Es wurde nichts diktiert');
    const d = await alsBenutzer(e.db, req.benutzer!, async (c) => {
      const r = (await c.query('select id, projekt, wetter, temperatur from o_tagesbericht where id = $1 and not geloescht', [b.bericht])).rows[0];
      if (!r) throw new Ablehnung('Den Bericht gibt es nicht (mehr)');
      if (!(await c.query("select bp_darf('bericht_eintrag', 'schreiben', $1) as d", [r.projekt])).rows[0].d) throw new Ablehnung('Dazu fehlt dir das Recht');
      const kontakte = (await c.query('select id, name from o_kontakt where not geloescht')).rows as { id: string; name: string }[];
      const reihe = Number((await c.query('select coalesce(max(reihe), 0) as n from o_bericht_eintrag where bericht = $1', [b.bericht])).rows[0].n);
      return { bericht: { id: r.id as string, projekt: r.projekt as string, wetter: String(r.wetter ?? ''), temperatur: r.temperatur == null ? null : Number(r.temperatur) }, kontakte, reihe };
    });
    const hinweise: string[] = [];
    let g: Geordnet | null = null;
    if (b.anbindung) {
      const k = await kiText(e.db, req.benutzer!, b.anbindung, 'diktat', t);
      g = diktatLesen(k.vorschlag);
      if (!g) hinweise.push('Die KI hat den Text nicht gegliedert – er kommt ganz als Notiz in den Bericht.');
      else hinweise.push(`Von der KI geordnet${k.extern ? ' (außerhalb des Büros, ohne Namen und Anschriften übertragen)' : ' (im Büro)'} – bitte prüfen, bevor du übernimmst. Alles bleibt danach im Bericht änderbar.`);
    } else hinweise.push('Ohne KI kommt der Text ganz als Notiz in den Bericht.');
    if (!g) g = { notizen: [t] };
    const r = diktatBefehle(g, d.bericht, d.kontakte, d.reihe);
    hinweise.push('Es wird kein Ton gespeichert, nur der Text.');
    return merken(req.benutzer!.id, { ...r, hinweise });
  });
}
