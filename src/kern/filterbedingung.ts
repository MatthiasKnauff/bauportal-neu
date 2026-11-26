// Filterbedingung wie im bisherigen Bauportal: je Art (Gewerk, Ort, Projekt …) beliebig viele Werte, innerhalb einer Art
// mit ODER oder UND verknüpft, die Arten untereinander mit UND oder ODER (von links nach rechts gelesen); ein Wert kann
// NICHT sein (ausschließen). Reine Logik ohne Oberfläche – die Filterkästen und das Suchfeld bauen darauf.

export type Verknuepfung = 'und' | 'oder';
export interface FilterWert { w: string; nicht: boolean; enthaelt?: boolean }   // enthaelt: Teil des Textes (Filter im Spaltenkopf), sonst der ganze Wert
export interface FilterGruppe { art: string; op: Verknuepfung; werte: FilterWert[] }
export interface Bedingung { gruppen: FilterGruppe[]; zwischen: Verknuepfung[] }   // zwischen[i]: zwischen Gruppe i und i+1

export const LEER: Bedingung = { gruppen: [], zwischen: [] };
const klein = (s: string) => s.toLocaleLowerCase('de');
const gleich = (a: string, b: string) => klein(a) === klein(b);

/** Passt ein Eintrag? werteVon(art) liefert die Werte des Eintrags in dieser Art. */
export function erfuellt(b: Bedingung, werteVon: (art: string) => string[]): boolean {
  let erg: boolean | null = null;
  b.gruppen.forEach((g, i) => {
    const hat = werteVon(g.art).map(klein);
    const r = g.werte.map((v) => (v.enthaelt ? hat.some((h) => h.includes(klein(v.w))) : hat.includes(klein(v.w))) !== v.nicht);
    const x = g.op === 'und' ? r.every(Boolean) : r.some(Boolean);
    erg = erg === null ? x : (b.zwischen[i - 1] ?? 'und') === 'oder' ? erg || x : erg && x;
  });
  return erg !== false;
}

const ohne = (b: Bedingung, i: number): Bedingung => ({ gruppen: b.gruppen.filter((_, k) => k !== i), zwischen: b.zwischen.filter((_, k) => k !== Math.max(0, i - 1)) });

/** Klick links: steht der Wert schon drin, geht er heraus; sonst dazu (in derselben Art mit deren Verknüpfung, neue Art mit UND). */
export function umschalten(b: Bedingung, art: string, w: string, nicht = false): Bedingung {
  const i = b.gruppen.findIndex((g) => g.art === art);
  if (i < 0) return { gruppen: [...b.gruppen, { art, op: 'oder', werte: [{ w, nicht }] }], zwischen: b.gruppen.length ? [...b.zwischen, 'und'] : b.zwischen };
  const g = b.gruppen[i]!, k = g.werte.findIndex((v) => gleich(v.w, w));
  if (k < 0) return { ...b, gruppen: b.gruppen.map((x, n) => (n === i ? { ...x, werte: [...x.werte, { w, nicht }] } : x)) };
  return wertWeg(b, i, k);
}

/** Einen Wert entfernen (die leere Art geht mit). */
export function wertWeg(b: Bedingung, i: number, k: number): Bedingung {
  const g = b.gruppen[i]!;
  if (g.werte.length <= 1) return ohne(b, i);
  return { ...b, gruppen: b.gruppen.map((x, n) => (n === i ? { ...x, werte: x.werte.filter((_, m) => m !== k) } : x)) };
}
export const gruppeWeg = (b: Bedingung, i: number): Bedingung => (b.gruppen[i] ? ohne(b, i) : b);
export const artWeg = (b: Bedingung, art: string): Bedingung => gruppeWeg(b, b.gruppen.findIndex((g) => g.art === art));
/** Klick auf einen Wert: NICHT ↔ normal. */
export const nichtWechseln = (b: Bedingung, i: number, k: number): Bedingung =>
  ({ ...b, gruppen: b.gruppen.map((x, n) => (n === i ? { ...x, werte: x.werte.map((v, m) => (m === k ? { ...v, nicht: !v.nicht } : v)) } : x)) });
/** Klick auf das Wort in einer Art: ODER ↔ UND. */
export const opWechseln = (b: Bedingung, i: number): Bedingung =>
  ({ ...b, gruppen: b.gruppen.map((x, n) => (n === i ? { ...x, op: x.op === 'oder' ? 'und' : 'oder' } : x)) });
/** Klick auf das Wort zwischen zwei Arten: UND ↔ ODER. */
export const zwischenWechseln = (b: Bedingung, i: number): Bedingung =>
  ({ ...b, zwischen: b.gruppen.slice(1).map((_, n) => (n === i ? ((b.zwischen[n] ?? 'und') === 'und' ? 'oder' : 'und') : (b.zwischen[n] ?? 'und'))) });

/** Die Werte einer Art, die eingeschlossen sind (ohne NICHT) – z. B. für die Markierung links. */
export const werteIn = (b: Bedingung, art: string): string[] => b.gruppen.find((g) => g.art === art)?.werte.filter((v) => !v.nicht).map((v) => v.w) ?? [];
export const hat = (b: Bedingung, art: string, w: string): boolean => !!b.gruppen.find((g) => g.art === art)?.werte.some((v) => gleich(v.w, w));

const WORT: Record<Verknuepfung, string> = { und: 'UND', oder: 'ODER' };
/** Die ganze Bedingung als Satz, z. B. „Art: Firma UND (Gewerk: Dachdecker ODER NICHT Zimmerer)“. */
export function satz(b: Bedingung, titel: (art: string) => string, wertTitel: (art: string, w: string) => string = (_, w) => w): string {
  return b.gruppen.map((g, i) => {
    const t = g.werte.map((v) => (v.nicht ? 'NICHT ' : '') + (v.enthaelt ? `enthält „${v.w}“` : wertTitel(g.art, v.w))).join(` ${WORT[g.op]} `);
    return (i ? `${WORT[b.zwischen[i - 1] ?? 'und']} ` : '') + `${titel(g.art)}: ${g.werte.length > 1 ? `(${t})` : t}`;
  }).join(' ');
}
export const wort = (v: Verknuepfung) => WORT[v];

/** Spaltenfilter sammeln: „enthält text“ kommt zu den Werten dieser Art dazu (mit ODER), schon vorhandene bleiben. */
export function enthaeltDazu(b: Bedingung, art: string, text: string): Bedingung {
  const wert = { w: text.trim(), nicht: false, enthaelt: true };
  if (!wert.w) return b;
  const i = b.gruppen.findIndex((g) => g.art === art);
  if (i < 0) return { gruppen: [...b.gruppen, { art, op: 'oder', werte: [wert] }], zwischen: b.gruppen.length ? [...b.zwischen, 'und'] : b.zwischen };
  if (b.gruppen[i]!.werte.some((v) => v.enthaelt && gleich(v.w, wert.w))) return b;
  return { ...b, gruppen: b.gruppen.map((g, n) => (n === i ? { ...g, werte: [...g.werte, wert] } : g)) };
}
