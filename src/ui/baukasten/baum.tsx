// Baustein „Baum“ (Platz links): Gliederung mit Anzahl je Knoten, auf- und zuklappbar, mit Tastatur. Aussehen wie im
// bisherigen Bauportal: Kästchen ⊞/⊟ zum Klappen, Ordner für Knoten mit Kindern. „Klappe“ und „Ordner“ nutzt auch die
// Gliederung im Balkenplan – überall dasselbe Bild.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { Zeichen } from './zeichen';

/** Kästchen zum Auf- und Zuklappen einer Ebene. */
export function Klappe(p: { zu: boolean; onKlick: () => void; titel?: string; fokus?: boolean; still?: boolean /* im Baum: der Knoten selbst sagt „aufgeklappt“ */ }) {
  return <button type="button" class="klappe" tabindex={p.fokus ? 0 : -1} aria-hidden={p.still ? 'true' : undefined} aria-label={p.still ? undefined : p.titel ?? (p.zu ? 'Aufklappen' : 'Zuklappen')} aria-expanded={p.still ? undefined : !p.zu}
    onClick={(e) => { e.stopPropagation(); p.onKlick(); }} classList={{ zu: p.zu }} />;   // Zeichen ▸/▾ aus dem Stil (wie bisher: ein Zeichen für alle Bäume)
}
/** Ordner-Symbol für eine Ebene mit Unterpunkten. */
export const Ordner = (p: { offen?: boolean }) => <span class="ordner" classList={{ offen: p.offen }}><Zeichen name="dateien" groesse={15} /></span>;

export interface Knoten { id: string; titel: string; anzahl?: number; kinder?: Knoten[]; hatKinder?: boolean /* Kinder werden erst beim Aufklappen geholt */ }

export function Baum(p: {
  titel: string; knoten: Knoten[]; gewaehlt: string; onWahl: (id: string) => void; symbol?: (k: Knoten) => string | undefined;
  onAuf?: (id: string) => void;         // beim Aufklappen – z. B. um die Kinder zu holen
}) {
  // Die oberste Ebene ist immer offen, alles darunter zunächst zu – Aufklappen öffnet so nur die nächste Stufe.
  // Gemerkt wird nur, was der Benutzer aufgeklappt hat.
  const [um, setUm] = createSignal<Set<string>>(new Set());
  const oben = () => new Set(p.knoten.map((k) => k.id));
  const zu = () => ({ has: (id: string) => (oben().has(id) ? um().has(id) : !um().has(id)) });
  const eltern = (k: Knoten) => !!k.kinder?.length || !!k.hatKinder;
  const sichtbar = createMemo(() => {
    const aus: { k: Knoten; tiefe: number }[] = [];
    const lauf = (liste: Knoten[], tiefe: number) => { for (const k of liste) { aus.push({ k, tiefe }); if (k.kinder?.length && !zu().has(k.id)) lauf(k.kinder, tiefe + 1); } };
    lauf(p.knoten, 0);
    return aus;
  });
  const klappe = (id: string, auf?: boolean) => {
    const istZu = zu().has(id);
    if (auf !== undefined && auf !== istZu) return;   // schon im gewünschten Zustand
    setUm((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (istZu) p.onAuf?.(id);
  };
  const taste = (e: KeyboardEvent) => {
    const l = sichtbar(); const i = l.findIndex((x) => x.k.id === p.gewaehlt); const hier = l[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) p.onWahl(n.k.id); }
    else if (e.key === 'ArrowRight' && hier && eltern(hier.k)) { e.preventDefault(); klappe(hier.k.id, true); }
    else if (e.key === 'ArrowLeft' && hier) {
      e.preventDefault();
      if (eltern(hier.k) && !zu().has(hier.k.id)) klappe(hier.k.id, false);
      else { for (let k = i - 1; k >= 0; k--) if (l[k]!.tiefe < hier.tiefe) { p.onWahl(l[k]!.k.id); break; } }
    }
  };
  return (
    <div class="baum" role="tree" aria-label={p.titel} tabindex="0" onKeyDown={taste}>
      <For each={sichtbar()}>{(x) => (
        <div role="treeitem" aria-selected={p.gewaehlt === x.k.id} aria-expanded={eltern(x.k) ? !zu().has(x.k.id) : undefined}
          class="baum-zeile" classList={{ gewaehlt: p.gewaehlt === x.k.id }} style={{ 'padding-left': `${6 + x.tiefe * 16}px` }} onClick={() => p.onWahl(x.k.id)}>
          <Show when={eltern(x.k)} fallback={<i class="klappe-platz" />}>
            <Klappe still zu={zu().has(x.k.id)} onKlick={() => klappe(x.k.id)} />
          </Show>
          <Show when={p.symbol?.(x.k)} fallback={<Show when={eltern(x.k)}><Ordner offen={!zu().has(x.k.id)} /></Show>}>{(s) => <span class="baum-symbol" aria-hidden="true">{s()}</span>}</Show>
          <span class="baum-titel">{x.k.titel}</span>
          <Show when={x.k.anzahl !== undefined}><span class="baum-anzahl">{x.k.anzahl}</span></Show>
        </div>
      )}</For>
    </div>
  );
}
