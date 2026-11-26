// Bautagebuch und Bauzeitenplan zusammen (wie im bisherigen Bauportal):
// – Anwesende laut Plan: Firmen, deren Leistungen am Tag des Berichts laufen, werden vorgeschlagen; die Bauleitung bestätigt,
//   meldet „nicht da“ (zählt für die Terminrüge) oder löscht den Vorschlag. Leistungen ohne Firma erscheinen je Gewerk.
// – Fortschritt je Firma: ihre laufenden Leistungen mit Prozent – „laut Plan“ und gemeldet; gemeldet wird direkt im Bauzeitenplan.
// Reine Rechnung – im Browser und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { tagAus } from '../bauzeitenplan/kalender';
import type { Plan } from '../bauzeitenplan/plan';

/** Ab so vielen Arbeitstagen Rückstand ist eine Terminrüge möglich. */
export const RUEGE_AB = 5;

export interface Laufend {
  id: string; name: string; firma: string; gewerk: string; ende: string;
  ist: number;      // gemeldeter Fortschritt in %
  soll: number;     // laut Plan am Tag des Berichts in %
  verzug: number;   // Arbeitstage hinter dem Plan (0, wenn im Plan)
}

/** Leistungen, die am Tag laufen oder schon laufen sollten und nicht fertig sind – je mit Soll und Verzug. */
export function laufendAm(plan: Plan, tag: string): Laufend[] {
  const morgen = plan.kal.arbeitstag(tagAus(tag) + 1);   // Arbeitstage bis einschließlich „tag“
  const aus: Laufend[] = [];
  for (const v of plan.reihe) {
    const t = plan.erg.termine.get(v.id);
    if (!t || t.gruppe || t.f <= t.s || t.anfang > tag) continue;
    const ist = Math.max(0, Math.min(100, Number(v.werte.fortschritt ?? 0)));
    if (ist >= 100) continue;
    const dauer = t.f - t.s, getan = Math.max(0, Math.min(dauer, morgen - t.s));
    const soll = Math.round((getan / dauer) * 100);
    aus.push({ id: v.id, name: String(v.werte.name ?? ''), firma: String(v.werte.firma ?? ''), gewerk: String(v.werte.gewerk ?? ''), ende: t.ende,
      ist, soll, verzug: Math.max(0, Math.round((((soll - ist) / 100) * dauer) * 2) / 2) });
  }
  return aus;
}

export interface Vorschlag { firma: string; leistungen: string[] }
export interface OhneFirma { gewerk: string; leistungen: string[]; ids: string[] }

/** Erwartete Firmen am Tag: laufen laut Plan (Anfang ≤ Tag ≤ Ende), sind noch nicht eingetragen und nicht ausgeblendet. */
export function erwartet(plan: Plan, tag: string, eingetragen: Set<string>, ausgeblendet: Set<string>): { firmen: Vorschlag[]; ohne: OhneFirma[] } {
  const firmen = new Map<string, Vorschlag>(), ohne = new Map<string, OhneFirma>();
  for (const v of plan.reihe) {
    const t = plan.erg.termine.get(v.id);
    if (!t || t.gruppe || t.f <= t.s || t.anfang > tag || t.ende < tag || Number(v.werte.fortschritt ?? 0) >= 100) continue;
    const w: Werte = v.werte, name = String(w.name ?? '');
    if (w.firma) {
      const f = String(w.firma);
      if (eingetragen.has(f) || ausgeblendet.has(f)) continue;
      (firmen.get(f) ?? firmen.set(f, { firma: f, leistungen: [] }).get(f)!).leistungen.push(name);
    } else {
      const g = String(w.gewerk ?? '') || 'ohne Gewerk';
      if (ausgeblendet.has(`g:${g}`)) continue;
      const o = ohne.get(g) ?? ohne.set(g, { gewerk: g, leistungen: [], ids: [] }).get(g)!;
      o.leistungen.push(name); o.ids.push(v.id);
    }
  }
  return { firmen: [...firmen.values()], ohne: [...ohne.values()] };
}
