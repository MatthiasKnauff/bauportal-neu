// Volltextsuche der Ausschreibung (wie bisher): OZ, Kurz- und Langtext, alle Worte müssen vorkommen. Dieselbe Prüfung für
// „dieses LV“ (Baum blendet den Rest aus) und „Projekt“ / „alle Projekte“ (Trefferliste je LV).
import type { Werte } from '../../kern/modell';

export type SuchBereich = 'lv' | 'projekt' | 'alle';
export const SUCHBEREICHE: { wert: SuchBereich; titel: string; hilfe: string }[] = [
  { wert: 'lv', titel: 'dieses LV', hilfe: 'nur im geöffneten LV' }, { wert: 'projekt', titel: 'Projekt', hilfe: 'in allen LVs dieses Projekts' },
  { wert: 'alle', titel: 'alle Projekte', hilfe: 'in allen LVs aller Projekte, die du sehen darfst' }];

export const suchworte = (text: string) => text.trim().toLowerCase().split(/\s+/).filter(Boolean);
export const passt = (w: Werte, worte: string[]) => {
  if (!worte.length) return false;
  const t = `${String(w.oz ?? '')} ${String(w.kurztext ?? '')} ${String(w.langtext ?? '')}`.toLowerCase();
  return worte.every((x) => t.includes(x));
};

/** Treffer außerhalb des geöffneten LV, je LV gezählt – in der Reihenfolge der LVs. */
export function trefferJeLv<T extends { id: string; werte: Werte }>(positionen: T[], worte: string[], lvs: { id: string }[]): { lv: string; anzahl: number; erste: T[] }[] {
  const je = new Map<string, T[]>();
  for (const q of positionen) if (passt(q.werte, worte)) { const l = String(q.werte.lv ?? ''); je.set(l, [...(je.get(l) ?? []), q]); }
  return lvs.filter((l) => je.has(l.id)).map((l) => ({ lv: l.id, anzahl: je.get(l.id)!.length, erste: je.get(l.id)!.slice(0, 3) }));
}

/** Firmen (Bieter:innen der Angebote), deren Name alle Worte enthält – je Angebot ein Treffer. */
export const firmaPasst = (name: string, worte: string[]) => worte.length > 0 && worte.every((w) => name.toLowerCase().includes(w));
