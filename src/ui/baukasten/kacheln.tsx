// Baustein „Kacheln“: dieselben Einträge wie die Tabelle, als Karten nebeneinander – am Handy die übliche Form.
// Was in einer Kachel steht, stellt das Modul über die Stellschraube „kachel“ ein.
import { For, Show, type JSX } from 'solid-js';
import type { Zeile } from '../../kern/befehl';

export function Kacheln(p: { zeilen: Zeile[]; gewaehlt: string | null; leer: string; inhalt: (z: Zeile) => JSX.Element; onWahl: (id: string) => void; onOeffnen: () => void; breite?: number }) {
  return (
    <div class="kachelliste" style={p.breite ? { '--kachel-breite': `${p.breite}px` } : undefined}>
      <Show when={p.zeilen.length} fallback={<p class="leer">{p.leer}</p>}>
        <For each={p.zeilen}>{(z) => (
          <div class="kachelliste-eintrag" classList={{ an: z.id === p.gewaehlt }} role="button" tabindex="0" aria-pressed={z.id === p.gewaehlt}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) { p.onWahl(z.id); p.onOeffnen(); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onWahl(z.id); p.onOeffnen(); } }}>
            {p.inhalt(z)}
          </div>
        )}</For>
      </Show>
    </div>
  );
}
