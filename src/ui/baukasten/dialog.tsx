// Baustein „Fenster“: eigenes Fenster statt Browser-Rückfrage. Schließt nur über seine Knöpfe.
// Abbrechen verwirft mit Rückfrage: Hat das Fenster ungespeicherte Änderungen (geaendert), fragt es vor dem Schließen –
// beim Knopf mit data-abbrechen und bei Esc. OK speichert und schließt.
// Verschiebbar am Titel; das große Fenster (z. B. Druckvorschau) zusätzlich an der Ecke unten rechts in der Größe veränderbar.
import type { JSX } from 'solid-js';
import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';

export function Dialog(p: { titel: string; children: JSX.Element; knoepfe: JSX.Element; onAbbrechen?: () => void; geaendert?: () => boolean; breit?: boolean; gross?: boolean }) {
  let kasten!: HTMLDivElement;
  const [frage, setFrage] = createSignal<(() => void) | null>(null);
  const [versatz, setVersatz] = createSignal({ x: 0, y: 0 });
  // Am Titel ziehen: das Fenster folgt der Maus, bleibt aber mit dem Titel im Bild
  const ziehen = (e: PointerEvent) => {
    if (e.button !== 0 || matchMedia('(max-width: 860px)').matches) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY }, v0 = versatz(), r0 = kasten.getBoundingClientRect();
    const bewegt = (x: PointerEvent) => {
      const dx = Math.min(innerWidth - 80 - r0.left, Math.max(80 - r0.right, x.clientX - start.x));
      const dy = Math.min(innerHeight - 40 - r0.top, Math.max(-r0.top, x.clientY - start.y));
      setVersatz({ x: v0.x + dx, y: v0.y + dy });
    };
    const fertig = () => { removeEventListener('pointermove', bewegt); removeEventListener('pointerup', fertig); };
    addEventListener('pointermove', bewegt); addEventListener('pointerup', fertig);
  };
  /** Schließen über Abbrechen: bei Änderungen erst fragen. */
  const abbrechen = (tun: () => void) => { if (p.geaendert?.()) setFrage(() => tun); else tun(); };
  const taste = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !p.onAbbrechen) return;
    e.stopPropagation();
    if (frage()) setFrage(null); else abbrechen(p.onAbbrechen);
  };
  // Knöpfe mit data-abbrechen laufen über dieselbe Rückfrage
  const klick = (e: MouseEvent) => {
    const k = (e.target as HTMLElement).closest('[data-abbrechen]') as HTMLElement | null;
    if (!k || !p.geaendert?.() || frage()) return;
    e.stopPropagation(); e.preventDefault();
    setFrage(() => () => { k.removeAttribute('data-abbrechen'); k.click(); });
  };
  onMount(() => {
    document.addEventListener('keydown', taste, true);
    kasten.addEventListener('click', klick, true);
    // Im großen Fenster (z. B. Druckvorschau) steht oben etwas zum Ansehen – dort bleibt der Blick, kein Sprung ins erste Feld
    if (p.gross) kasten.focus(); else (kasten.querySelector('input, textarea, button') as HTMLElement | null)?.focus();
  });
  onCleanup(() => document.removeEventListener('keydown', taste, true));
  return (
    <Portal>
      <div class="fenster-hinter">
        <div class="fenster" classList={{ breit: p.breit, gross: p.gross }} role="dialog" aria-modal="true" aria-label={p.titel} tabindex="-1" ref={kasten}
          style={{ translate: `${versatz().x}px ${versatz().y}px` }}>
          <h2 class="fenster-titel" onPointerDown={ziehen} title="Zum Verschieben ziehen">{p.titel}</h2>
          <div class="fenster-inhalt">{p.children}</div>
          {/* Die Knöpfe bleiben im Fenster (nur verdeckt), damit „Verwerfen“ den gedrückten Knopf danach wirklich auslöst */}
          <div class="fenster-knoepfe" hidden={!!frage()}>{p.knoepfe}</div>
          <Show when={frage()}>
            <div class="fenster-knoepfe fenster-frage" role="alertdialog" aria-label="Änderungen verwerfen?">
              <span>Änderungen verwerfen?</span>
              <button class="knopf" onClick={() => setFrage(null)}>Weiter bearbeiten</button>
              <button class="knopf gefahr" onClick={() => { const t = frage()!; setFrage(null); t(); }}>Verwerfen</button>
            </div>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
