// Baustein „Menüleiste“: ganz links Rückgängig und Wiederholen, dann die Reiter der App, rechts die Befehle der Ansicht.
// Für jede App gleich aufgebaut – Rückgängig steht überall an derselben Stelle.
import { For, Show, type JSX } from 'solid-js';

export interface Reiter { id: string; titel: string }
export interface Rueckgaengig { zurueck: () => boolean; vor: () => boolean; onZurueck: () => void; onVor: () => void }
export interface Knopf { titel: string; tun: () => void; haupt?: boolean; symbol?: string; nurSymbol?: boolean; gesperrt?: boolean }

export function Menueleiste(p: { rueckgaengig?: Rueckgaengig; reiter?: Reiter[]; aktiv?: string; onReiter?: (id: string) => void; knoepfe?: Knopf[]; children?: JSX.Element }) {
  return (
    <div class="menueleiste" role="toolbar" aria-label="Menüleiste">
      <Show when={p.rueckgaengig}>{(r) => (
        <div class="menue-verlauf">
          <button class="knopf still" aria-label="Rückgängig" title="Rückgängig (Strg+Z)" disabled={!r().zurueck()} onClick={r().onZurueck}>↶</button>
          <button class="knopf still" aria-label="Wiederholen" title="Wiederholen (Strg+Y)" disabled={!r().vor()} onClick={r().onVor}>↷</button>
        </div>
      )}</Show>
      <Show when={(p.reiter?.length ?? 0) > 1}>
        <div class="menue-reiter" role="tablist">
          <For each={p.reiter}>{(r) => <button role="tab" aria-selected={p.aktiv === r.id} classList={{ aktiv: p.aktiv === r.id }} onClick={() => p.onReiter?.(r.id)}>{r.titel}</button>}</For>
        </div>
      </Show>
      <div class="menue-mitte">{p.children}</div>
      <For each={p.knoepfe}>{(k) => (
        <button class="knopf" classList={{ haupt: k.haupt, still: !k.haupt }} disabled={k.gesperrt} aria-label={k.nurSymbol ? k.titel : undefined} title={k.nurSymbol ? k.titel : undefined} onClick={k.tun}>
          {k.symbol ? `${k.symbol}${k.nurSymbol ? '' : ' '}` : ''}{k.nurSymbol ? '' : k.titel}
        </button>
      )}</For>
    </div>
  );
}
