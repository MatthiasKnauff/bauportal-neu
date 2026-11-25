// Eingaben in der Tabelle des Bauzeitenplans, wie man sie aus Projektsoftware kennt:
// Dauer „5“, „5t“, „2w“ (Wochen zu so vielen Arbeitstagen wie die Arbeitswoche hat), „0“ = Meilenstein;
// Vorgänger „3;4AA+2t;5EE-1w“ – Zeilennummer, Art (EA, AA, EE, AE; ohne Angabe EA) und Abstand.
import type { Art } from './rechnung';

export function dauerLesen(text: string, woche = 5): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(t|at|tage?|w|wo|wochen?)?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return Math.round(m[2] && /^w/i.test(m[2]) ? n * woche : n);
}
export const dauerSchreiben = (d: number): string => `${d} ${d === 1 ? 'Tag' : 'Tage'}`;

export interface Vorgaenger { nr: number; art: Art; abstand: number }
const ARTEN = new Set(['ea', 'aa', 'ee', 'ae']);
/** „3;4AA+2t“ → Liste; null, wenn etwas nicht lesbar ist (dann bleibt die Eingabe stehen und wird markiert). */
export function vorgaengerLesen(text: string, woche = 5): Vorgaenger[] | null {
  const l: Vorgaenger[] = [];
  for (const teil of text.split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*([a-z]{2})?\s*(?:([+-])\s*(\d+)\s*(t|at|tage?|w|wo|wochen?)?)?$/i.exec(teil);
    if (!m) return null;
    const art = (m[2] ?? 'ea').toLowerCase();
    if (!ARTEN.has(art)) return null;
    const menge = m[4] ? Number(m[4]) * (m[5] && /^w/i.test(m[5]) ? woche : 1) : 0;
    l.push({ nr: Number(m[1]), art: art as Art, abstand: m[3] === '-' ? -menge : menge });
  }
  return l;
}
export function vorgaengerSchreiben(l: Vorgaenger[]): string {
  return l.map((v) => `${v.nr}${v.art === 'ea' && !v.abstand ? '' : v.art.toUpperCase()}${v.abstand ? `${v.abstand > 0 ? '+' : ''}${v.abstand}t` : ''}`).join(';');
}
