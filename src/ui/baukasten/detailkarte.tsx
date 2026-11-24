// Baustein „Detailkarte“ (Platz rechts): alle Felder eines Objekts, erzeugt aus dem Datenmodell.
// Jede Änderung eines Feldes ist ein Befehl – sofort wirksam, mit Rückgängig.
import { For, Show, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eingabefehler, gilt, leerwert, pruefeWerte, type Feld, type ObjektModell, type Wert, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, rueckgaengig } from '../abgleich';
import { darf, neueKennung } from '../api';
import { Dialog } from './dialog';
import { FeldEingabe } from './feld';
import { hinweis } from './hinweise';

export function gruppen(m: ObjektModell, werte: Werte, verborgen: string[] = []): { titel: string; felder: Feld[] }[] {
  const aus: { titel: string; felder: Feld[] }[] = [];
  for (const f of m.felder) {
    if (verborgen.includes(f.name) || !gilt(f, werte)) continue;
    const t = f.gruppe ?? '';
    let g = aus.find((x) => x.titel === t);
    if (!g) aus.push((g = { titel: t, felder: [] }));
    g.felder.push(f);
  }
  return aus;
}

/** Ändert ein Feld eines Objekts – ein Befehl, sofort wirksam, mit Rückgängig. Liefert den Fehlertext, wenn die Eingabe nicht passt. */
export function feldAendern(m: ObjektModell, z: Zeile, f: Feld, w: Wert, herkunft?: string): string | undefined {
  try {
    const sauber = pruefeWerte(m, { [f.name]: w }, false);
    if (sauber[f.name] !== z.werte[f.name]) ausfuehren({ objekt: m.name, art: 'aendern', objektId: z.id, werte: sauber, ...(herkunft ? { herkunft } : {}) }, `${f.titel} von „${String(z.werte[m.anzeigeFeld] ?? '')}“ ändern`);
    return undefined;
  } catch (e) {
    if (e instanceof Eingabefehler) return e.felder[f.name]; throw e;
  }
}

export function loesche(m: ObjektModell, z: Zeile): void {
  const name = String(z.werte[m.anzeigeFeld] ?? '');
  ausfuehren({ objekt: m.name, art: 'loeschen', objektId: z.id }, `„${name}“ löschen`);
  hinweis(`„${name}“ gelöscht.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
}

export function inEigenemFenster(m: ObjektModell, id: string): void {
  window.open(`${location.pathname}?karte=${m.name}:${id}`, `bp-${id}`, 'popup,width=480,height=820');
}

export function Detailkarte(p: {
  modell: ObjektModell; zeile: Zeile;
  onZu?: () => void; onZuklappen?: () => void;
  zusatz?: (z: Zeile) => JSX.Element;
  symbole?: Partial<Record<'schliessen' | 'zuklappen' | 'fenster', string>>;
  verborgen?: string[];                    // Felder, die der Zusammenhang schon festlegt (Projekt, Version)
}) {
  const schreiben = () => darf(p.modell.name, 'schreiben');
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const titel = () => String(p.zeile.werte[p.modell.anzeigeFeld] ?? '');
  const aendern = (f: Feld, w: Wert, herkunft?: string) => setFehler(f.name, feldAendern(p.modell, p.zeile, f, w, herkunft));
  return (
    <aside class="karte" aria-label={`${p.modell.titel} ${titel()}`}>
      <div class="karte-kopf">
        <Show when={p.onZu}><button class="knopf still nur-schmal" onClick={p.onZu}>‹ Liste</button></Show>
        <h2>{titel() || p.modell.titel}</h2>
        <Show when={p.onZuklappen}>
          <button class="knopf still nur-breit" aria-label="In eigenem Fenster öffnen" title="In eigenem Fenster öffnen" onClick={() => inEigenemFenster(p.modell, p.zeile.id)}>{p.symbole?.fenster ?? '⧉'}</button>
          <button class="knopf still nur-breit" aria-label="Karte zuklappen" title="Zuklappen" onClick={p.onZuklappen}>{p.symbole?.zuklappen ?? '⇥'}</button>
        </Show>
        <Show when={p.onZu}><button class="knopf still nur-breit" aria-label="Karte schließen" title="Schließen (Esc)" onClick={p.onZu}>{p.symbole?.schliessen ?? '×'}</button></Show>
      </div>
      <div class="karte-inhalt">
        <For each={gruppen(p.modell, p.zeile.werte, p.verborgen)}>{(g) => (
          <fieldset>
            <Show when={g.titel}><legend>{g.titel}</legend></Show>
            <For each={g.felder}>{(f) => <FeldEingabe feld={f} wert={p.zeile.werte[f.name] ?? null} fehler={fehler[f.name]} gesperrt={!schreiben()} herkunft={p.zeile.herkunft?.[f.name]} zusammenhang={p.zeile.werte} onWert={(w, herkunft) => aendern(f, w, herkunft)} />}</For>
          </fieldset>
        )}</For>
        {p.zusatz?.(p.zeile)}
        <Show when={!schreiben()}><p class="still-text klein-text">Du kannst diese Angaben ansehen, aber nicht ändern.</p></Show>
        <Show when={p.onZu && !p.modell.einzeln && darf(p.modell.name, 'loeschen')}>
          <div class="karte-fuss"><button class="knopf gefahr" onClick={() => loesche(p.modell, p.zeile)}>{p.modell.titel} löschen</button></div>
        </Show>
      </div>
    </aside>
  );
}

/** Fenster zum Anlegen eines Objekts – Felder aus dem Datenmodell, auf Wunsch vorbelegt (Duplizieren). */
export function NeuFenster(p: { modell: ObjektModell; start: Werte; verborgen?: string[]; onZu: (id?: string) => void }) {
  // Verweise (Projekt, Version) kommen aus dem Zusammenhang über „start“ und stehen nicht im Fenster.
  const start: Werte = {};
  for (const f of p.modell.felder) start[f.name] = p.start[f.name] ?? leerwert(f);
  const [werte, setWerte] = createStore<Werte>(start);
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const ok = () => {
    try {
      const sauber = pruefeWerte(p.modell, { ...werte }, true);
      const id = neueKennung();
      ausfuehren({ objekt: p.modell.name, art: 'anlegen', objektId: id, werte: sauber }, `„${sauber[p.modell.anzeigeFeld]}“ anlegen`);
      p.onZu(id);
    } catch (e) {
      if (!(e instanceof Eingabefehler)) throw e;
      for (const f of p.modell.felder) setFehler(f.name, e.felder[f.name]);
    }
  };
  return (
    <Dialog titel={`${p.modell.titel} anlegen`} breit onAbbrechen={() => p.onZu()}
      knoepfe={<><button class="knopf" onClick={() => p.onZu()}>Abbrechen</button><button class="knopf haupt" onClick={ok}>Anlegen</button></>}>
      <form class="raster" onSubmit={(e) => { e.preventDefault(); ok(); }}>
        <For each={p.modell.felder.filter((f) => f.art !== 'langtext' && !p.verborgen?.includes(f.name) && gilt(f, werte))}>{(f) => (
          <FeldEingabe feld={f} wert={werte[f.name] ?? null} fehler={fehler[f.name]} sofort zusammenhang={werte} onWert={(w) => setWerte(f.name, w)} />
        )}</For>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
