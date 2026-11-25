// Fachregeln des Gebäudemodells auf dem Server: Kostengruppe nach DIN 276 aus Art, Lage und Tragfähigkeit, und
// Aufbauten aus den Schichten eines Plans – gleiche Schichtfolge = ein gemeinsamer Aufbau.
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { kostengruppeNummer } from '../module/gebaeudemodell/beipackzettel';
import type { Werte } from '../kern/modell';
import { regelAnmelden } from './protokoll';
import type { Eintrag } from './uebernahme';

/** Kostengruppen aus dem Katalog: Nummer -> Kennung. Leer, solange der Katalog nicht eingespielt ist. */
export async function kostengruppen(c: Pick<PoolClient, 'query'>): Promise<Map<string, string>> {
  return new Map((await c.query('select nummer, id from o_kostengruppe where not geloescht order by id')).rows.map((r) => [r.nummer as string, r.id as string]));
}
export const KEIN_KG_KATALOG = 'Der Katalog „Kostengruppen nach DIN 276“ ist noch nicht eingespielt – die Bauteile bleiben vorerst ohne Kostengruppe (Verwaltung → Updates).';

/**
 * Die Kostengruppe folgt Art, Lage und Tragfähigkeit – solange niemand sie von Hand anders gesetzt hat.
 * Steht schon eine andere da als die, die zu den bisherigen Angaben gehört, bleibt sie.
 */
export function gebaeudemodellRegelnAnmelden(): void {
  regelAnmelden('bauteil', 'kostengruppe', {
    async vor(c, b, vorher, werte) {
      if (!werte || (b.art !== 'anlegen' && b.art !== 'aendern') || 'kostengruppe' in ((b.werte ?? {}) as object)) return;   // vom Absender gesetzt
      if (b.art === 'aendern' && !['art', 'lage', 'tragend'].some((k) => k in werte)) return;
      const kg = await kostengruppen(c);
      if (!kg.size) return;
      const alt = { art: vorher?.art, lage: vorher?.lage, tragend: vorher?.tragend };
      const neu = { ...alt, ...Object.fromEntries(['art', 'lage', 'tragend'].filter((k) => k in werte).map((k) => [k, werte[k]])) };
      const jetzt = (vorher?.kostengruppe as string | null | undefined) ?? null;
      if (jetzt && jetzt !== kg.get(kostengruppeNummer(alt.art, alt.lage, alt.tragend) ?? '')) return;   // von Hand gesetzt
      const nummer = kostengruppeNummer(neu.art, neu.lage, neu.tragend);
      const id = (nummer && kg.get(nummer)) || null;
      if (id !== jetzt) werte.kostengruppe = id;
    },
  });
}

export interface Schicht { material: string; dicke: number | null }
const zahl = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** Name eines Aufbaus aus seinen Schichten, z. B. „Außenputz 2 · Mauerwerk 36,5 · Innenputz 1,5 (40 cm)“. */
export function aufbauName(schichten: Schicht[], artTitel: string): string {
  const gesamt = schichten.reduce((s, x) => s + (x.dicke ?? 0), 0);
  const benannt = schichten.filter((s) => s.material);
  if (!benannt.length) return `${artTitel} ${zahl(gesamt)} cm${schichten.length > 1 ? ` (${schichten.length} Schichten)` : ''}`;
  const teile = schichten.map((s) => [s.material || 'unbenannt', s.dicke ? zahl(s.dicke) : ''].filter(Boolean).join(' ')).join(' · ');
  return gesamt && schichten.length > 1 ? `${teile} (${zahl(gesamt)} cm)` : gesamt ? `${teile} cm` : teile;
}

/**
 * Aus den Schichten der Bauteile eines Plans die Aufbauten: Bauteile derselben Art mit derselben Schichtfolge teilen
 * sich einen Aufbau. Die Kennung hängt nur an Art und Schichten – so findet ein neuer Planstand denselben Aufbau wieder.
 */
export function aufbautenAusPlan(bauteile: { kennung: string; art: string; schichten?: Schicht[] }[], artTitel: (art: string) => string) {
  const aufbauten = new Map<string, { kennung: string; art: string; schichten: Schicht[] }>();
  const von = new Map<string, string>();   // Bauteil -> Aufbau
  for (const b of bauteile) {
    const s = (b.schichten ?? []).filter((x) => x.material || x.dicke);
    if (!s.some((x) => x.dicke)) continue;   // ohne Dicken ist es kein Schichtaufbau, nur ein Material
    const kennung = 'ifc-aufbau:' + createHash('sha1').update(JSON.stringify([b.art, s.map((x) => [x.material.toLowerCase(), x.dicke])])).digest('hex').slice(0, 16);
    if (!aufbauten.has(kennung)) aufbauten.set(kennung, { kennung, art: b.art, schichten: s });
    von.set(b.kennung, kennung);
  }
  const eintraege: Eintrag[] = [...aufbauten.values()].map((a) => ({ kennung: a.kennung, werte: { name: aufbauName(a.schichten, artTitel(a.art)), art: a.art } }));
  const schichten = (ort: () => Map<string, string>): Eintrag[] => [...aufbauten.values()].flatMap((a) => a.schichten.map((s, i): Eintrag => ({
    kennung: `${a.kennung}:${i + 1}`, werte: () => ({ aufbau: ort().get(a.kennung)!, material: s.material, dicke: s.dicke, reihe: i + 1 } as Werte) })));
  return { eintraege, schichten, von };
}
