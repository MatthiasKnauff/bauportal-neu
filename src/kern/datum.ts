// Datum lesen und zeigen wie man es hier schreibt: „27.11.2026“, „27.11.26“, „27.11.“ (dieses Jahr), dazu ISO; „+7“, „+2w“, „+1m“,
// „heute“, „morgen“ rechnen ab heute. Gespeichert wird immer JJJJ-MM-TT (sortiert richtig, ohne Zeitzone).
import type { DatumVorschlag } from './modell';
export type { DatumVorschlag };
const zwei = (n: number) => String(n).padStart(2, '0');
export const isoVon = (d: Date) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
const gueltig = (j: number, m: number, t: number) => { const d = new Date(j, m - 1, t); return d.getFullYear() === j && d.getMonth() === m - 1 && d.getDate() === t ? isoVon(d) : null; };

/** Abstand zu einem Datum (ISO) – Tage, Wochen, Monate (Monatsende bleibt im Monat: 31.01. + 1 Monat = 28./29.02.). */
export function datumPlus(iso: string, o: { tage?: number; wochen?: number; monate?: number }): string {
  const [j, m, t] = iso.split('-').map(Number) as [number, number, number];
  if (o.monate) { const ziel = new Date(j, m - 1 + o.monate, 1), letzter = new Date(ziel.getFullYear(), ziel.getMonth() + 1, 0).getDate(); return isoVon(new Date(ziel.getFullYear(), ziel.getMonth(), Math.min(t, letzter))); }
  return isoVon(new Date(j, m - 1, t + (o.tage ?? 0) + 7 * (o.wochen ?? 0)));
}

/** Text → JJJJ-MM-TT; '' bleibt leer; null: kein Datum. */
export function datumAusText(roh: string, heute: Date = new Date()): string | null {
  const t = roh.trim().toLowerCase();
  if (!t) return '';
  const h = isoVon(heute);
  if (t === 'heute') return h;
  if (t === 'morgen') return datumPlus(h, { tage: 1 });
  let r = /^\+\s*(\d{1,3})\s*([twm]?)$/.exec(t);
  if (r) { const n = Number(r[1]); return datumPlus(h, r[2] === 'w' ? { wochen: n } : r[2] === 'm' ? { monate: n } : { tage: n }); }
  r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (r) return gueltig(Number(r[1]), Number(r[2]), Number(r[3]));
  r = /^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/.exec(t);
  if (r) { const j = !r[3] ? heute.getFullYear() : r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3]); return gueltig(j, Number(r[2]), Number(r[1])); }
  return null;
}

/** JJJJ-MM-TT → TT.MM.JJJJ (sonst unverändert). */
export const datumText = (iso: unknown): string => { const s = String(iso ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s; };

/** Vorschläge zum Antippen (Stellschraube am Feld); ab Werk +1 Woche · +2 Wochen · +1 Monat ab heute. */
export const DATUM_VORSCHLAEGE: DatumVorschlag[] = [{ titel: '+1 Woche', wochen: 1 }, { titel: '+2 Wochen', wochen: 2 }, { titel: '+1 Monat', monate: 1 }];
