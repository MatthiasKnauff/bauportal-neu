// Baustein „Schwebefenster“: ein frei bewegliches Fenster über der Seite – am Kopf ziehen, an der Ecke unten rechts
// die Größe ändern, × oder Esc schließt. Wie im bisherigen Bauportal öffnet der Doppelklick auf eine Zeile den Eintrag
// darin; die Liste bleibt dabei bedienbar. Lage und Größe merkt sich das Fenster je Art (schluessel), Benutzer und Gerät.
import { onCleanup, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

interface Lage { x: number; y: number; b?: number; h?: number }

export function Schwebefenster(p: { titel: string; onZu: () => void; children: JSX.Element; schluessel?: string; breite?: number; hoehe?: number; kopfZusatz?: JSX.Element }) {
  let feld!: HTMLDivElement;
  const merk = `bp.schwebefenster${p.schluessel ? '.' + p.schluessel : ''}`;
  const gemerkt = (): Lage => {
    try { return JSON.parse(localStorage.getItem(merk) ?? '') as Lage; } catch { const b = p.breite ?? 460; return { x: Math.max(20, innerWidth - b - 40), y: 90 }; }
  };
  const speichern = () => {
    const r = feld.getBoundingClientRect();
    try { localStorage.setItem(merk, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), b: Math.round(r.width), h: Math.round(r.height) })); } catch { /* gesperrt */ }
  };
  const setzen = (x: number, y: number) => {
    feld.style.left = `${Math.max(0, Math.min(innerWidth - 120, x))}px`;
    feld.style.top = `${Math.max(0, Math.min(innerHeight - 40, y))}px`;
  };
  const ziehen = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    e.preventDefault();
    const r = feld.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, kopf = e.currentTarget as HTMLElement;
    kopf.setPointerCapture(e.pointerId);
    const bewegen = (m: PointerEvent) => setzen(m.clientX - dx, m.clientY - dy);
    const los = (m: PointerEvent) => { kopf.removeEventListener('pointermove', bewegen); kopf.removeEventListener('pointerup', los); setzen(m.clientX - dx, m.clientY - dy); speichern(); };
    kopf.addEventListener('pointermove', bewegen); kopf.addEventListener('pointerup', los);
  };
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape' && feld.contains(document.activeElement) && !e.defaultPrevented) { e.stopPropagation(); p.onZu(); } };
  onMount(() => {
    const l = gemerkt();
    feld.style.width = `${Math.min(innerWidth - 20, l.b ?? p.breite ?? 460)}px`;
    if (l.h ?? p.hoehe) feld.style.height = `${Math.min(innerHeight - 20, (l.h ?? p.hoehe)!)}px`;
    setzen(Math.min(l.x, innerWidth - 140), l.y);
    document.addEventListener('keydown', taste, true);
    // Größe an der Ecke geändert (CSS resize): merken
    const ro = new ResizeObserver(() => { if (feld.isConnected) speichern(); });
    ro.observe(feld); onCleanup(() => ro.disconnect());
  });
  onCleanup(() => document.removeEventListener('keydown', taste, true));
  // Im Portal: das Fenster liegt über der Seite und erbt nichts von der Stelle, an der es geöffnet wird (z. B. aus der Kopfleiste)
  return (
    <Portal><div class="schwebefenster" ref={feld} role="dialog" aria-label={p.titel}>
      <div class="schwebefenster-kopf" onPointerDown={ziehen} title="Am Kopf ziehen, um das Fenster zu verschieben – an der Ecke unten rechts die Größe ändern">
        <strong>{p.titel}</strong>{p.kopfZusatz}
        <button type="button" class="knopf still" aria-label="Fenster schließen" title="Schließen (Esc)" onClick={p.onZu}>×</button>
      </div>
      <div class="schwebefenster-inhalt">{p.children}</div>
    </div></Portal>
  );
}
