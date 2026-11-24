// Baustein „Feld“: ein Eingabefeld, erzeugt aus der Feldbeschreibung im Datenmodell.
import { For, Match, Show, Switch, createUniqueId } from 'solid-js';
import type { Feld, Wert, Werte } from '../../kern/modell';
import { HERKUNFT } from '../../kern/befehl';
import { feldtext } from '../../kern/druck';
import { sicht } from '../abgleich';
import { modell } from '../api';
import { Auswahlliste } from './auswahlliste';
import { kiAnbindungen, kiOeffnen } from './ki';

export function FeldEingabe(p: {
  feld: Feld; wert: Wert; fehler?: string; onWert: (w: Wert, herkunft?: string) => void; sofort?: boolean; gesperrt?: boolean;
  herkunft?: string;     // woher der Wert stammt, wenn nicht von Hand
  zusammenhang?: Werte;  // Projekt und Version des Eintrags: Verweise bieten nur an, was dazugehört
}) {
  const id = createUniqueId();
  // Zahlen stehen mit Komma da, wie man sie hier schreibt
  const text = () => (p.wert === null || p.wert === undefined ? '' : typeof p.wert === 'number' ? String(p.wert).replace('.', ',') : String(p.wert));
  // sofort = jede Eingabe melden (Fenster „Neu“), sonst erst beim Verlassen des Feldes (Detailkarte)
  const melden = (e: Event) => {
    const w = (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    if (w !== text()) p.onWert(w);
  };
  const ereignis = () => (p.sofort ? { onInput: melden } : { onChange: melden });
  const typ = () => (p.feld.art === 'email' ? 'email' : p.feld.art === 'telefon' ? 'tel' : p.feld.art === 'datum' ? 'date' : 'text');
  return (
    <div class="feld" classList={{ 'mit-fehler': !!p.fehler, quer: p.feld.art === 'ja_nein' }}>
      <label for={id}>{p.feld.titel}{p.feld.pflicht ? ' *' : ''}<Show when={p.herkunft}><span class={`herkunft herkunft-${p.herkunft}`} title="Dieser Wert wurde nicht von Hand eingegeben. Sobald du ihn änderst, gilt er als eingegeben.">{HERKUNFT[p.herkunft!] ?? p.herkunft}</span></Show>
        {/* Lange Texte: Wenn das Büro eine KI eingeschaltet hat, kann sie hier einen Vorschlag machen */}
        <Show when={p.feld.art === 'langtext' && !p.gesperrt && kiAnbindungen().length}><button type="button" class="ki-knopf" title="Die KI macht einen Vorschlag – übernommen wird erst nach deiner Bestätigung" onClick={() => kiOeffnen({ titel: p.feld.titel, text: text(), onUebernehmen: (t) => p.onWert(t, 'ki') })}>✦ KI</button></Show></label>
      <Switch fallback={
        <input id={id} type={typ()} inputMode={p.feld.art === 'zahl' ? 'decimal' : undefined} value={text()} autocomplete="off" readOnly={p.gesperrt}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} {...ereignis()} />
      }>
        <Match when={p.feld.art === 'langtext'}>
          <textarea id={id} rows={5} value={text()} readOnly={p.gesperrt} {...ereignis()} />
        </Match>
        <Match when={p.feld.art === 'auswahl' && p.feld.optionen!.length > 4}>
          <Auswahlliste id={id} titel={p.feld.titel} optionen={p.feld.optionen!} wert={text()} gesperrt={p.gesperrt} onWert={p.onWert} />
        </Match>
        <Match when={p.feld.art === 'auswahl'}>
          <div class="auswahl" role="radiogroup" id={id} aria-label={p.feld.titel}>
            <For each={p.feld.optionen}>{(o) => (
              <button type="button" role="radio" aria-checked={p.wert === o.wert} classList={{ aktiv: p.wert === o.wert }} disabled={p.gesperrt && p.wert !== o.wert}
                onClick={() => { if (p.wert !== o.wert && !p.gesperrt) p.onWert(o.wert); }}>{o.titel}</button>
            )}</For>
          </div>
        </Match>
        <Match when={p.feld.art === 'mehrfach'}>
          <div class="auswahl" role="group" id={id} aria-label={p.feld.titel}>
            <For each={p.feld.optionen}>{(o) => {
              const an = () => text().split(',').includes(o.wert);
              return <button type="button" role="checkbox" aria-checked={an()} classList={{ aktiv: an() }} disabled={p.gesperrt}
                onClick={() => p.onWert(p.feld.optionen!.filter((x) => (x.wert === o.wert) !== text().split(',').includes(x.wert)).map((x) => x.wert).join(','))}>{o.titel}</button>;
            }}</For>
          </div>
        </Match>
        <Match when={p.feld.art === 'ja_nein'}>
          <button type="button" id={id} role="switch" aria-checked={p.wert === true} class="schalter" classList={{ aktiv: p.wert === true }} disabled={p.gesperrt}
            onClick={() => p.onWert(p.wert !== true)}><span /></button>
        </Match>
        <Match when={p.feld.art === 'verweis'}>
          <Auswahlliste id={id} titel={p.feld.titel} platzhalter="wählen …" wert={p.wert === null ? null : String(p.wert)} gesperrt={p.gesperrt} onWert={(w) => p.onWert(w || null)}
            optionen={[...(p.feld.pflicht ? [] : [{ wert: '', titel: '(keins)' }]), ...verweisziele(p.feld, p.zusammenhang)]} />
        </Match>
      </Switch>
      <Show when={p.fehler}><div class="feld-fehler">{p.fehler}</div></Show>
    </div>
  );
}

/** Was ein Verweis zur Wahl stellt: die Einträge des Ziels aus demselben Projekt und derselben Version. */
function verweisziele(f: Feld, zusammenhang?: Werte): { wert: string; titel: string }[] {
  const m = modell(f.ziel!);
  const gleich = ['projekt', 'version'].filter((k) => zusammenhang?.[k] && m.felder.some((x) => x.name === k));
  return Object.values(sicht[f.ziel!] ?? {}).filter((z) => !z.geloescht && gleich.every((k) => z.werte[k] === zusammenhang![k]))
    .map((z) => ({ wert: z.id, titel: String(z.werte[m.anzeigeFeld] ?? '') })).sort((a, b) => a.titel.localeCompare(b.titel, 'de', { numeric: true }));
}

/** Wert so, wie er in einer Tabelle steht – derselbe Text wie im Ausdruck. */
export const anzeige = (f: Feld, w: Wert | undefined): string => feldtext(f, w, verweisname);
export const verweisname = (ziel: string, id: string): string => { const z = sicht[ziel]?.[id]; return z ? String(z.werte[modell(ziel).anzeigeFeld] ?? '') : ''; };
