// Baustein „Detailkarte“ (Platz rechts): alle Felder eines Objekts, erzeugt aus dem Datenmodell.
// Jede Änderung eines Feldes ist ein Befehl – sofort wirksam, mit Rückgängig.
import { For, Show, createSignal, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eingabefehler, gilt, leerwert, pruefeWerte, type Feld, type ObjektModell, type Wert, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, objektname, rueckgaengig } from '../unterbau/abgleich';
import { darf, neueKennung } from '../unterbau/api';
import { Dialog } from './dialog';
import { FeldEingabe } from './feld';
import { Zeichen } from './zeichen';
import { hinweis } from '../unterbau/meldungen';

export function gruppen(m: ObjektModell, werte: Werte, verborgen: string[] = []): { titel: string; felder: Feld[] }[] {
  const aus: { titel: string; felder: Feld[] }[] = [];
  for (const f of m.felder) {
    if (f.verborgen || verborgen.includes(f.name) || !gilt(f, werte, m)) continue;
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
    if (sauber[f.name] !== z.werte[f.name]) ausfuehren({ objekt: m.name, art: 'aendern', objektId: z.id, werte: sauber, ...(herkunft ? { herkunft } : {}) }, `${f.titel} von „${objektname(m, z.werte)}“ ändern`);
    return undefined;
  } catch (e) {
    if (e instanceof Eingabefehler) return e.felder[f.name]; throw e;
  }
}

/** Stellschraube: Objekte mit eigenem Löschablauf (z. B. das Projekt: „Was soll gelöscht werden?“ statt nur des Eintrags). */
export const eigenesLoeschen: Record<string, (z: Zeile) => void> = {};
/** Reiter, die jede Karte bekommen kann (z. B. „Dokumente“, wenn zum Eintrag abgelegte Dokumente gehören) – ohne Rückgabe kein Reiter. */
export const reiterFuerAlle: ((modell: ObjektModell, z: Zeile) => { titel: string; inhalt: () => JSX.Element } | undefined)[] = [];

