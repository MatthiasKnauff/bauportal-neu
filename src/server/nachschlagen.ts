// Nachschlagen in großen Katalogen (Positionsdatenbank …): Suche und Blättern direkt am Server, seitenweise –
// die Einträge kommen nie als Ganzes in den lokalen Stand der Geräte. Nur lesen; eingespielt wird über die Updates.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import type { Werte } from '../kern/modell';
import type { Db } from './db';
import { Ablehnung } from './protokoll';

const SEITE = 200;

/** Suchbegriff → Bedingung: Nummern (nur Ziffern und Punkte) als Anfang der Nummer, sonst Volltext mit Wortanfängen. */
export function suchbedingung(text: string): { art: 'code' | 'text'; wert: string } | null {
  const t = text.trim();
  if (!t) return null;
  if (/^[\d.]+$/.test(t)) return { art: 'code', wert: t };
  const woerter = t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0).slice(0, 8);
  return woerter.length ? { art: 'text', wert: woerter.map((w) => `${w}:*`).join(' & ') } : null;
}

export function nachschlagRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  const nachschlag = (name: string) => { const n = e.register.nachschlag(name); if (!n) throw new Ablehnung('Diesen Katalog gibt es nicht'); return n; };

  app.get('/api/nachschlagen/:name', { preHandler: e.nurAngemeldet }, async (req) => {
    const n = nachschlag((req.params as { name: string }).name);
    const q = req.query as { suche?: string; pfad?: string; von?: string; anzahl?: string };
    let pfad: string[] = [];
    try { pfad = q.pfad ? (JSON.parse(q.pfad) as unknown[]).map(String).slice(0, n.gliederung.length) : []; } catch { throw new Ablehnung('Die Gliederung ist nicht lesbar'); }
    const von = Math.max(0, Number(q.von) || 0), anzahl = Math.min(SEITE, Math.max(1, Number(q.anzahl) || SEITE));
    const such = suchbedingung(String(q.suche ?? ''));
    const werte: unknown[] = [n.name];
    let wo = 'name = $1';
    if (pfad.length) { werte.push(pfad); wo += ` and pfad[1:${pfad.length}] = $${werte.length}::text[]`; }
    if (such?.art === 'code') { werte.push(`${such.wert}%`); wo += ` and werte->>'code' like $${werte.length}`; }
    if (such?.art === 'text') { werte.push(such.wert); wo += ` and such @@ to_tsquery('german', $${werte.length})`; }
    const [zeilen, gesamt] = await Promise.all([
      e.db.query(`select schluessel, werte from kern_nachschlag where ${wo} order by reihe limit ${anzahl} offset ${von}`, werte),
      e.db.query(`select count(*)::int as n from kern_nachschlag where ${wo}`, werte),
    ]);
    return { gesamt: gesamt.rows[0].n as number, zeilen: zeilen.rows.map((r: { schluessel: string; werte: Werte }) => ({ id: r.schluessel, werte: r.werte })) };
  });

  // Gliederung mit Anzahl je Ast – für den Baum links
  app.get('/api/nachschlagen/:name/gliederung', { preHandler: e.nurAngemeldet }, async (req) => {
    const n = nachschlag((req.params as { name: string }).name);
    const r = await e.db.query(`select pfad, count(*)::int as n, min(reihe) as r from kern_nachschlag where name = $1 group by pfad order by r`, [n.name]);
    return { aeste: r.rows.map((x: { pfad: string[]; n: number }) => ({ pfad: x.pfad, anzahl: x.n })) };
  });
}
