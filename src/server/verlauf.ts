// Verlauf eines Eintrags: wer hat wann was geändert – aus dem Befehlsprotokoll, so weit der Benutzer es sehen darf.
// Auf Wunsch mit den Einträgen, die an ihm hängen (z. B. Anwesende, Mängel und Fotos eines Tagesberichts).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { KENNUNG } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import { alsBenutzer, spalte, tabelle, type Db } from './db';
import { Ablehnung } from './protokoll';

export interface Verlaufseintrag { seq: number; zeit: string; wer: string; objekt: string; art: string; objektId: string; werte: Record<string, unknown> | null; herkunft: string | null }

/** Ein Vorgang, der Einträge auf einen früheren Stand bringt – die Oberfläche führt ihn aus (ein Rückgängig). */
export interface Rueckschritt { objekt: string; art: 'aendern' | 'loeschen' | 'wiederherstellen'; objektId: string; werte?: Record<string, unknown> }

/**
 * Stand nach dem Befehl „bis“: aus dem Protokoll nachgespielt (jede Änderung ist ein Befehl). Verglichen mit dem Stand jetzt ergibt das
 * die Befehle zurück: Später Angelegtes fällt weg, Gelöschtes kommt wieder, geänderte Felder bekommen ihren Wert von damals.
 * „ohne“: Objektarten, die bleiben, wie sie sind (z. B. Fotos – die Originale liegen im Projektordner).
 */
export function rueckschritte(befehle: { seq: number; objekt: string; art: string; objekt_id: string; werte: Record<string, unknown> | null }[], bis: number,
  felder: (objekt: string) => string[] | undefined, ohne: Set<string>): Rueckschritt[] {
  type Stand = Map<string, { objekt: string; lebt: boolean; werte: Record<string, unknown> }>;
  const spielen = (grenze: number): Stand => {
    const st: Stand = new Map();
    for (const b of befehle) {
      if (b.seq > grenze) break;
      const x = st.get(b.objekt_id) ?? { objekt: b.objekt, lebt: false, werte: {} };
      if (b.art === 'anlegen') { x.lebt = true; x.werte = { ...(b.werte ?? {}) }; }
      else if (b.art === 'aendern') Object.assign(x.werte, b.werte ?? {});
      else if (b.art === 'loeschen') x.lebt = false;
      else if (b.art === 'wiederherstellen') x.lebt = true;
      st.set(b.objekt_id, x);
    }
    return st;
  };
  const damals = spielen(bis), jetzt = spielen(Infinity);
  const aus: Rueckschritt[] = [];
  for (const [id, j] of jetzt) {
    if (ohne.has(j.objekt)) continue;
    const d = damals.get(id);
    if (!d?.lebt) { if (j.lebt) aus.push({ objekt: j.objekt, art: 'loeschen', objektId: id }); continue; }
    const namen = felder(j.objekt) ?? [];
    const anders = Object.fromEntries(namen.filter((n) => JSON.stringify(d.werte[n] ?? null) !== JSON.stringify(j.werte[n] ?? null)).map((n) => [n, d.werte[n] ?? null]));
    if (!j.lebt) aus.push({ objekt: j.objekt, art: 'wiederherstellen', objektId: id });
    if (Object.keys(anders).length) aus.push({ objekt: j.objekt, art: 'aendern', objektId: id, werte: anders });
  }
  return aus;
}

export function verlaufRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  // Einträge, um die es geht: das Objekt und, was an ihm hängt (nur Verweise, die das Datenmodell wirklich hat)
  const auswahl = (b: { objekt?: string; id?: string; unter?: { objekt?: string; feld?: string }[] }) => {
    const m = e.register.modell(String(b.objekt ?? ''));
    if (!m || !KENNUNG.test(b.id ?? '')) throw new Ablehnung('Was gezeigt werden soll, fehlt');
    const unter = (b.unter ?? []).map((u) => ({ m: e.register.modell(String(u.objekt ?? '')), feld: String(u.feld ?? '') }))
      .filter((u) => u.m?.felder.some((f) => f.name === u.feld && f.art === 'verweis' && f.ziel === m.name));
    return { m, unter };
  };

  // Auf einen früheren Stand: die Befehle dafür (ausgeführt wird in der Oberfläche – wie jede Änderung, mit Rückgängig)
  app.post('/api/verlauf/stand', { preHandler: e.nurAngemeldet }, async (req): Promise<Rueckschritt[]> => {
    const b = (req.body ?? {}) as { objekt?: string; id?: string; unter?: { objekt?: string; feld?: string }[]; bis?: number; ohne?: string[] };
    const { unter } = auswahl(b);
    if (!Number.isInteger(b.bis)) throw new Ablehnung('Der Stand fehlt');
    return alsBenutzer(e.db, req.benutzer!, async (c) => {
      const ids = [b.id!];
      for (const u of unter) ids.push(...(await c.query(`select id from ${tabelle(u.m!.name)} where ${spalte(u.feld)} = $1`, [b.id])).rows.map((r) => r.id as string));
      const befehle = (await c.query('select seq, objekt, art, objekt_id, werte from kern_befehl where objekt_id = any($1) order by seq', [ids])).rows
        .map((r) => ({ seq: Number(r.seq), objekt: r.objekt as string, art: r.art as string, objekt_id: r.objekt_id as string, werte: r.werte as Record<string, unknown> | null }));
      return rueckschritte(befehle, b.bis!, (o) => e.register.modell(o)?.felder.map((f) => f.name), new Set(b.ohne ?? []));
    });
  });

  app.post('/api/verlauf', { preHandler: e.nurAngemeldet }, async (req): Promise<Verlaufseintrag[]> => {
    const b = (req.body ?? {}) as { objekt?: string; id?: string; unter?: { objekt?: string; feld?: string }[] };
    const { unter } = auswahl(b);
    return alsBenutzer(e.db, req.benutzer!, async (c) => {
      const ids = [b.id!];
      for (const u of unter) ids.push(...(await c.query(`select id from ${tabelle(u.m!.name)} where ${spalte(u.feld)} = $1`, [b.id])).rows.map((r) => r.id as string));
      return (await c.query('select seq, zeit, benutzer_name, objekt, art, objekt_id, werte, herkunft from kern_befehl where objekt_id = any($1) order by seq desc limit 300', [ids])).rows
        .map((r) => ({ seq: Number(r.seq), zeit: (r.zeit as Date).toISOString(), wer: r.benutzer_name as string, objekt: r.objekt as string, art: r.art as string, objektId: r.objekt_id as string, werte: r.werte, herkunft: r.herkunft }));
    });
  });
}