export function loesche(m: ObjektModell, z: Zeile): void {
  if (eigenesLoeschen[m.name]) { eigenesLoeschen[m.name]!(z); return; }
  const name = objektname(m, z.werte);
  ausfuehren({ objekt: m.name, art: 'loeschen', objektId: z.id }, `„${name}“ löschen`);
  hinweis(`„${name}“ gelöscht.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
}

export function inEigenemFenster(m: ObjektModell, id: string): void {
  window.open(`${location.pathname}?karte=${m.name}:${id}`, `bp-${id}`, 'popup,width=480,height=820');
}

export function Detailkarte(p: {
  modell: ObjektModell; zeile: Zeile;
  onZu?: () => void;
  heftzwecke?: JSX.Element;   // Heftzwecke der Seitenleiste (vom Rahmen) – mit ihr auch „In eigenem Fenster“
  zusatz?: (z: Zeile) => JSX.Element;
  reiter?: (z: Zeile) => { titel: string; inhalt: () => JSX.Element }[];   // weitere Reiter neben den Angaben (z. B. Projekte eines Kontakts)
  symbole?: Partial<Record<'schliessen' | 'zuklappen' | 'fenster', string>>;
  verborgen?: string[];                    // Felder, die der Zusammenhang schon festlegt (Projekt, Version)
  oben?: (z: Zeile) => JSX.Element;        // über den Angaben (z. B. Anrufen, E-Mail, Route beim Kontakt)
  einschub?: Record<string, (z: Zeile) => JSX.Element>;   // nach dieser Gruppe (z. B. weitere Nummern und Ansprechpartner:innen nach „Kontakt“)
  blaettern?: { nr: number; anzahl: number; onSchritt: (schritt: -1 | 1) => void };   // „3 von 42“ mit ‹ › durch die gezeigten Einträge
}) {
  const schreiben = () => darf(p.modell.name, 'schreiben');
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const titel = () => objektname(p.modell, p.zeile.werte);
  const [reiter, setReiter] = createSignal(0);
  const reiterListe = () => [...(p.reiter?.(p.zeile) ?? []), ...reiterFuerAlle.flatMap((r) => r(p.modell, p.zeile) ?? [])];
  const aendern = (f: Feld, w: Wert, herkunft?: string) => setFehler(f.name, feldAendern(p.modell, p.zeile, f, w, herkunft));
  return (
    <aside class="karte" aria-label={`${p.modell.titel} ${titel()}`}>
      <div class="karte-kopf">
        <Show when={p.onZu}><button class="knopf still nur-schmal" onClick={p.onZu}>‹ Liste</button></Show>
        <h2>{titel() || p.modell.titel}</h2>
        <Show when={p.heftzwecke}>
          <button class="knopf still nur-breit" aria-label="In eigenem Fenster öffnen" title="In eigenem Fenster öffnen" onClick={() => inEigenemFenster(p.modell, p.zeile.id)}>{p.symbole?.fenster ?? '⧉'}</button>
          <span class="nur-breit-flex">{p.heftzwecke}</span>
        </Show>
        <Show when={p.onZu}><button class="knopf still nur-breit" aria-label="Karte schließen" title="Schließen (Esc)" onClick={p.onZu}>{p.symbole?.schliessen ?? '×'}</button></Show>
      </div>
      <Show when={p.blaettern && p.blaettern.anzahl > 1}>{(_) => { const b = () => p.blaettern!; return (
        <div class="karte-blaettern">
          <button class="knopf klein still" aria-label="Voriger Eintrag" disabled={b().nr <= 1} onClick={() => b().onSchritt(-1)}>‹</button>
          <span>{b().nr} von {b().anzahl}</span>
          <button class="knopf klein still" aria-label="Nächster Eintrag" disabled={b().nr >= b().anzahl} onClick={() => b().onSchritt(1)}>›</button>
        </div>); }}</Show>
      <Show when={reiterListe().length}>
        <div class="karte-reiter" role="tablist">
          <For each={[p.modell.titel, ...reiterListe().map((r) => r.titel)]}>{(t, i) => <button type="button" role="tab" aria-selected={reiter() === i()} onClick={() => setReiter(i())}>{t}</button>}</For>
        </div>
      </Show>
      <Show when={reiter() === 0} fallback={<div class="karte-inhalt">{reiterListe()[reiter() - 1]?.inhalt()}</div>}>
      <div class="karte-inhalt">
        {p.oben?.(p.zeile)}
        <For each={gruppen(p.modell, p.zeile.werte, p.verborgen)}>{(g) => {
          const felder = () => <For each={g.felder}>{(f) => <FeldEingabe feld={f} breit={f.name === p.modell.anzeigeFeld} wert={p.zeile.werte[f.name] ?? null} fehler={fehler[f.name]} gesperrt={!schreiben()} herkunft={p.zeile.herkunft?.[f.name]} objekt={p.modell.name} zusammenhang={p.zeile.werte} onWert={(w, herkunft) => aendern(f, w, herkunft)} />}</For>;
          return <>{p.modell.eingeklappt?.includes(g.titel)
            ? <details class="feldgruppe"><summary>{g.titel}</summary><div class="feldgruppe-inhalt">{felder()}</div></details>
            : <fieldset><Show when={g.titel}><legend>{g.titel}</legend></Show>{felder()}</fieldset>}{p.einschub?.[g.titel]?.(p.zeile)}</>;
        }}</For>
        {p.zusatz?.(p.zeile)}
        <Show when={!schreiben()}><p class="still-text klein-text">Du kannst diese Angaben ansehen, aber nicht ändern.</p></Show>
        <Show when={p.onZu && !p.modell.einzeln && darf(p.modell.name, 'loeschen')}>
          <div class="karte-fuss"><button class="knopf gefahr" onClick={() => loesche(p.modell, p.zeile)}>{p.modell.titel} löschen</button></div>
        </Show>
      </div>
      </Show>
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
      ausfuehren({ objekt: p.modell.name, art: 'anlegen', objektId: id, werte: sauber }, `„${objektname(p.modell, sauber) || p.modell.titel}“ anlegen`);
      p.onZu(id);
    } catch (e) {
      if (!(e instanceof Eingabefehler)) throw e;
      for (const f of p.modell.felder) setFehler(f.name, e.felder[f.name]);
    }
  };
  return (
    <Dialog titel={`${p.modell.titel} anlegen`} breit onAbbrechen={() => p.onZu()} geaendert={() => p.modell.felder.some((f) => werte[f.name] !== start[f.name])}
      knoepfe={<><button class="knopf" data-abbrechen onClick={() => p.onZu()}>Abbrechen</button><button class="knopf haupt" onClick={ok}>Anlegen</button></>}>
      <form class="raster" onSubmit={(e) => { e.preventDefault(); ok(); }}>
        <For each={p.modell.felder.filter((f) => (f.art !== 'langtext' || f.name === p.modell.anzeigeFeld) && !f.verborgen && !p.verborgen?.includes(f.name) && gilt(f, werte, p.modell))}>{(f) => (
          <FeldEingabe feld={f} wert={werte[f.name] ?? null} fehler={fehler[f.name]} sofort objekt={p.modell.name} zusammenhang={werte} onWert={(w) => setWerte(f.name, w)} />
        )}</For>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
