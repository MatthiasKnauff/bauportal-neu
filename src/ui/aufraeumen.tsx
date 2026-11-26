// Adressen aufräumen (wie im bisherigen Bauportal): doppelte Kontakte zusammenführen (übernommen erst nach der Vorschau,
// Baustein Übernahme) – und Werte aufräumen: ähnliche Gewerke, Stichwörter und Tags auf einen Wert bringen, Werte umbenennen.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { aehnlicheGruppen, umbenennen, werteZaehlen } from '../module/adressen/werte';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { ruf } from './unterbau/api';
import { Dialog } from './baukasten/dialog';
import { vorschauZeigen, type Vorschau } from './uebernahme';

interface Gruppe { ids: string[]; grund: string[] }
interface Wahl { behalten: string; mit: Record<string, boolean> }
const [offen, setOffen] = createSignal(false);
const [vorgabe, setVorgabe] = createSignal<string[] | null>(null);   // gewählte Kontakte (Auswahl) statt der Suche nach Doppelten
type Was = 'kontakte' | 'gewerk' | 'stichworte' | 'tags';
const WAS: { wert: Was; titel: string }[] = [{ wert: 'kontakte', titel: 'Doppelte Kontakte' }, { wert: 'gewerk', titel: 'Gewerke' }, { wert: 'stichworte', titel: 'Stichwörter' }, { wert: 'tags', titel: 'Tags' }];
const [was, setWas] = createSignal<Was>('kontakte');
/** Ohne Angabe: Doppelte suchen. Mit Kennungen: genau diese zusammenführen (Auswahl in den Adressen). */
export const aufraeumenOeffnen = (ids?: string[]) => { setVorgabe(ids && ids.length > 1 ? ids : null); setWas('kontakte'); setOffen(true); };

const kontakt = (id: string) => sicht.kontakt?.[id]?.werte ?? {};
const gefuellt = (id: string) => Object.values(kontakt(id)).filter((w) => w != null && w !== '').length;

