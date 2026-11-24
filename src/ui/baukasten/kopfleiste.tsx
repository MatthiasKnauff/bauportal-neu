// Baustein „Kopfleiste“: ganz oben – Name, Apps, Speicherstand, Rückgängig, Benutzermenü.
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Menuepunkt } from './kontextmenue';

export function Kopfleiste(p: {
  marke: string;
  apps: { id: string; titel: string }[]; aktiv?: string; onApp: (id: string) => void;
  status: { text: string; art: 'gut' | 'wartet' | 'getrennt' };
  rueckgaengig: { zurueck: boolean; vor: boolean; onZurueck: () => void; onVor: () => void };
  benutzer: string; benutzerMenue: Menuepunkt[]; menueFuss?: string;
  /** Platz für weitere Elemente einer App rechts neben den Apps. */
  zusatz?: JSX.Element;
}) {
  const [menue, setMenue] = createSignal(false);
  return (
    <header class="kopf">
      <strong class="marke">{p.marke}</strong>
      <nav aria-label="Module">
        <For each={p.apps}>{(a) => <button classList={{ aktiv: p.aktiv === a.id }} onClick={() => p.onApp(a.id)}>{a.titel}</button>}</For>
      </nav>
      {p.zusatz}
      <span class="status" classList={{ getrennt: p.status.art === 'getrennt', wartet: p.status.art === 'wartet' }}><i />{p.status.text}</span>
      <button class="knopf still" aria-label="Rückgängig" title="Rückgängig (Strg+Z)" disabled={!p.rueckgaengig.zurueck} onClick={p.rueckgaengig.onZurueck}>↶</button>
      <button class="knopf still" aria-label="Wiederholen" title="Wiederholen (Strg+Y)" disabled={!p.rueckgaengig.vor} onClick={p.rueckgaengig.onVor}>↷</button>
      <div class="menue">
        <button class="knopf still" aria-haspopup="menu" aria-expanded={menue()} onClick={() => setMenue(!menue())}>{p.benutzer} ▾</button>
        <Show when={menue()}>
          <div class="menue-liste" role="menu" onClick={() => setMenue(false)}>
            <For each={p.benutzerMenue}>{(m) => <button role="menuitem" onClick={m.tun}>{m.titel}</button>}</For>
            <Show when={p.menueFuss}><div class="menue-fuss">{p.menueFuss}</div></Show>
          </div>
        </Show>
      </div>
    </header>
  );
}
