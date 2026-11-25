// Baustein „Kontextmenü“: kurzes Menü an der Maus – höchstens 6 Punkte, überall gleich.
import { For, Show, createSignal, onCleanup } from 'solid-js';

export interface Menuepunkt { titel: string; tun: () => void; gefahr?: boolean; gesperrt?: boolean }
const [menue, setMenue] = createSignal<{ x: number; y: number; punkte: Menuepunkt[] } | null>(null);

export function zeigeMenue(e: MouseEvent, punkte: Menuepunkt[]): void {
  e.preventDefault();
  if (punkte.length > 6) console.warn('Kontextmenü mit mehr als 6 Punkten – gekürzt');
  const p = punkte.slice(0, 6);
  setMenue({ x: Math.min(e.clientX, innerWidth - 250), y: Math.min(e.clientY, innerHeight - p.length * 38 - 16), punkte: p });
}

export function Kontextmenue() {
  const zu = () => setMenue(null);
  // Esc schließt nur das Menü – nicht zugleich, was darunter auf Esc hört (z. B. die Auswahl)
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape' && menue()) { e.preventDefault(); e.stopPropagation(); zu(); } };
  const draussen = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.kontextmenue')) zu(); };
  document.addEventListener('mousedown', draussen);
  document.addEventListener('keydown', taste, true);
  window.addEventListener('blur', zu);
  onCleanup(() => { document.removeEventListener('mousedown', draussen); document.removeEventListener('keydown', taste, true); window.removeEventListener('blur', zu); });
  return (
    <Show when={menue()}>{(m) => (
      <div class="kontextmenue" role="menu" style={{ left: `${m().x}px`, top: `${m().y}px` }} onContextMenu={(e) => e.preventDefault()}>
        <For each={m().punkte}>{(p) => (
          <button role="menuitem" classList={{ gefahr: p.gefahr }} disabled={p.gesperrt} onClick={() => { zu(); p.tun(); }}>{p.titel}</button>
        )}</For>
      </div>
    )}</Show>
  );
}
