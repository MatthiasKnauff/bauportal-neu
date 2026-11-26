// Ordnungszahlen (OZ) sortieren – ein Baustein für LV-Ansicht, Rechnung, Druck und GAEB.
import type { Werte } from './modell';

type E = { werte: Werte };
const teile = (oz: unknown) => String(oz ?? '').split(/[.\s]+/).filter((t, i, l) => t !== '' || l.length === 1);
const teilVergleich = (p: string, q: string) => (/^\d+$/.test(p) && /^\d+$/.test(q) ? Number(p) - Number(q) : p.localeCompare(q, 'de'));

/** Ordnungszahlen natürlich sortieren: „01.2.10“ nach „01.2.9“, ein Titel vor allem, was unter ihm steht. */
export function ozVergleich(a: unknown, b: unknown): number {
  const x = teile(a), y = teile(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const d = teilVergleich(x[i]!, y[i]!);
    if (d) return d;
  }
  return 0;
}

/** LV-Reihenfolge: nach OZ; stehen in einem Titel Positionen und Untertitel nebeneinander (01.0010 und 01.01), kommen die
 *  Positionen zuerst – sonst entschiede die zufällige Stellenzahl. Bei gleicher OZ die Reihenfolge des Eintrags. */
export function lvVergleich(a: E, b: E): number {
  const x = teile(a.werte.oz), y = teile(b.werte.oz);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (x[i] === y[i]) continue;
    const blattX = i === x.length - 1 && a.werte.art !== 'titel', blattY = i === y.length - 1 && b.werte.art !== 'titel';
    if (blattX !== blattY) return blattX ? -1 : 1;
    return teilVergleich(x[i]!, y[i]!);
  }
  return Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0);
}
export const nachOz = <T extends E>(l: T[]) => [...l].sort(lvVergleich);
