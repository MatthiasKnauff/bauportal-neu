// Baustein „Baum“ (Platz links): Gliederung mit Anzahl je Knoten, auf- und zuklappbar, mit Tastatur.
import { For, Show, createMemo, createSignal } from 'solid-js';

export interface Knoten { id: string; titel: string; anzahl?: number; kinder?: Knoten[] }

export function Baum(p: { titel: string; knoten: Knoten[]; gewaehlt: string; onWahl: (id: string) => void; symbol?: (k: Knoten) => string | undefined }) {
  const [zu, setZu] = createSignal<Set<string>>(new Set());
  const sichtbar = createMemo(() => {
    const aus: { k: Knoten; tiefe: number }[] = [];
    const lauf = (liste: Knoten[], tiefe: number) => { for (const k of liste) { aus.push({ k, tiefe }); if (k.kinder?.length && !zu().has(k.id)) lauf(k.kinder, tiefe + 1); } };
    lauf(p.knoten, 0);
    return aus;
  });
  const klappe = (id: string, auf?: boolean) => setZu((s) => { const n = new Set(s); if (auf ?? n.has(id)) n.delete(id); else n.add(id); return n; });
  const taste = (e: KeyboardEvent) => {
    const l = sichtbar(); const i = l.findIndex((x) => x.k.id === p.gewaehlt); const hier = l[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) p.onWahl(n.k.id); }
    else if (e.key === 'ArrowRight' && hier?.k.kinder?.length) { e.preventDefault(); klappe(hier.k.id, true); }
    else if (e.key === 'ArrowLeft' && hier) {
      e.preventDefault();
      if (hier.k.kinder?.length && !zu().has(hier.k.id)) klappe(hier.k.id, false);
      else { for (let k = i - 1; k >= 0; k--) if (l[k]!.tiefe < hier.tiefe) { p.onWahl(l[k]!.k.id); break; } }
    }
  };
  return (
    <div class="baum" role="tree" aria-label={p.titel} tabindex="0" onKeyDown={taste}>
      <For each={sichtbar()}>{(x) => (
        <div role="treeitem" aria-selected={p.gewaehlt === x.k.id} aria-expanded={x.k.kinder?.length ? !zu().has(x.k.id) : undefined}
          class="baum-zeile" classList={{ gewaehlt: p.gewaehlt === x.k.id }} style={{ 'padding-left': `${6 + x.tiefe * 16}px` }} onClick={() => p.onWahl(x.k.id)}>
          <Show when={x.k.kinder?.length} fallback={<i class="baum-klappe" />}>
            <button class="baum-klappe" tabindex="-1" aria-hidden="true" onClick={(e) => { e.stopPropagation(); klappe(x.k.id); }}>{zu().has(x.k.id) ? '▸' : '▾'}</button>
          </Show>
          <Show when={p.symbol?.(x.k)}>{(s) => <span class="baum-symbol" aria-hidden="true">{s()}</span>}</Show>
          <span class="baum-titel">{x.k.titel}</span>
          <Show when={x.k.anzahl !== undefined}><span class="baum-anzahl">{x.k.anzahl}</span></Show>
        </div>
      )}</For>
    </div>
  );
}