function AufraeumenFenster() {
  const [gruppen, setGruppen] = createSignal<Gruppe[] | null>(null);
  const [fehler, setFehler] = createSignal('');
  const [wahl, setWahl] = createStore<Wahl[]>([]);
  const v = vorgabe();
  (v ? Promise.resolve<Gruppe[]>([{ ids: v, grund: [`${v.length} gewählte Kontakte`] }]) : ruf<Gruppe[]>('/api/adressen/doppelte')).then((g) => {
    // Vorschlag: der Kontakt mit den meisten Angaben bleibt, die übrigen gehen in ihm auf
    setWahl(g.map((x) => { const b = [...x.ids].sort((a, c) => gefuellt(c) - gefuellt(a))[0]!; return { behalten: b, mit: Object.fromEntries(x.ids.filter((i) => i !== b).map((i) => [i, true])) }; }));
    setGruppen(g);
  }, (e) => setFehler((e as Error).message));
  const auftrag = () => wahl.map((w) => ({ behalten: w.behalten, weg: Object.entries(w.mit).filter(([i, j]) => j && i !== w.behalten).map(([i]) => i) })).filter((g) => g.weg.length);
  const weiter = () => {
    const g = auftrag();
    setOffen(false);
    void vorschauZeigen({ titel: 'Adressen zusammenführen', wartetext: 'Verweise werden gesucht …', fertig: 'Die Doppelten sind zusammengeführt.', zurueck: () => setOffen(true) },
      () => ruf<Vorschau>('/api/adressen/zusammenfuehren', { gruppen: g }));
  };
  const behaltenSetzen = (gi: number, id: string) => setWahl(gi, (w) => ({ behalten: id, mit: { ...w.mit, [w.behalten]: true, [id]: false } }));
  return (
    <Dialog titel="Adressen aufräumen" breit onAbbrechen={() => setOffen(false)}
      knoepfe={<>
        <button class="knopf" onClick={() => setOffen(false)}>Abbrechen</button>
        <button class="knopf haupt" disabled={!auftrag().length} onClick={weiter}>Zusammenführen …</button>
      </>}>
      <WasWahl />
      <Show when={!fehler()} fallback={<p class="fehler">{fehler()}</p>}>
        <Show when={gruppen()} fallback={<p class="leise">Doppelte werden gesucht …</p>}>{(g) => (
          <Show when={g().length} fallback={<p>Keine doppelten Kontakte gefunden – die Adressen sind aufgeräumt.</p>}>
            <p class="leise">{g().length} {g().length === 1 ? 'Gruppe sieht' : 'Gruppen sehen'} doppelt aus. Wähle je Gruppe, welcher Kontakt bleibt; angehakte gehen in ihm auf. Leere Angaben werden ergänzt, und alles, was auf die anderen verweist, zeigt danach auf ihn.</p>
            <For each={g()}>{(x, gi) => (
              <fieldset class="doppelt-gruppe">
                <legend>{x.grund.join(', ')}</legend>
                <For each={x.ids}>{(id) => {
                  const k = () => kontakt(id);
                  const bleibt = () => wahl[gi()]?.behalten === id;
                  return (
                    <div class="doppelt-zeile" classList={{ bleibt: bleibt() }}>
                      <label class="doppelt-bleibt"><input type="radio" name={`bleibt-${gi()}`} checked={bleibt()} onChange={() => behaltenSetzen(gi(), id)} /> bleibt</label>
                      <label class="doppelt-mit"><input type="checkbox" disabled={bleibt()} checked={bleibt() || !!wahl[gi()]?.mit[id]} onChange={(e) => setWahl(gi(), 'mit', id, e.currentTarget.checked)} aria-label={`${String(k().name ?? '')} zusammenführen`} /></label>
                      <span class="doppelt-text"><strong>{String(k().name ?? '')}</strong>
                        <span class="leise">{[k().gewerk, [k().plz, k().ort].filter(Boolean).join(' '), k().telefon, k().email].filter(Boolean).join(' · ')}</span></span>
                    </div>
                  );
                }}</For>
              </fieldset>
            )}</For>
          </Show>
        )}</Show>
      </Show>
    </Dialog>
  );
}

