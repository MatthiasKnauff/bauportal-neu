// Baustein „Kopfleiste“: ganz oben, dunkel – „Bauportal“ (zur Startseite), das aktuelle Modul, Speicherstand, Benutzermenü.
// Rückgängig und Wiederholen stehen nicht hier (zu eng), sondern am Anfang der Menüleiste.
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Menuepunkt } from './kontextmenue';

export function Kopfleiste(p: {
  marke: string;
  aktuell?: string;        // Name des Moduls, in dem man gerade ist – auf der Startseite leer
  onStart: () => void;     // zurück zur Startseite mit den Kacheln
  status: { text: string; art: 'gut' | 'wartet' | 'getrennt' };
  benutzer: string; benutzerMenue: Menuepunkt[]; menueFuss?: string;
  /** Platz für weitere Elemente einer App rechts neben den Apps. */
  zusatz?: JSX.Element;
}) {
  const [menue, setMenue] = createSignal(false);
  return (
    <header class="kopf">
      <nav aria-label="Wo bin ich">
        <button class="marke" title="Zur Startseite" onClick={p.onStart}>{p.marke}</button>
        <Show when={p.aktuell}><span class="trenner" aria-hidden="true">›</span><span class="modulname" aria-current="page">{p.aktuell}</span></Show>
      </nav>
      {p.zusatz}
      <span class="status" classList={{ getrennt: p.status.art === 'getrennt', wartet: p.status.art === 'wartet' }}><i />{p.status.text}</span>
      <div class="menue">
        <button class="knopf still" aria-haspopup="menu" aria-expanded={menue()} onClick={() => setMenue(!menue())}>{p.benutzer} ▾</button>
        <Show when={menue()}>
          <div class="menue-liste" role="menu" onClick={() => setMenue(false)}>
            <For each={p.benutzerMenue}>{(m) => <button role="menuitem" onClick={m.tun}>{m.titel}</button>}</For>
            <Show when={p.menueFuss}><div class="menue-fuss">{p.menueFuss}</div></Show>
          </div>
        </Show>
      </div>
    </header>
  );
}
