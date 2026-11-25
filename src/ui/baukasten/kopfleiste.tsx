// Baustein „Kopfleiste“: ganz oben, dunkel – „Bauportal“ (zur Startseite), das aktuelle Modul, Speicherstand, Benutzermenü.
// Rückgängig und Wiederholen stehen nicht hier (zu eng), sondern am Anfang der Menüleiste.
import { AppSymbol, Zeichen } from './zeichen';
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Menuepunkt } from './kontextmenue';

export function Kopfleiste(p: {
  marke: string;
  aktuell?: string;        // Name des Moduls, in dem man gerade ist – auf der Startseite leer
  onStart: () => void;     // zurück zur Startseite mit den Kacheln
  status: { text: string; art: 'gut' | 'wartet' | 'getrennt' };
  benutzer: string; benutzerMenue: Menuepunkt[]; menueFuss?: string;
  /** Das gewählte Projekt (Name, darunter die Anschrift) – links nach dem Ort, Klick öffnet die Projektwahl. */
  projekt?: JSX.Element;
  onSuche?: () => void;                                   // Suche über alles (Strg+K)
  apps?: { id: string; titel: string; zeichen?: string }[]; onApp?: (id: string) => void;   // App-Wechsler
  projektName?: string;   // bleibt beim App-Wechsel gewählt
  onHilfe?: () => void;                                   // Hilfe zur aktuellen Seite
}) {
  const [apps, setApps] = createSignal(false);
  const [menue, setMenue] = createSignal(false);
  return (
    <header class="kopf">
      <nav aria-label="Wo bin ich">
        <button class="marke" title="Zur Startseite" onClick={p.onStart}><Zeichen name="start" groesse={18} /><span class="marke-text">{p.marke}</span></button>
        <span class="trenner" aria-hidden="true">/</span><span class="modulname" aria-current="page">{p.aktuell ?? 'Startseite'}</span>
        {p.projekt}
      </nav>
      <Show when={p.onSuche}><button class="kopf-suche" onClick={p.onSuche} title="Suche über alles (Strg+K)">🔍 <span>Suchen …</span><kbd>Strg K</kbd></button></Show>
      <span class="status kopf-status" role="status" title={p.status.text} classList={{ getrennt: p.status.art === 'getrennt', wartet: p.status.art === 'wartet' }}><i /><span class="nur-vorlesen">{p.status.text}</span></span>
      <Show when={p.onHilfe}><button class="kopf-rund kopf-hilfe" aria-label="Hilfe zu dieser Seite" title="Hilfe zu dieser Seite" onClick={p.onHilfe}>?</button></Show>
      <Show when={p.apps?.length}>
        <div class="menue">
          <button class="kopf-rund kopf-ohne-rand" aria-label="Apps" title="Zu einer anderen App" aria-haspopup="menu" aria-expanded={apps()} onClick={() => setApps(!apps())}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="currentColor">{[4, 12, 20].flatMap((y) => [4, 12, 20].map((x) => <circle cx={x} cy={y} r="2.2" />))}</g></svg></button>
          <Show when={apps()}>
            <div class="menue-liste apps-liste" role="menu" onClick={() => setApps(false)}>
              <div class="apps-kopf">Apps<Show when={p.projektName}> · Projekt <b>{p.projektName}</b> bleibt gewählt</Show></div>
              <div class="apps-raster">
                <button role="menuitem" class="apps-eintrag" onClick={() => p.onStart?.()}><AppSymbol id="start" zeichen="start" groesse={22} /><span>Startseite</span></button>
                <For each={p.apps}>{(a) => <button role="menuitem" class="apps-eintrag" onClick={() => p.onApp?.(a.id)}><AppSymbol id={a.id} zeichen={a.zeichen} groesse={22} /><span>{a.titel}</span></button>}</For>
              </div>
            </div>
          </Show>
        </div>
      </Show>
      <div class="menue">
        <button class="knopf still kopf-person" aria-label={p.benutzer} aria-haspopup="menu" aria-expanded={menue()} onClick={() => setMenue(!menue())}><span class="kopf-kreis" aria-hidden="true">{p.benutzer.slice(0, 1).toUpperCase()}</span><span class="kopf-name">{p.benutzer}</span></button>
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
