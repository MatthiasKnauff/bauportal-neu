// Verlauf eines Eintrags: wer hat wann was geändert – aus dem Befehlsprotokoll, so weit der Benutzer es sehen darf.
// Auf Wunsch mit den Einträgen, die an ihm hängen (z. B. Anwesende, Mängel und Fotos eines Tagesberichts).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { KENNUNG } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import { alsBenutzer, spalte, tabelle, type Db } from './db';
import { Ablehnung } from './protokoll';

export interface Verlaufseintrag { zeit: string; wer: string; objekt: string; art: string; objektId: string; werte: Record<string, unknown> | null; herkunft: string | null }

export function verlaufRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/verlauf', { preHandler: e.nurAngemeldet }, async (req): Promise<Verlaufseintrag[]> => {
    const b = (req.body ?? {}) as { objekt?: string; id?: string; unter?: { objekt?: string; feld?: string }[] };
    const m = e.register.modell(String(b.objekt ?? ''));
    if (!m || !KENNUNG.test(b.id ?? '')) throw new Ablehnung('Was gezeigt werden soll, fehlt');
    // Nur Verweise, die das Datenmodell wirklich hat, auf genau dieses Objekt
    const unter = (b.unter ?? []).map((u) => ({ m: e.register.modell(String(u.objekt ?? '')), feld: String(u.feld ?? '') }))
      .filter((u) => u.m?.felder.some((f) => f.name === u.feld && f.art === 'verweis' && f.ziel === m.name));
    return alsBenutzer(e.db, req.benutzer!, async (c) => {
      const ids = [b.id!];
      for (const u of unter) ids.push(...(await c.query(`select id from ${tabelle(u.m!.name)} where ${spalte(u.feld)} = $1`, [b.id])).rows.map((r) => r.id as string));
      return (await c.query('select zeit, benutzer_name, objekt, art, objekt_id, werte, herkunft from kern_befehl where objekt_id = any($1) order by seq desc limit 300', [ids])).rows
        .map((r) => ({ zeit: (r.zeit as Date).toISOString(), wer: r.benutzer_name as string, objekt: r.objekt as string, art: r.art as string, objektId: r.objekt_id as string, werte: r.werte, herkunft: r.herkunft }));
    });
  });
}
