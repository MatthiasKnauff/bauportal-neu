// Baustein „Schwebefenster“: ein frei bewegliches Fenster über der Seite – am Kopf ziehen, × schließt. Wie im
// bisherigen Bauportal öffnet der Doppelklick auf eine Zeile den Eintrag darin; die Liste bleibt dabei bedienbar.
// Die Lage merkt sich das Fenster je Benutzer und Gerät.
import { onCleanup, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

const SCHLUESSEL = 'bp.schwebefenster';
const lage = (): { x: number; y: number } => { try { return JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '') as { x: number; y: number }; } catch { return { x: Math.max(20, innerWidth - 520), y: 90 }; } };

export function Schwebefenster(p: { titel: string; onZu: () => void; children: JSX.Element }) {
  let feld!: HTMLDivElement;
  const setzen = (x: number, y: number) => {
    const r = feld.getBoundingClientRect();
    const nx = Math.max(0, Math.min(innerWidth - 120, x)), ny = Math.max(0, Math.min(innerHeight - 40, y));
    feld.style.left = `${nx}px`; feld.style.top = `${ny}px`;
    return { x: nx, y: ny, r };
  };
  const ziehen = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const r = feld.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, kopf = e.currentTarget as HTMLElement;
    kopf.setPointerCapture(e.pointerId);
    const bewegen = (m: PointerEvent) => setzen(m.clientX - dx, m.clientY - dy);
    const los = (m: PointerEvent) => {
      kopf.removeEventListener('pointermove', bewegen); kopf.removeEventListener('pointerup', los);
      const l = setzen(m.clientX - dx, m.clientY - dy); try { localStorage.setItem(SCHLUESSEL, JSON.stringify({ x: l.x, y: l.y })); } catch { /* gesperrt */ }
    };
    kopf.addEventListener('pointermove', bewegen); kopf.addEventListener('pointerup', los);
  };
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape' && feld.contains(document.activeElement)) { e.stopPropagation(); p.onZu(); } };
  onMount(() => { const l = lage(); setzen(l.x, l.y); document.addEventListener('keydown', taste, true); });
  onCleanup(() => document.removeEventListener('keydown', taste, true));
  // Im Portal: das Fenster liegt über der Seite und erbt nichts von der Stelle, an der es geöffnet wird (z. B. aus der Kopfleiste)
  return (
    <Portal><div class="schwebefenster" ref={feld} role="dialog" aria-label={p.titel}>
      <div class="schwebefenster-kopf" onPointerDown={ziehen} title="Am Kopf ziehen, um das Fenster zu verschieben">
        <strong>{p.titel}</strong>
        <button type="button" class="knopf still" aria-label="Fenster schließen" title="Schließen (Esc)" onClick={p.onZu}>×</button>
      </div>
      <div class="schwebefenster-inhalt">{p.children}</div>
    </div></Portal>
  );
}
