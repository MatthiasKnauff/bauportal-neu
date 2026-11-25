// Baustein „Fenster“: eigenes Fenster statt Browser-Rückfrage. Schließt nur über seine Knöpfe.
// Abbrechen verwirft mit Rückfrage: Hat das Fenster ungespeicherte Änderungen (geaendert), fragt es vor dem Schließen –
// beim Knopf mit data-abbrechen und bei Esc. OK speichert und schließt.
import type { JSX } from 'solid-js';
import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';

export function Dialog(p: { titel: string; children: JSX.Element; knoepfe: JSX.Element; onAbbrechen?: () => void; geaendert?: () => boolean; breit?: boolean; gross?: boolean }) {
  let kasten!: HTMLDivElement;
  const [frage, setFrage] = createSignal<(() => void) | null>(null);
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
        <div class="fenster" classList={{ breit: p.breit, gross: p.gross }} role="dialog" aria-modal="true" aria-label={p.titel} tabindex="-1" ref={kasten}>
          <h2>{p.titel}</h2>
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
