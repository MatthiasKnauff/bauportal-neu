// Baustein „Kontextmenü“: kurzes Menü an der Maus – höchstens 9 Punkte (Regel seit 27.11.2026, vorher 6), überall gleich.
import { For, Show, createSignal, onCleanup } from 'solid-js';

export const HOECHSTENS = 9;
export interface Menuepunkt {
  titel: string; tun?: () => void; gefahr?: boolean; gesperrt?: boolean;
  an?: boolean;              // ✓ davor (z. B. die Art, die die Position schon hat)
  unter?: Menuepunkt[];      // Untermenü (▸): ersetzt das Menü an derselben Stelle – so bleibt jedes bei höchstens 9 Punkten
  zeichen?: string;          // kleines Zeichen davor (z. B. im Hilfemenü wie bisher 📖 ✨ 💬)
  hinweis?: string;          // leiser Zusatz hinter dem Titel (z. B. „neu für dich“)
}
const [menue, setMenue] = createSignal<{ x: number; y: number; punkte: Menuepunkt[] } | null>(null);

/** Menü unter einem Knopf (z. B. „?“ in der Kopfleiste), rechtsbündig daran. */
export function zeigeMenueUnter(el: Element, punkte: Menuepunkt[]): void {
  const r = el.getBoundingClientRect();
  oeffnen(Math.max(8, r.right - 360), r.bottom + 6, punkte);
}
export function zeigeMenue(e: MouseEvent, punkte: Menuepunkt[]): void {
  e.preventDefault();
  oeffnen(e.clientX, e.clientY, punkte);
}
function oeffnen(x: number, y: number, punkte: Menuepunkt[]): void {
  if (punkte.length > HOECHSTENS) console.warn(`Kontextmenü mit mehr als ${HOECHSTENS} Punkten – gekürzt`);
  const p = punkte.slice(0, HOECHSTENS);
  setMenue({ x: Math.min(x, innerWidth - 250), y: Math.min(y, innerHeight - p.length * 38 - 16), punkte: p });
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
          <button role="menuitem" classList={{ gefahr: p.gefahr, an: p.an }} aria-haspopup={p.unter ? 'menu' : undefined} disabled={p.gesperrt}
            onClick={() => { if (p.unter) { oeffnen(m().x, m().y, p.unter); return; } zu(); p.tun?.(); }}>
            <Show when={p.zeichen}><span class="km-zeichen" aria-hidden="true">{p.zeichen}</span></Show>{p.an ? '✓ ' : ''}{p.titel}{p.unter ? ' ▸' : ''}<Show when={p.hinweis}> <small class="km-hinweis">{p.hinweis}</small></Show></button>
        )}</For>
      </div>
    )}</Show>
  );
}
