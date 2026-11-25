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
  onSuche?: () => void;                                   // Suche über alles (Strg+K)
  apps?: { id: string; titel: string }[]; onApp?: (id: string) => void;   // App-Wechsler
  onHilfe?: () => void;                                   // Hilfe zur aktuellen Seite
}) {
  const [apps, setApps] = createSignal(false);
  const [menue, setMenue] = createSignal(false);
  return (
    <header class="kopf">
      <nav aria-label="Wo bin ich">
        <button class="marke" title="Zur Startseite" onClick={p.onStart}>{p.marke}</button>
        <Show when={p.aktuell}><span class="trenner" aria-hidden="true">›</span><span class="modulname" aria-current="page">{p.aktuell}</span></Show>
      </nav>
      <Show when={p.onSuche}><button class="kopf-suche" onClick={p.onSuche} title="Suche über alles (Strg+K)">🔍 <span>Suchen …</span><kbd>Strg K</kbd></button></Show>
      {p.zusatz}
      <span class="status" classList={{ getrennt: p.status.art === 'getrennt', wartet: p.status.art === 'wartet' }}><i />{p.status.text}</span>
      <Show when={p.onHilfe}><button class="kopf-rund" aria-label="Hilfe zu dieser Seite" title="Hilfe zu dieser Seite" onClick={p.onHilfe}>?</button></Show>
      <Show when={p.apps?.length}>
        <div class="menue">
          <button class="kopf-rund" aria-label="Apps" title="Zu einer anderen App" aria-haspopup="menu" aria-expanded={apps()} onClick={() => setApps(!apps())}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="currentColor">{[4, 12, 20].flatMap((y) => [4, 12, 20].map((x) => <circle cx={x} cy={y} r="2.2" />))}</g></svg></button>
          <Show when={apps()}>
            <div class="menue-liste apps-liste" role="menu" onClick={() => setApps(false)}>
              <For each={p.apps}>{(a) => <button role="menuitem" onClick={() => p.onApp?.(a.id)}>{a.titel}</button>}</For>
            </div>
          </Show>
        </div>
      </Show>
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
