// Spalten einer Tabelle: welche sichtbar sind, in welcher Reihenfolge und wie breit.
// Gilt je Benutzer und Gerät (im Browser gespeichert) – für jede Tabelle im Programm gleich, auch für die des Balkenplans.
import { createStore } from 'solid-js/store';
import type { Feld, ObjektModell } from '../../kern/modell';

interface Stand { reihenfolge: string[]; aus: string[]; breiten: Record<string, number> }
/** Was eine Spalte mindestens hat; „fest“ = lässt sich nicht ausblenden (z. B. Nr. und Leistung im Balkenplan). */
export interface Spaltenart { name: string; titel: string; breite?: number; inListe?: boolean; fest?: boolean }

export function spaltenwahl<S extends Spaltenart>(schluessel: string, moeglich: S[]) {
  const werk = (): Stand => ({ reihenfolge: moeglich.map((f) => f.name), aus: moeglich.filter((f) => !f.inListe && !f.fest).map((f) => f.name), breiten: {} });
  let start = werk();
  try {
    const g = JSON.parse(localStorage.getItem(schluessel) ?? 'null') as Stand | null;
    if (g) {
      // Spalten, die es inzwischen neu gibt, kommen hinten dazu; entfallene fliegen raus.
      const namen = moeglich.map((f) => f.name);
      const reihenfolge = [...g.reihenfolge.filter((n) => namen.includes(n)), ...namen.filter((n) => !g.reihenfolge.includes(n))];
      start = { reihenfolge, aus: [...g.aus.filter((n) => namen.includes(n) && !moeglich.find((f) => f.name === n)!.fest), ...namen.filter((n) => !g.reihenfolge.includes(n) && !moeglich.find((f) => f.name === n)!.inListe)], breiten: g.breiten ?? {} };
    }
  } catch { /* unlesbar: Werkseinstellung */ }
  const [stand, setStand] = createStore<Stand>(start);
  const merken = () => { try { localStorage.setItem(schluessel, JSON.stringify(stand)); } catch { /* Speicher voll oder gesperrt */ } };
  const spalte = (n: string) => moeglich.find((f) => f.name === n)!;
  return {
    alle: () => stand.reihenfolge.map(spalte),
    sichtbare: (): S[] => stand.reihenfolge.filter((n) => !stand.aus.includes(n)).map(spalte),
    istAn: (n: string) => !stand.aus.includes(n),
    istFest: (n: string) => !!spalte(n).fest,
    breite: (f: S) => stand.breiten[f.name] ?? f.breite ?? 160,
    schalten(n: string) {
      if (spalte(n).fest) return;
      if (stand.aus.includes(n)) setStand('aus', (a) => a.filter((x) => x !== n));
      else if (stand.reihenfolge.length - stand.aus.length > 1) setStand('aus', (a) => [...a, n]);   // eine Spalte bleibt immer
      merken();
    },
    /** Spalte „was“ an die Stelle von „wohin“ setzen. */
    schieben(was: string, wohin: string) {
      if (was === wohin) return;
      const r = stand.reihenfolge.filter((n) => n !== was);
      r.splice(r.indexOf(wohin) + (stand.reihenfolge.indexOf(was) < stand.reihenfolge.indexOf(wohin) ? 1 : 0), 0, was);
      setStand('reihenfolge', r); merken();
    },
    schritt(n: string, d: -1 | 1) {
      const r = [...stand.reihenfolge]; const i = r.indexOf(n); const k = i + d;
      if (k < 0 || k >= r.length) return;
      [r[i], r[k]] = [r[k]!, r[i]!];
      setStand('reihenfolge', r); merken();
    },
    /** Hat der Benutzer schon Breiten gezogen? Dann gelten sie wie in Excel genau – sonst passt die Tabelle sich dem Platz an. */
    eigeneBreiten: () => Object.keys(stand.breiten).length > 0,
    /** Alle Breiten auf einmal festhalten (z. B. die gerade sichtbaren, bevor zum ersten Mal gezogen wird). */
    setzeBreiten(b: Record<string, number>) { setStand('breiten', Object.fromEntries(Object.entries(b).map(([n, px]) => [n, Math.max(40, Math.round(px))]))); },
    setzeBreite(n: string, px: number, fertig: boolean) { setStand('breiten', n, Math.max(40, Math.round(px))); if (fertig) merken(); },
    zuruecksetzen() { setStand(werk()); merken(); },
  };
}
/** Was das Spaltenfeld von einer Spaltenwahl braucht – gleich, welche Art Spalten sie verwaltet. */
export type Spaltenwahl = Pick<ReturnType<typeof spaltenwahl<Spaltenart>>, 'alle' | 'istAn' | 'istFest' | 'schalten' | 'schieben' | 'schritt' | 'zuruecksetzen'>;

/** Die Spalten einer Tabelle aus dem Datenmodell: jedes Feld außer langen Texten und verborgenen Feldern. */
export const spaltenFuer = (m: ObjektModell) => spaltenwahl<Feld>(`bp_spalten_${m.name}`, m.felder.filter((f) => f.art !== 'langtext' && !f.verborgen));
