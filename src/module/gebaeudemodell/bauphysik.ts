// Überschlägiger U-Wert eines Aufbaus nach DIN EN ISO 6946: U = 1 / (Rsi + Σ d/λ + Rse).
// Nur solange jede Schicht mit Dicke auch ein λ hat – sonst gibt es keinen Wert, statt eines falschen.

/** Wärmeübergangswiderstände innen/außen in m²K/W nach Art des Bauteils (Wärmestrom horizontal, aufwärts, abwärts). */
export const UEBERGANG: Record<string, [number, number]> = {
  aussenwand: [0.13, 0.04], fenster: [0.13, 0.04], tuer: [0.13, 0.04], stuetze: [0.13, 0.04],
  innenwand: [0.13, 0.13],
  dach: [0.10, 0.04],
  decke: [0.10, 0.10], treppe: [0.10, 0.10],
  bodenplatte: [0.17, 0], fundament: [0.17, 0],
};

export interface Schichtwerte { dicke: number | null; lambda: number | null }

export function gesamtdicke(schichten: Schichtwerte[]): number {
  return Math.round(schichten.reduce((s, x) => s + (x.dicke ?? 0), 0) * 10) / 10;
}

/** U-Wert in W/(m²K), auf zwei Stellen – oder null, wenn eine Angabe fehlt. */
export function uWert(art: string, schichten: Schichtwerte[]): number | null {
  const mitDicke = schichten.filter((s) => s.dicke);
  if (!mitDicke.length || mitDicke.some((s) => !s.lambda || s.lambda <= 0)) return null;
  const [rsi, rse] = UEBERGANG[art] ?? [0.13, 0.04];
  const r = rsi + rse + mitDicke.reduce((s, x) => s + x.dicke! / 100 / x.lambda!, 0);
  return Math.round((1 / r) * 100) / 100;
}
