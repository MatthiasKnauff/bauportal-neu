// Baustein „Hinweise“: zeigt die kurzen Meldungen unten, auf Wunsch mit einem Knopf (z. B. Rückgängig).
// Gemeldet wird mit hinweis() aus dem Unterbau (unterbau/meldungen.ts).
import { For } from 'solid-js';
import { meldungSchliessen, meldungen } from '../unterbau/meldungen';

export function Hinweise() {
  return (
    <div class="hinweise" role="status" aria-live="polite">
      <For each={meldungen}>{(h) => (
        <div class="hinweis" classList={{ fehler: h.art === 'fehler' }}>
          <span>{h.text}</span>
          {h.aktion && <button class="knopf klein" onClick={() => { h.aktion!.tun(); meldungSchliessen(h.nr); }}>{h.aktion.titel}</button>}
          <button class="knopf klein still" aria-label="Hinweis schließen" onClick={() => meldungSchliessen(h.nr)}>×</button>
        </div>
      )}</For>
    </div>
  );
}
