// Baustein „Hinweis“: kurze Meldung unten, auf Wunsch mit einem Knopf (z. B. Rückgängig).
import { For } from 'solid-js';
import { createStore, produce } from 'solid-js/store';

export interface Hinweis { nr: number; text: string; art: 'info' | 'fehler'; aktion?: { titel: string; tun: () => void } }
const [liste, setListe] = createStore<Hinweis[]>([]);
let zaehler = 0;

export function hinweis(text: string, o: { art?: Hinweis['art']; aktion?: Hinweis['aktion'] } = {}): void {
  const nr = ++zaehler;
  const art = o.art ?? 'info';
  setListe(produce((l) => { l.push({ nr, text, art, aktion: o.aktion }); if (l.length > 4) l.shift(); }));
  setTimeout(() => schliessen(nr), art === 'fehler' || o.aktion ? 12000 : 5000);
}
function schliessen(nr: number): void { setListe((l) => l.filter((h) => h.nr !== nr)); }

export function Hinweise() {
  return (
    <div class="hinweise" role="status" aria-live="polite">
      <For each={liste}>{(h) => (
        <div class="hinweis" classList={{ fehler: h.art === 'fehler' }}>
          <span>{h.text}</span>
          {h.aktion && <button class="knopf klein" onClick={() => { h.aktion!.tun(); schliessen(h.nr); }}>{h.aktion.titel}</button>}
          <button class="knopf klein still" aria-label="Hinweis schließen" onClick={() => schliessen(h.nr)}>×</button>
        </div>
      )}</For>
    </div>
  );
}
