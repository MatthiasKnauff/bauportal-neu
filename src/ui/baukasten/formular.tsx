// Baustein „Formular“: Felder, die in einem Stück an den Server gehen (Anmeldung, Kennwort).
import { For, Show, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Serverfehler, ruf } from '../api';

export interface Formularfeld { name: string; titel: string; typ?: string; auto?: string }

export function Formular(p: { titel?: string; text?: string; felder: Formularfeld[]; knopf: string; pfad: string; fest?: Record<string, unknown>; vorgaben?: Record<string, string>; onFertig: (antwort: unknown) => void }) {
  const [werte, setWerte] = createStore<Record<string, string>>({ ...p.vorgaben });
  const [fehler, setFehler] = createStore<{ text: string; felder: Record<string, string> }>({ text: '', felder: {} });
  const [laeuft, setLaeuft] = createSignal(false);
  const senden = async (e: Event) => {
    e.preventDefault();
    setLaeuft(true); setFehler({ text: '', felder: {} });
    try { p.onFertig(await ruf(p.pfad, { ...p.fest, ...werte })); }
    catch (err) {
      if (err instanceof Serverfehler) setFehler({ text: err.felder && Object.keys(err.felder).length ? '' : err.message, felder: err.felder ?? {} });
      else setFehler({ text: (err as Error).message, felder: {} });
    } finally { setLaeuft(false); }
  };
  return (
    <form class="formular" onSubmit={senden}>
      <Show when={p.titel}><h1>{p.titel}</h1></Show>
      <Show when={p.text}><p class="still-text">{p.text}</p></Show>
      <For each={p.felder}>{(f) => (
        <div class="feld" classList={{ 'mit-fehler': !!fehler.felder[f.name] }}>
          <label for={'f-' + f.name}>{f.titel}</label>
          <input id={'f-' + f.name} type={f.typ ?? 'text'} autocomplete={f.auto ?? 'off'} value={werte[f.name] ?? ''} onInput={(e) => setWerte(f.name, e.currentTarget.value)} />
          <Show when={fehler.felder[f.name]}><div class="feld-fehler">{fehler.felder[f.name]}</div></Show>
        </div>
      )}</For>
      <Show when={fehler.text}><div class="feld-fehler" role="alert">{fehler.text}</div></Show>
      <button class="knopf haupt" type="submit" disabled={laeuft()}>{p.knopf}</button>
    </form>
  );
}
