// Baustein „Feld“: ein Eingabefeld, erzeugt aus der Feldbeschreibung im Datenmodell.
import { For, Match, Show, Switch, createUniqueId } from 'solid-js';
import type { Feld, Wert } from '../../kern/modell';

export function FeldEingabe(p: { feld: Feld; wert: Wert; fehler?: string; onWert: (w: Wert) => void; sofort?: boolean }) {
  const id = createUniqueId();
  const text = () => (p.wert === null || p.wert === undefined ? '' : String(p.wert));
  // sofort = jede Eingabe melden (Fenster „Neu“), sonst erst beim Verlassen des Feldes (Detailkarte)
  const melden = (e: Event) => {
    const w = (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    if (w !== text()) p.onWert(w);
  };
  const ereignis = () => (p.sofort ? { onInput: melden } : { onChange: melden });
  const typ = () => (p.feld.art === 'email' ? 'email' : p.feld.art === 'telefon' ? 'tel' : 'text');
  return (
    <div class="feld" classList={{ 'mit-fehler': !!p.fehler }}>
      <label for={id}>{p.feld.titel}{p.feld.pflicht ? ' *' : ''}</label>
      <Switch fallback={
        <input id={id} type={typ()} inputMode={p.feld.art === 'zahl' ? 'decimal' : undefined} value={text()} autocomplete="off"
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} {...ereignis()} />
      }>
        <Match when={p.feld.art === 'langtext'}>
          <textarea id={id} rows={5} value={text()} {...ereignis()} />
        </Match>
        <Match when={p.feld.art === 'auswahl'}>
          <div class="auswahl" role="radiogroup" id={id} aria-label={p.feld.titel}>
            <For each={p.feld.optionen}>{(o) => (
              <button type="button" role="radio" aria-checked={p.wert === o.wert} classList={{ aktiv: p.wert === o.wert }}
                onClick={() => { if (p.wert !== o.wert) p.onWert(o.wert); }}>{o.titel}</button>
            )}</For>
          </div>
        </Match>
        <Match when={p.feld.art === 'ja_nein'}>
          <button type="button" id={id} role="switch" aria-checked={p.wert === true} class="schalter" classList={{ aktiv: p.wert === true }}
            onClick={() => p.onWert(p.wert !== true)}><span /></button>
        </Match>
      </Switch>
      <Show when={p.fehler}><div class="feld-fehler">{p.fehler}</div></Show>
    </div>
  );
}

/** Wert so, wie er in einer Tabelle steht. */
export function anzeige(f: Feld, w: Wert | undefined): string {
  if (w === null || w === undefined) return '';
  if (f.art === 'auswahl') return f.optionen?.find((o) => o.wert === w)?.titel ?? String(w);
  if (f.art === 'ja_nein') return w ? 'Ja' : 'Nein';
  return String(w);
}
