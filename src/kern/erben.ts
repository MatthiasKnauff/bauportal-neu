// Erben über Ebenen (z. B. Ausschreibungsdaten: LV ← Projekt ← Büro, wie im bisherigen Bauportal): Ein Feld mit „erbt“ hält am
// Eintrag nur eine Abweichung; leer gilt der Wert der nächsten Ebene, die einen hat. Die Ebenen halten ihn unter praefix + Feldname.
import type { Feld, ObjektModell, Wert, Werte } from './modell';

export const istLeer = (w: Wert | undefined): boolean => w === null || w === undefined || w === '';

/** Was ein erbendes Feld von den Ebenen bekäme (ohne den eigenen Wert): Wert und Nummer der Ebene. */
export function geerbt(m: ObjektModell, f: Feld, ebenen: (Werte | undefined)[]): { wert: Wert; ebene: number } | undefined {
  if (!f.erbt || !m.erben) return undefined;
  for (let i = 0; i < ebenen.length; i++) {
    const w = ebenen[i]?.[m.erben.praefix + f.name];
    if (!istLeer(w)) return { wert: w!, ebene: i };
  }
  return undefined;
}

/** Die wirksamen Werte: eigene, und wo ein erbendes Feld leer ist, der Wert der Ebene darüber. Herkunft je geerbtem Feld = Nummer der Ebene. */
export function wirksam(m: ObjektModell, werte: Werte, ebenen: (Werte | undefined)[]): { werte: Werte; herkunft: Record<string, number> } {
  const aus: Werte = { ...werte }, herkunft: Record<string, number> = {};
  if (m.erben) for (const f of m.felder) {
    if (!f.erbt || !istLeer(werte[f.name])) continue;
    const g = geerbt(m, f, ebenen);
    if (g) { aus[f.name] = g.wert; herkunft[f.name] = g.ebene; }
  }
  return { werte: aus, herkunft };
}

/** Die Felder, mit denen eine Ebene die Vorgaben hält: die erbenden Felder des Modells unter praefix + Name, in einer Gruppe
 *  (ohne die Felder, die es auf dieser Ebene nicht gibt). Sie erben selbst weiter (Projekt ← Büro: dieselben Namen, Präfix leer),
 *  leer heißt also auch hier: wie darüber. */
export function vorgabeFelder(m: ObjektModell, gruppe: string, ohne: string[] = []): Feld[] {
  const p = m.erben!.praefix;
  return m.felder.filter((f) => f.erbt && !ohne.includes(f.name)).map((f) => {
    const { inListe: _l, spalte: _s, wenn, ...rest } = f;
    return { ...rest, name: p + f.name, gruppe, ...(wenn ? { wenn: Object.fromEntries(Object.entries(wenn).map(([k, v]) => [p + k, v])) } : {}) };
  });
}
