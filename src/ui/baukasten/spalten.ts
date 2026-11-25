// Spalten einer Tabelle: welche sichtbar sind, in welcher Reihenfolge und wie breit.
// Gilt je Benutzer und Gerät (im Browser gespeichert) – für jede Tabelle im Programm gleich.
import { createStore } from 'solid-js/store';
import type { Feld, ObjektModell } from '../../kern/modell';

interface Stand { reihenfolge: string[]; aus: string[]; breiten: Record<string, number> }

export function spaltenFuer(m: ObjektModell) {
  const schluessel = `bp_spalten_${m.name}`;
  const moeglich = m.felder.filter((f) => f.art !== 'langtext' && !f.verborgen);   // verborgene Felder (Kennung, Reihe …) sind keine Spalten
  const werk = (): Stand => ({ reihenfolge: moeglich.map((f) => f.name), aus: moeglich.filter((f) => !f.inListe).map((f) => f.name), breiten: {} });
  let start = werk();
  try {
    const g = JSON.parse(localStorage.getItem(schluessel) ?? 'null') as Stand | null;
    if (g) {
      // Felder, die es inzwischen neu gibt, kommen hinten dazu; entfallene fliegen raus.
      const namen = moeglich.map((f) => f.name);
      const reihenfolge = [...g.reihenfolge.filter((n) => namen.includes(n)), ...namen.filter((n) => !g.reihenfolge.includes(n))];
      start = { reihenfolge, aus: [...g.aus.filter((n) => namen.includes(n)), ...namen.filter((n) => !g.reihenfolge.includes(n) && !moeglich.find((f) => f.name === n)!.inListe)], breiten: g.breiten ?? {} };
    }
  } catch { /* unlesbar: Werkseinstellung */ }
  const [stand, setStand] = createStore<Stand>(start);
  const merken = () => { try { localStorage.setItem(schluessel, JSON.stringify(stand)); } catch { /* Speicher voll oder gesperrt */ } };
  const feld = (n: string) => moeglich.find((f) => f.name === n)!;
  return {
    alle: () => stand.reihenfolge.map(feld),
    sichtbare: (): Feld[] => stand.reihenfolge.filter((n) => !stand.aus.includes(n)).map(feld),
    istAn: (n: string) => !stand.aus.includes(n),
    breite: (f: Feld) => stand.breiten[f.name] ?? f.breite ?? 160,
    schalten(n: string) {
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
    setzeBreite(n: string, px: number, fertig: boolean) { setStand('breiten', n, Math.max(60, Math.round(px))); if (fertig) merken(); },
    zuruecksetzen() { setStand(werk()); merken(); },
  };
}
