// Ausschreibung: Summen und Wertung – reine Rechnung, im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };
/** Positionen, die in die Summe eingehen: Bedarfs- und Alternativpositionen nicht (sie stehen nur mit EP im LV), Titel und Hinweise ohnehin nicht. */
export const zaehlt = (p: E) => ['normal', 'pauschal', 'stundenlohn', ''].includes(String(p.werte.art ?? ''));
export const zahl = (w: unknown): number => (typeof w === 'number' ? w : Number(String(w ?? '').replace(/\./g, '').replace(',', '.')) || 0);
export const gp = (menge: unknown, ep: unknown) => Math.round(zahl(menge) * zahl(ep) * 100) / 100;

/** Ordnungszahlen natürlich sortieren: „01.2.10“ nach „01.2.9“. */
export function ozVergleich(a: unknown, b: unknown): number {
  const x = String(a ?? '').split(/[.\s]+/), y = String(b ?? '').split(/[.\s]+/);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? '', q = y[i] ?? '';
    const d = /^\d+$/.test(p) && /^\d+$/.test(q) ? Number(p) - Number(q) : p.localeCompare(q, 'de');
    if (d) return d;
  }
  return 0;
}
export const nachOz = <T extends E>(l: T[]) => [...l].sort((a, b) => ozVergleich(a.werte.oz, b.werte.oz) || Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0));

/** Summe eines LV mit den geschätzten Preisen. */
export const summeGeschaetzt = (positionen: E[]) => Math.round(positionen.filter(zaehlt).reduce((s, p) => s + gp(p.werte.menge, p.werte.ep), 0) * 100) / 100;

export interface Wertung { angebot: string; netto: number; nachLass: number; fehlend: number; rang: number | null }
/**
 * Preisspiegel: je Angebot die Summe (Menge × EP der Bieter:in), nach Nachlass, wie viele Preise fehlen – und der Rang
 * (nur gewertete Angebote, die günstigste Summe nach Nachlass zuerst).
 */
export function wertung(positionen: E[], angebote: E[], preis: (angebot: string, position: string) => number | null): Wertung[] {
  const zaehlende = positionen.filter(zaehlt);
  const w = angebote.map((a) => {
    let netto = 0, fehlend = 0;
    for (const p of zaehlende) { const ep = preis(a.id, p.id); if (ep == null) fehlend++; else netto += gp(p.werte.menge, ep); }
    netto = Math.round(netto * 100) / 100;
    return { angebot: a.id, netto, nachLass: Math.round(netto * (1 - zahl(a.werte.nachlass) / 100) * 100) / 100, fehlend, rang: null as number | null, aus: a.werte.ausgeschlossen === true };
  });
  [...w].filter((x) => !x.aus && x.netto > 0).sort((a, b) => a.nachLass - b.nachLass).forEach((x, i) => { x.rang = i + 1; });
  return w.map(({ aus: _aus, ...x }) => x);
}

/** Je Position der günstigste Preis unter den gewerteten Angeboten (für die Markierung im Preisspiegel). */
export function guenstigster(positionen: E[], angebote: E[], preis: (angebot: string, position: string) => number | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of positionen) for (const a of angebote.filter((x) => x.werte.ausgeschlossen !== true)) {
    const ep = preis(a.id, p.id);
    if (ep != null && ep > 0 && (!m.has(p.id) || ep < m.get(p.id)!)) m.set(p.id, ep);
  }
  return m;
}