/** Werte eines Felds aufräumen: oben die Gruppen ähnlicher Werte (je Gruppe den richtigen wählen, zusammenführen), darunter alle Werte A–Z zum Umbenennen. */
function WerteFenster(p: { feld: 'gewerk' | 'stichworte' | 'tags'; titel: string }) {
  const liste = p.feld !== 'gewerk';
  const kontakte = () => lebende('kontakt');
  const werte = createMemo(() => werteZaehlen(kontakte(), p.feld, liste));
  const gruppen = createMemo(() => aehnlicheGruppen(werte()));
  const [ziel, setZiel] = createStore<Record<number, string>>({});
  const [ohne, setOhne] = createStore<Record<string, boolean>>({});   // Werte, die in ihrer Gruppe nicht mitgehen
  const [neuName, setNeuName] = createStore<Record<string, string>>({});
  const fuehren = (von: string[], nach: string, titel: string) => {
    const aenderungen = umbenennen(kontakte(), p.feld, liste, von.filter((v) => v !== nach), nach);
    if (aenderungen.length) ausfuehrenMehrere(aenderungen.map((x) => ({ objekt: 'kontakt', art: 'aendern' as const, objektId: x.id, werte: x.werte })), titel);
  };
  return (
    <div class="werte-aufraeumen">
      <Show when={gruppen().length} fallback={<p class="leise">Keine ähnlichen {p.titel} – {werte().length} verschiedene Werte.</p>}>
        <p class="leise">{gruppen().length} {gruppen().length === 1 ? 'Gruppe sieht' : 'Gruppen sehen'} ähnlich aus. Je Gruppe wählen, wie es heißen soll; angehakte Werte werden darauf umbenannt – bei allen Kontakten, mit einem Rückgängig.</p>
        <For each={gruppen()}>{(g, gi) => {
          const nach = () => ziel[gi()] ?? g[0]!.wert;
          return (
            <fieldset class="doppelt-gruppe">
              <legend>{g.map((x) => x.wert).join(' · ')}</legend>
              <For each={g}>{(x) => (
                <div class="doppelt-zeile" classList={{ bleibt: nach() === x.wert }}>
                  <label class="doppelt-bleibt"><input type="radio" name={`${p.feld}-${gi()}`} checked={nach() === x.wert} onChange={() => setZiel(gi(), x.wert)} /> so heißt es</label>
                  <label class="doppelt-mit"><input type="checkbox" disabled={nach() === x.wert} checked={nach() === x.wert || !ohne[x.wert]} onChange={(e) => setOhne(x.wert, !e.currentTarget.checked)} aria-label={`${x.wert} mitnehmen`} /></label>
                  <span class="doppelt-text"><strong>{x.wert}</strong><span class="leise">{x.anzahl} {x.anzahl === 1 ? 'Kontakt' : 'Kontakte'}</span></span>
                </div>
              )}</For>
              <div class="reihe"><button type="button" class="knopf klein" onClick={() => fuehren(g.filter((x) => !ohne[x.wert] || x.wert === nach()).map((x) => x.wert), nach(), `${p.titel}: zu „${nach()}“ zusammengeführt`)}>Zusammenführen zu „{nach()}“</button></div>
            </fieldset>
          );
        }}</For>
      </Show>
      <h3>Alle {p.titel} A–Z</h3>
      <div class="werte-liste">
        <For each={werte()}>{(x) => (
          <div class="werte-zeile">
            <input aria-label={`${x.wert} umbenennen`} value={neuName[x.wert] ?? x.wert} onInput={(e) => setNeuName(x.wert, e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const n = (neuName[x.wert] ?? x.wert).trim(); if (n && n !== x.wert) { fuehren([x.wert], n, `${p.titel}: „${x.wert}“ umbenannt`); setNeuName(x.wert, undefined!); } } }} />
            <span class="leise">{x.anzahl}</span>
            <Show when={(neuName[x.wert] ?? x.wert).trim() && (neuName[x.wert] ?? x.wert).trim() !== x.wert}>
              <button type="button" class="knopf klein" onClick={() => { fuehren([x.wert], neuName[x.wert]!.trim(), `${p.titel}: „${x.wert}“ umbenannt`); setNeuName(x.wert, undefined!); }}>Umbenennen</button>
            </Show>
          </div>
        )}</For>
      </div>
    </div>
  );
}

function Fenster() {
  return (
    <Show when={was() !== 'kontakte'} fallback={<AufraeumenFenster />}>
      <Dialog titel="Adressen aufräumen" breit onAbbrechen={() => setOffen(false)} knoepfe={<button class="knopf haupt" onClick={() => setOffen(false)}>Fertig</button>}>
        <WasWahl />
        {/* je Feld neu aufgebaut (keyed): Gruppen, gewählte Ziele und Namen gehören zu einem Feld */}
        <Show when={was() as 'gewerk' | 'stichworte' | 'tags'} keyed>{(f) => <WerteFenster feld={f} titel={WAS.find((w) => w.wert === f)!.titel} />}</Show>
      </Dialog>
    </Show>
  );
}
/** Was aufräumen? – oben im Fenster, nicht bei gewählten Kontakten (die werden zusammengeführt). */
function WasWahl() {
  return <Show when={!vorgabe()}><div class="wahl-chips" role="radiogroup" aria-label="Was aufräumen?">
    <For each={WAS}>{(w) => <button type="button" class="chip" role="radio" aria-checked={was() === w.wert} classList={{ aktiv: was() === w.wert }} onClick={() => setWas(w.wert)}>{w.titel}</button>}</For>
  </div></Show>;
}

export function Aufraeumen() {
  return <Show when={offen()}><Fenster /></Show>;
}
