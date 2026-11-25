// Adressen aufräumen: doppelte Kontakte zeigen, je Gruppe wählen, welcher bleibt, und zusammenführen.
// Übernommen wird erst nach der Vorschau (Baustein Übernahme).
import { For, Show, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { sicht } from './unterbau/abgleich';
import { ruf } from './unterbau/api';
import { Dialog } from './baukasten/dialog';
import { vorschauZeigen, type Vorschau } from './uebernahme';

interface Gruppe { ids: string[]; grund: string[] }
interface Wahl { behalten: string; mit: Record<string, boolean> }
const [offen, setOffen] = createSignal(false);
export const aufraeumenOeffnen = () => setOffen(true);

const kontakt = (id: string) => sicht.kontakt?.[id]?.werte ?? {};
const gefuellt = (id: string) => Object.values(kontakt(id)).filter((w) => w != null && w !== '').length;

function AufraeumenFenster() {
  const [gruppen, setGruppen] = createSignal<Gruppe[] | null>(null);
  const [fehler, setFehler] = createSignal('');
  const [wahl, setWahl] = createStore<Wahl[]>([]);
  ruf<Gruppe[]>('/api/adressen/doppelte').then((g) => {
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

export function Aufraeumen() {
  return <Show when={offen()}><AufraeumenFenster /></Show>;
}
