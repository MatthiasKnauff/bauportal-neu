// Baustein „Detailkarte“ (Platz rechts): alle Felder eines Objekts, erzeugt aus dem Datenmodell.
// Jede Änderung eines Feldes ist ein Befehl – sofort wirksam, mit Rückgängig.
import { For, Show, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eingabefehler, leerwert, pruefeWerte, type Feld, type ObjektModell, type Wert, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, rueckgaengig } from '../abgleich';
import { darf, neueKennung } from '../api';
import { Dialog } from './dialog';
import { FeldEingabe } from './feld';
import { hinweis } from './hinweise';

function gruppen(m: ObjektModell): { titel: string; felder: Feld[] }[] {
  const aus: { titel: string; felder: Feld[] }[] = [];
  for (const f of m.felder) {
    const t = f.gruppe ?? '';
    let g = aus.find((x) => x.titel === t);
    if (!g) aus.push((g = { titel: t, felder: [] }));
    g.felder.push(f);
  }
  return aus;
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
}) {
  const schreiben = () => darf(p.modell.name, 'schreiben');
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const titel = () => String(p.zeile.werte[p.modell.anzeigeFeld] ?? '');
  const aendern = (f: Feld, w: Wert) => {
    try {
      const sauber = pruefeWerte(p.modell, { [f.name]: w }, false);
      setFehler(f.name, undefined);
      if (sauber[f.name] === p.zeile.werte[f.name]) return;
      ausfuehren({ objekt: p.modell.name, art: 'aendern', objektId: p.zeile.id, werte: sauber }, `${f.titel} von „${titel()}“ ändern`);
    } catch (e) {
      if (e instanceof Eingabefehler) setFehler(f.name, e.felder[f.name]); else throw e;
    }
  };
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
        <For each={gruppen(p.modell)}>{(g) => (
          <fieldset>
            <Show when={g.titel}><legend>{g.titel}</legend></Show>
            <For each={g.felder}>{(f) => <FeldEingabe feld={f} wert={p.zeile.werte[f.name] ?? null} fehler={fehler[f.name]} gesperrt={!schreiben()} onWert={(w) => aendern(f, w)} />}</For>
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
export function NeuFenster(p: { modell: ObjektModell; start: Werte; onZu: (id?: string) => void }) {
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
        <For each={p.modell.felder.filter((f) => f.art !== 'langtext' && f.art !== 'verweis')}>{(f) => (
          <FeldEingabe feld={f} wert={werte[f.name] ?? null} fehler={fehler[f.name]} sofort onWert={(w) => setWerte(f.name, w)} />
        )}</For>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
