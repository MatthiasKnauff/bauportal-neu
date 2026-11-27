// Pfeile des Balkenplans (Verknüpfungen) als reine Geometrie: je Verknüpfung der Weg vom Ende bzw. Anfang des Vorgängers zum
// Anfang bzw. Ende des Nachfolgers – mit Knick, kritisch markiert; bei geteilten Vorgängen vom bzw. zum gewählten Teil.
import type { L } from './bearbeiten';
import type { Termin } from './rechnung';

export type Pfeilmodus = 'markiert' | 'kritisch' | 'alle' | 'keine';
export interface Pfeil { id: string; d: string; kritisch: boolean; x2: number; yb: number; links: boolean }

/** zeile: Vorgang → sichtbare Zeile; x/xEnde: Arbeitstag → Bildpunkt (Anfang bzw. Ende eines Abschnitts); h: Zeilenhöhe. */
export function pfeilWege(links: L[], termine: Map<string, Termin>, zeile: Map<string, number>, modus: Pfeilmodus | string, markiert: string | null,
  g: { x: (w: number) => number; xEnde: (s: number, f: number) => number; h: number }): Pfeil[] {
  if (modus === 'keine') return [];
  const t = termine;
  return links.filter((l) => zeile.has(l.von) && zeile.has(l.nach)
    && (modus === 'alle' || (modus === 'kritisch' ? t.get(l.von)!.kritisch && t.get(l.nach)!.kritisch : l.von === markiert || l.nach === markiert)))
    .map((l) => {
      const teil = (tm: Termin, k: number | null | undefined) => (k != null && tm.abschnitte[k]) || tm;
      const a = teil(t.get(l.von)!, l.vonAbschnitt), b = teil(t.get(l.nach)!, l.nachAbschnitt);
      const ya = zeile.get(l.von)! * g.h + g.h / 2, yb = zeile.get(l.nach)! * g.h + g.h / 2;
      const vonEnde = l.art === 'ea' || l.art === 'ee', nachEnde = l.art === 'ee' || l.art === 'ae';
      const x1 = vonEnde ? g.xEnde(a.s, a.f) : g.x(a.s), x2 = nachEnde ? g.xEnde(b.s, b.f) : g.x(b.s);
      const knick = vonEnde ? x1 + 6 : x1 - 6, rein = nachEnde ? x2 + 6 : x2 - 6;
      return { id: l.id, d: `M${x1},${ya} H${knick} V${yb} H${rein} L${x2},${yb}`, kritisch: !!(t.get(l.von)!.kritisch && t.get(l.nach)!.kritisch), x2, yb, links: !nachEnde };
    });
}
