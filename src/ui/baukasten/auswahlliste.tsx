// Baustein „Auswahlliste“: eigene Liste statt der Auswahl des Browsers – mit Suche und Tastatur.
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';

export interface Option { wert: string; titel: string }

export function Auswahlliste(p: { id?: string; optionen: Option[]; wert: string | null; onWert: (w: string) => void; gesperrt?: boolean; titel: string; platzhalter?: string }) {
  const [offen, setOffen] = createSignal(false);
  const [suche, setSuche] = createSignal('');
  const [zeiger, setZeiger] = createSignal(0);
  let wurzel!: HTMLDivElement;
  const treffer = createMemo(() => { const s = suche().toLowerCase(); return s ? p.optionen.filter((o) => o.titel.toLowerCase().includes(s)) : p.optionen; });
  const aktuell = () => p.optionen.find((o) => o.wert === p.wert)?.titel ?? '';
  const draussen = (e: MouseEvent) => { if (!wurzel.contains(e.target as Node)) zu(); };
  const auf = () => {
    if (p.gesperrt) return;
    setSuche(''); setZeiger(Math.max(0, p.optionen.findIndex((o) => o.wert === p.wert))); setOffen(true);
    document.addEventListener('mousedown', draussen);
    queueMicrotask(() => (wurzel.querySelector('input') ?? wurzel.querySelector<HTMLElement>('[role=listbox]'))?.focus());
  };
  const zu = () => { setOffen(false); document.removeEventListener('mousedown', draussen); };
  onCleanup(() => document.removeEventListener('mousedown', draussen));
  const nimm = (o: Option | undefined) => { if (!o) return; zu(); if (o.wert !== p.wert) p.onWert(o.wert); wurzel.querySelector<HTMLElement>('.auswahlliste-knopf')?.focus(); };
  const taste = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setZeiger((z) => Math.min(treffer().length - 1, z + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setZeiger((z) => Math.max(0, z - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); nimm(treffer()[zeiger()]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zu(); }
    else return;
    wurzel.querySelector('.zeiger')?.scrollIntoView({ block: 'nearest' });
  };
  return (
    <div class="auswahlliste" ref={wurzel}>
      <button type="button" id={p.id} class="auswahlliste-knopf" aria-haspopup="listbox" aria-expanded={offen()} disabled={p.gesperrt}
        onClick={() => (offen() ? zu() : auf())} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !offen()) { e.preventDefault(); auf(); } }}>
        <span classList={{ platzhalter: !aktuell() }}>{aktuell() || p.platzhalter || ''}</span><i>▾</i>
      </button>
      <Show when={offen()}>
        <div class="auswahlliste-fenster" onKeyDown={taste}>
          <Show when={p.optionen.length > 8}>
            <input type="search" placeholder="Suchen" aria-label={`${p.titel} suchen`} value={suche()} onInput={(e) => { setSuche(e.currentTarget.value); setZeiger(0); }} />
          </Show>
          <div role="listbox" tabindex="-1" aria-label={p.titel}>
            <For each={treffer()}>{(o, i) => (
              <div role="option" aria-selected={o.wert === p.wert} classList={{ zeiger: zeiger() === i(), gewaehlt: o.wert === p.wert }}
                onMouseEnter={() => setZeiger(i())} onClick={() => nimm(o)}>{o.titel}</div>
            )}</For>
            <Show when={!treffer().length}><div class="auswahlliste-leer">Kein Treffer</div></Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
