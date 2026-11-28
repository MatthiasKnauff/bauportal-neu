// Bereiche der Verwaltung (wie bisher je Rolle „– · sehen · ändern“): die eine Prüfung für Seiten der Verwaltung, die nicht nur
// Objekte zeigen (Ablage prüfen, Updates, Aufbau, Zugänge). Entschieden wird wie überall in der Datenbank (bp_darf, Objekt „bereich:…“).
import type { FastifyRequest } from 'fastify';
import { alsBenutzer, type Db } from './db';
import { Ablehnung, regelAnmelden } from './protokoll';
import { ROLLEN } from '../kern/rechte';

export async function pruefeBereich(db: Db, req: FastifyRequest, bereich: string, art: 'lesen' | 'schreiben'): Promise<void> {
  const wer = req.benutzer!;
  if (wer.admin) return;
  const ok = await alsBenutzer(db, wer, async (c) => (await c.query('select bp_darf($1, $2, null) as ok', [`bereich:${bereich}`, art])).rows[0].ok === true);
  if (!ok) throw new Ablehnung(art === 'lesen' ? 'Diesen Bereich der Verwaltung darfst du nicht sehen' : 'Das darfst du in diesem Bereich der Verwaltung nicht ändern');
}

/** Nur Administrator:innen (z. B. Benutzer und Rechte ändern, Updates einspielen, Übernahme). */
export function nurAdmin(req: FastifyRequest): void {
  if (!req.benutzer!.admin) throw new Ablehnung('Das dürfen nur Administrator:innen');
}

/** Rollen ab Werk bleiben; eine Rolle verschwindet nur, solange niemand sie hat (wie bisher ✕ nur bei 0 Personen). */
export function rollenregelnAnmelden(): void {
  regelAnmelden('rolle', 'loeschen', {
    async vor(c, b) {
      if (b.art !== 'loeschen') return;
      if (ROLLEN.some((r) => r.id === b.objektId)) throw new Ablehnung('Die Rollen ab Werk bleiben – umbenennen geht');
      if ((await c.query('select 1 from o_benutzer where rolle = $1 and not geloescht limit 1', [b.objektId])).rowCount) throw new Ablehnung('Diese Rolle haben noch Benutzer:innen');
    },
  });
}
