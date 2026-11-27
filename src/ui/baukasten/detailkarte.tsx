// Baustein „Detailkarte“ (Platz rechts): alle Felder eines Objekts, erzeugt aus dem Datenmodell.
// Jede Änderung eines Feldes ist ein Befehl – sofort wirksam, mit Rückgängig.
import { Kartenrahmen } from './kartenrahmen';
import { For, Show, createEffect, createMemo, createSignal, untrack, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eingabefehler, gilt, leerwert, pruefeWerte, type Feld, type ObjektModell, type Wert, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, ausfuehrenMehrere, ebenenWerte, objektname, rueckgaengig, verlauf } from '../unterbau/abgleich';
import { geerbt, wirksam } from '../../kern/erben';
import { darf, modell, neueKennung } from '../unterbau/api';
import { Dialog, VerwerfenFrage } from './dialog';
import { FeldEingabe } from './feld';
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
  einschub?: Record<string, (z: Zeile) => JSX.Element>;   // nach dieser Gruppe (Titel) oder diesem Feld (Name), über die ganze Breite (z. B. weitere Nummern unter Telefon/Mobil)
  blaettern?: { nr: number; anzahl: number; onSchritt: (schritt: -1 | 1) => void };   // „3 von 42“ mit ‹ › durch die gezeigten Einträge
  ohneKopf?: boolean;                      // ohne Kopfzeile – das Fenster drumherum trägt den Titel (Karte im Fenster, schwebende Karte)
  ohneRahmen?: boolean;                    // ohne eigenen Rahmen – sie steht schon in einer Fläche (Fenster, Bautagebuch rechts)
  gruppe?: string;                         // zu dieser Gruppe springen und ihr erstes Feld wählen (z. B. „Wetter“ beim Stift am Wetter)
  nurGruppen?: string[];                   // nur diese Gruppen (z. B. die Kopfdaten des Tagesberichts direkt im Bericht)
  bestaetigen?: boolean;                   // statt × unten Abbrechen (nimmt mit Rückfrage alles seit dem Öffnen zurück) und OK – beides ruft onZu
}) {
  const schreiben = () => darf(p.modell.name, 'schreiben');
  // OK/Abbrechen: Schritte seit dem Öffnen dieses Eintrags (ein anderer Eintrag zählt neu)
  const start = createMemo(() => { void p.zeile.id; return untrack(() => verlauf().zurueck); });
  const schritte = () => Math.max(0, verlauf().zurueck - start());
  const [frage, setFrage] = createSignal(false);
  const verwerfen = () => { setFrage(false); for (let i = schritte(); i > 0; i--) rueckgaengig(); p.onZu?.(); };
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const titel = () => objektname(p.modell, p.zeile.werte);
  const [reiter, setReiter] = createSignal(0);
  const reiterListe = () => [...(p.reiter?.(p.zeile) ?? []), ...reiterFuerAlle.flatMap((r) => r(p.modell, p.zeile) ?? [])];
  const aendern = (f: Feld, w: Wert, herkunft?: string) => setFehler(f.name, feldAendern(p.modell, p.zeile, f, w, herkunft));
  // Erben (z. B. LV ← Projekt ← Büro): leere Felder zeigen den Wert der Ebene darüber; „wenn“ richtet sich nach den wirksamen Werten
  const ebenen = () => ebenenWerte(p.modell, p.zeile.werte);
  const wirksame = () => (p.modell.erben ? wirksam(p.modell, p.zeile.werte, ebenen()).werte : p.zeile.werte);
  // Gruppen nach Titel (Text) und Felder als Teile des Modells: eine Änderung zeichnet nichts neu (Fokus, offene Gruppen bleiben)
  const gruppenListe = createMemo(() => gruppen(p.modell, wirksame(), p.verborgen).filter((g) => !p.nurGruppen || p.nurGruppen.includes(g.titel)));
  const gruppenTitel = createMemo(() => gruppenListe().map((g) => g.titel), undefined, { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) });
  const erbe = (f: Feld) => {
    const e = p.modell.erben; if (!f.erbt || !e) return undefined;
    const g = geerbt(p.modell, f, ebenen()), oben = e.ebenen[0]!, ziel = oben.ueber ? String(p.zeile.werte[oben.ueber] ?? '') : modell(oben.objekt).einzeln ?? '';
    const w = p.zeile.werte[f.name];
    return { wert: g?.wert ?? null, von: g ? e.ebenen[g.ebene]!.titel : undefined, hochTitel: oben.titel.replace(/^vom /, 'fürs '),
      hoch: ziel && w != null && w !== '' && darf(oben.objekt, 'schreiben') ? () => ausfuehrenMehrere([
        { objekt: oben.objekt, art: 'aendern', objektId: ziel, werte: { [e.praefix + f.name]: w } },
        { objekt: p.modell.name, art: 'aendern', objektId: p.zeile.id, werte: { [f.name]: null } }], `${f.titel} ${oben.titel.replace(/^vom /, 'fürs ')} übernehmen`) : undefined };
  };
  let karte!: HTMLElement;
  createEffect(() => {
    const g = p.gruppe; if (!g) return;
    queueMicrotask(() => { const f = [...karte.querySelectorAll<HTMLElement>('[data-gruppe]')].find((x) => x.dataset.gruppe === g); if (!f) return; f.scrollIntoView({ block: 'start' }); f.querySelector<HTMLElement>('input, select, textarea, button')?.focus(); });
  });
  const angaben = () => <>
    {p.oben?.(p.zeile)}
    <For each={gruppenTitel()}>{(titel) => {
      const g = { titel, get felder() { return gruppenListe().find((x) => x.titel === titel)?.felder ?? []; } };
      const felder = () => <For each={g.felder}>{(f) => <><FeldEingabe feld={f} breit={f.name === p.modell.anzeigeFeld} wert={p.zeile.werte[f.name] ?? null} erbe={erbe(f)} fehler={fehler[f.name]} gesperrt={!schreiben()} herkunft={p.zeile.herkunft?.[f.name]} objekt={p.modell.name} zusammenhang={p.zeile.werte} onWert={(w, herkunft) => aendern(f, w, herkunft)} />{p.einschub?.[f.name]?.(p.zeile)}</>}</For>;
      return <>{p.modell.eingeklappt?.includes(g.titel)
        ? <details class="feldgruppe" data-gruppe={g.titel} open={p.gruppe === g.titel || undefined}><summary>{g.titel}</summary><div class="feldgruppe-inhalt">{felder()}</div></details>
        : <fieldset data-gruppe={g.titel}><Show when={g.titel}><legend>{g.titel}</legend></Show>{felder()}</fieldset>}{p.einschub?.[g.titel]?.(p.zeile)}</>;
    }}</For>
    {p.zusatz?.(p.zeile)}
    <Show when={!schreiben()}><p class="still-text klein-text">Du kannst diese Angaben ansehen, aber nicht ändern.</p></Show>
    <Show when={p.onZu && !p.modell.einzeln && darf(p.modell.name, 'loeschen')}>
      <div class="karte-fuss"><button class="knopf gefahr" onClick={() => loesche(p.modell, p.zeile)}>{p.modell.titel} löschen</button></div>
    </Show>
    <Show when={p.bestaetigen && p.onZu}>
      <Show when={frage()} fallback={<div class="fenster-knoepfe karte-bestaetigen">
        <button type="button" class="knopf" onClick={() => (schritte() ? setFrage(true) : p.onZu!())}>Abbrechen</button>
        <button type="button" class="knopf haupt" onClick={() => p.onZu!()}>OK</button></div>}>
        <VerwerfenFrage onWeiter={() => setFrage(false)} onVerwerfen={verwerfen} />
      </Show>
    </Show>
  </>;
  return (
    <Kartenrahmen label={`${p.modell.titel} ${titel()}`} ref={(el) => (karte = el)} titel={titel() || p.modell.titel} onZu={p.bestaetigen ? undefined : p.onZu} heftzwecke={p.heftzwecke}
      ohneKopf={p.ohneKopf} ohneRahmen={p.ohneRahmen} schliessenZeichen={p.symbole?.schliessen}
      knoepfe={<Show when={p.heftzwecke}><button class="knopf still nur-breit" aria-label="In eigenem Fenster öffnen" title="In eigenem Fenster öffnen" onClick={() => inEigenemFenster(p.modell, p.zeile.id)}>{p.symbole?.fenster ?? '⧉'}</button></Show>}
      unterKopf={<Show when={p.blaettern && p.blaettern.anzahl > 1}>{(_) => { const b = () => p.blaettern!; return (
        <div class="karte-blaettern">
          <button class="knopf klein still" aria-label="Voriger Eintrag" disabled={b().nr <= 1} onClick={() => b().onSchritt(-1)}>‹</button>
          <span>{b().nr} von {b().anzahl}</span>
          <button class="knopf klein still" aria-label="Nächster Eintrag" disabled={b().nr >= b().anzahl} onClick={() => b().onSchritt(1)}>›</button>
        </div>); }}</Show>}
      reiter={reiterListe().length ? [{ titel: p.modell.titel, inhalt: angaben }, ...reiterListe()] : undefined} reiterWahl={reiter()} onReiterWahl={setReiter}>
      {angaben()}
    </Kartenrahmen>
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
