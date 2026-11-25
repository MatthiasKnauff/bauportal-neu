// Baustein „Spaltenfeld“: das kleine Feld „Spalten“ am Kopf einer Tabelle – Häkchen, Verschieben, „Standard“.
// Gilt für jede Tabelle: die aus dem Datenmodell (Baustein Tabelle) und die des Balkenplans.
import { For, onCleanup, onMount } from 'solid-js';
import type { Spaltenwahl } from './spalten';

/** Das kleine Feld „Spalten“: Häkchen zum Zeigen, Griff ⋮⋮ zum Verschieben (oder Alt+↑/↓), „Standard“ – wie im bisherigen Bauportal. */
export function Spaltenfeld(p: { spalten: Spaltenwahl; ort: { x: number; y: number }; onZu: () => void }) {
  let feld!: HTMLDivElement, gezogen = '';
  const draussen = (e: PointerEvent) => { if (!feld.contains(e.target as Node)) p.onZu(); };
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); p.onZu(); } };
  onMount(() => {
    // im Fenster halten
    const r = feld.getBoundingClientRect();
    feld.style.left = `${Math.max(8, Math.min(p.ort.x, innerWidth - r.width - 8))}px`;
    feld.style.top = `${Math.max(8, Math.min(p.ort.y, innerHeight - r.height - 8))}px`;
    feld.querySelector<HTMLElement>('input')?.focus();
    document.addEventListener('pointerdown', draussen, true); document.addEventListener('keydown', taste, true);
  });
  onCleanup(() => { document.removeEventListener('pointerdown', draussen, true); document.removeEventListener('keydown', taste, true); });
  return (
    <div class="spaltenfeld" ref={feld} role="dialog" aria-label="Spalten" style={{ left: `${p.ort.x}px`, top: `${p.ort.y}px` }}>
      <div class="spaltenfeld-kopf"><strong>Spalten</strong><button class="knopf klein still" aria-label="Spalten schließen" onClick={p.onZu}>×</button></div>
      <ul>
        <For each={p.spalten.alle()}>{(f) => (
          <li draggable={true} onDragStart={(e) => { gezogen = f.name; e.dataTransfer!.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (gezogen) p.spalten.schieben(gezogen, f.name); gezogen = ''; }}>
            <span class="griff" aria-hidden="true">⋮⋮</span>
            <label><input type="checkbox" checked={p.spalten.istAn(f.name)} disabled={p.spalten.istFest(f.name)} onChange={() => p.spalten.schalten(f.name)}
              onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); p.spalten.schritt(f.name, e.key === 'ArrowUp' ? -1 : 1); } }} /> {f.titel}</label>
          </li>
        )}</For>
      </ul>
      <div class="spaltenfeld-fuss"><button class="verweis" onClick={p.spalten.zuruecksetzen}>Standard</button><span class="still-text klein-text">Ziehen am ⋮⋮ ändert die Reihenfolge</span></div>
    </div>
  );
}
