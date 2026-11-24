// Baustein „Fenster“: eigenes Fenster statt Browser-Rückfrage. Schließt nur über seine Knöpfe.
import type { JSX } from 'solid-js';
import { onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';

export function Dialog(p: { titel: string; children: JSX.Element; knoepfe: JSX.Element; onAbbrechen?: () => void; breit?: boolean; gross?: boolean }) {
  let kasten!: HTMLDivElement;
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape' && p.onAbbrechen) { e.stopPropagation(); p.onAbbrechen(); } };
  onMount(() => {
    document.addEventListener('keydown', taste, true);
    (kasten.querySelector('input, textarea, button') as HTMLElement | null)?.focus();
  });
  onCleanup(() => document.removeEventListener('keydown', taste, true));
  return (
    <Portal>
      <div class="fenster-hinter">
        <div class="fenster" classList={{ breit: p.breit, gross: p.gross }} role="dialog" aria-modal="true" aria-label={p.titel} ref={kasten}>
          <h2>{p.titel}</h2>
          <div class="fenster-inhalt">{p.children}</div>
          <div class="fenster-knoepfe">{p.knoepfe}</div>
        </div>
      </div>
    </Portal>
  );
}
