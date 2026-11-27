// Positionsarten eines LV: die eine Stelle für die Regel, welche Zeilen nur Text sind (ohne Menge und Preis).
// Im Kern neben oz.ts, weil Druckwerk, GAEB, Rechenwege und Oberfläche sie gleichermaßen brauchen.
import type { Werte } from './modell';

/** Hinweistext oder Vorbemerkung (GAEB: Remark). */
export const istHinweis = (art: unknown) => art === 'hinweis' || art === 'vorbemerkung';
/** Zeile ohne Menge und Preis: Titel, Hinweistext, Vorbemerkung. */
export const istText = (art: unknown) => art === 'titel' || istHinweis(art);

// ---------- Zuschlagsposition (GAEB „MarkupItem“, wie bisher Art Z) ----------
// Der EP ist ein Satz in %, gerechnet auf die Gesamtpreise der gewählten Positionen. Als Menge zählt deren Summe / 100 –
// so bleibt GP = Menge × EP überall gleich: in der Schätzung, im Angebot (Preise der Bieter:in), im Auftrag und im Aufmaß
// (Menge und EP kommen jeweils aus derselben Quelle wie bei den übrigen Positionen).
type E = { id: string; werte: Werte };
export const istZuschlag = (art: unknown) => art === 'zuschlag';
/** Die Positionen, auf die der Zuschlag gerechnet wird (Kennungen, gespeichert als „a,b,c“). */
export const zuschlagAuf = (w: Werte): string[] => String(w.zuschlag_auf ?? '').split(',').map((s) => s.trim()).filter(Boolean);
/** Positionen nach Kennung – für mengeVon. */
export const nachKennung = <T extends E>(positionen: T[]): ReadonlyMap<string, T> => new Map(positionen.map((p) => [p.id, p]));
/** Menge, mit der eine Position zählt: ihre eigene – bei einer Zuschlagsposition die Summe der GP ihrer Positionen / 100. */
export function mengeVon<T extends E>(q: T, alle: ReadonlyMap<string, T>, menge: (y: T) => number, ep: (y: T) => number | null): number {
  if (!istZuschlag(q.werte.art)) return menge(q);
  let s = 0;
  for (const id of zuschlagAuf(q.werte)) {
    const y = alle.get(id); if (!y || istZuschlag(y.werte.art)) continue;
    const e = ep(y); if (e != null) s += Math.round(menge(y) * e * 100) / 100;
  }
  return s / 100;
}
