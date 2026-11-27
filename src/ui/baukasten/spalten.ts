// Spalten einer Tabelle: welche sichtbar sind, in welcher Reihenfolge und wie breit.
// Gilt je Benutzer und Gerät (im Browser gespeichert) – für jede Tabelle im Programm gleich, auch für die des Balkenplans.
import { createSignal } from 'solid-js';
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
  const [zug, setZug] = createSignal<{ was: string; ziel: string; seite: 'links' | 'rechts' } | null>(null);   // Spalte, die gerade mit der Maus verschoben wird
  let kante = false;   // gerade wird an einer Kante die Breite gezogen – dann ist es kein Verschieben
  const this_ = {
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
    setzeBreiten(b: Record<string, number>, fertig = false) { setStand('breiten', Object.fromEntries(Object.entries(b).map(([n, px]) => [n, Math.max(40, Math.round(px))]))); if (fertig) merken(); },
    /** Doppelklick auf eine Trennlinie (in jeder Tabelle gleich): alle sichtbaren Spalten so breit wie ihr längster Inhalt.
     *  texte(n): die Inhalte der Spalte, wie sie in den Zellen stehen; schrift: die Schrift der Zellen. */
    allePassend(texte: (n: string) => string[], schrift: string, kopfschrift: string, zusatz: Record<string, number> = {}) {   // zusatz: was eine Zelle außer dem Text zeigt (z. B. ☎ vor der Nummer)
      const stift = document.createElement('canvas').getContext('2d')!;
      const b: Record<string, number> = {};
      for (const f of this_.sichtbare()) {
        stift.font = schrift; let breit = 0;
        for (const t of texte(f.name)) breit = Math.max(breit, stift.measureText(t).width);
        stift.font = kopfschrift;
        b[f.name] = Math.min(800, Math.ceil(Math.max(breit + (zusatz[f.name] ?? 0) + 21, stift.measureText(f.titel).width + 21 + 18)));   // Innenabstand und Trennlinie; im Kopf Platz für den Sortierpfeil
      }
      this_.setzeBreiten(b, true);
    },
    setzeBreite(n: string, px: number, fertig: boolean) { setStand('breiten', n, Math.max(40, Math.round(px))); if (fertig) merken(); },
    zuruecksetzen() { setStand(werk()); merken(); },
    /** Kopfzelle wie in Excel an eine andere Stelle ziehen – in jeder Tabelle gleich: ab ein paar Pixeln Weg wird gezogen (ein Klick
     *  sortiert weiter), die gezogene Spalte wird blass, eine Linie zeigt, wo sie landet; Esc bricht ab. Feste Spalten bleiben, wo sie sind. */
    ziehbar: (n: string) => ({
      'data-spalte': n,
      get 'data-spalte-gezogen'() { return zug()?.was === n ? '' : undefined; },
      get 'data-spalte-ziel'() { const z = zug(); return z && z.ziel === n && z.was !== n ? z.seite : undefined; },
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0 || kante || (e.target as Element).closest('.griff, input')) return;
        const kopf = (e.currentTarget as HTMLElement).parentElement!, x0 = e.clientX;
        let laeuft = false;
        const unter = (ev: PointerEvent) => {
          const el = [...kopf.querySelectorAll<HTMLElement>('[data-spalte]')].find((x) => { const r = x.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX < r.right; });
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { ziel: el.dataset.spalte!, seite: (ev.clientX < r.left + r.width / 2 ? 'links' : 'rechts') as 'links' | 'rechts' };
        };
        const bewegt = (ev: PointerEvent) => {
          if (!laeuft) { if (Math.abs(ev.clientX - x0) < 6) return; laeuft = true; }
          const u = unter(ev); if (u) setZug({ was: n, ...u });
        };
        const ende = () => { removeEventListener('pointermove', bewegt); removeEventListener('pointerup', los); removeEventListener('keydown', taste, true); setZug(null); };
        const los = () => {
          const z = zug(); ende(); if (!laeuft || !z) return;
          // der Klick nach dem Ziehen sortiert nicht
          addEventListener('click', (k) => { k.stopPropagation(); k.preventDefault(); }, { capture: true, once: true });
          this_.setzen(z.was, z.ziel, z.seite);
        };
        const taste = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && laeuft) { ev.stopPropagation(); laeuft = false; ende(); } };
        addEventListener('pointermove', bewegt); addEventListener('pointerup', los); addEventListener('keydown', taste, true);
      },
    }),
    /** Spalte „was“ links oder rechts neben „wohin“ setzen. */
    setzen(was: string, wohin: string, seite: 'links' | 'rechts') {
      if (was === wohin || !stand.reihenfolge.includes(wohin)) return;   // z. B. auf eine Spalte außerhalb der Wahl (je Bieter:in)
      const r = stand.reihenfolge.filter((x) => x !== was), i = r.indexOf(wohin);
      r.splice(seite === 'links' ? i : i + 1, 0, was);
      setStand('reihenfolge', r); merken();
    },
    /** Wie in Excel: Ziehen an der rechten Kante ändert nur diese Spalte. vorher: z. B. die gerade sichtbaren Breiten festhalten. */
    breiteZiehen(e: PointerEvent, n: string, vorher?: () => void) {
      e.preventDefault(); e.stopPropagation();
      vorher?.(); kante = true;
      const start = e.clientX, b0 = this_.breite(spalte(n));
      const bewegt = (x: PointerEvent) => this_.setzeBreite(n, b0 + x.clientX - start, false);
      const fertig = (x: PointerEvent) => { kante = false; this_.setzeBreite(n, b0 + x.clientX - start, true); removeEventListener('pointermove', bewegt); removeEventListener('pointerup', fertig); };
      addEventListener('pointermove', bewegt); addEventListener('pointerup', fertig);
    },
  };
  return this_;
}
/** Was gezeigte Zellen außer ihrem Text zeigen (Symbol, Einrückung, Klappe): Breite des Inhalts minus Breite des Texts, je Spalte das Größte.
 *  Für „alle Spalten passend“ – gemessen an den Zellen, die gerade zu sehen sind. */
export function zusatzMessen(zellen: { spalte: string; el: Element; text: string }[], schrift: string): Record<string, number> {
  const stift = document.createElement('canvas').getContext('2d')!; stift.font = schrift;
  const bereich = document.createRange(), aus: Record<string, number> = {};
  for (const z of zellen) {
    if (!z.text) continue;
    bereich.selectNodeContents(z.el);
    aus[z.spalte] = Math.max(aus[z.spalte] ?? 0, Math.ceil(bereich.getBoundingClientRect().width - stift.measureText(z.text).width));
  }
  return aus;
}
/** Was das Spaltenfeld von einer Spaltenwahl braucht – gleich, welche Art Spalten sie verwaltet. */
export type Spaltenwahl = Pick<ReturnType<typeof spaltenwahl<Spaltenart>>, 'alle' | 'istAn' | 'istFest' | 'schalten' | 'schieben' | 'schritt' | 'zuruecksetzen'>;

/** Die Spalten einer Tabelle aus dem Datenmodell: jedes Feld außer langen Texten und verborgenen Feldern. */
export const spaltenFuer = (m: ObjektModell) => spaltenwahl<Feld>(`bp_spalten_${m.name}`, m.felder.filter((f) => (f.inListe || f.spalte) && f.art !== 'langtext' && !f.verborgen));
