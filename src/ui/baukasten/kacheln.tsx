// Baustein „Kacheln“: dieselben Einträge wie die Tabelle, als Karten nebeneinander – am Handy die übliche Form.
// Was in einer Kachel steht, stellt das Modul über die Stellschraube „kachel“ ein. Mit Auswahl: Haken oben links,
// Strg/Umschalt+Klick, am Handy lange tippen (Baustein Auswahl).
import { For, Show, type JSX } from 'solid-js';
import type { Zeile } from '../../kern/befehl';
import { Haken, auswahlKlick, langTippen, type Auswahl } from './auswahl';

export function Kacheln(p: { zeilen: Zeile[]; gewaehlt: string | null; leer: string; inhalt: (z: Zeile) => JSX.Element; onWahl: (id: string) => void; onOeffnen: () => void; breite?: number;
  auswahl?: Auswahl; auswahlMenue?: (e: MouseEvent) => void; name?: (z: Zeile) => string }) {
  const reihe = () => p.zeilen.map((z) => z.id);
  return (
    <div class="kachelliste" style={p.breite ? { '--kachel-breite': `${p.breite}px` } : undefined}>
      <Show when={p.zeilen.length} fallback={<p class="leer">{p.leer}</p>}>
        <For each={p.zeilen}>{(z) => { const lang = langTippen(p.auswahl, z.id); return (
          <div class="kachelliste-eintrag" classList={{ an: z.id === p.gewaehlt, markiert: !!p.auswahl?.hat(z.id), 'mit-haken': !!p.auswahl }} role="button" tabindex="0" aria-pressed={z.id === p.gewaehlt}
            onClick={(e) => { if ((e.target as HTMLElement).closest('a') || lang.schlucken(e) || auswahlKlick(p.auswahl, e, z.id, reihe)) return; p.onWahl(z.id); p.onOeffnen(); }}
            onPointerDown={lang.onPointerDown} onPointerMove={lang.onPointerMove} onPointerUp={lang.onPointerUp} onPointerCancel={lang.onPointerCancel}
            onContextMenu={(e) => { lang.onContextMenu(e); if (!e.defaultPrevented && p.auswahl?.hat(z.id) && p.auswahlMenue) { e.preventDefault(); p.auswahlMenue(e); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onWahl(z.id); p.onOeffnen(); } }}>
            <Show when={p.auswahl}>{(a) => <Haken auswahl={a()} id={z.id} name={p.name?.(z) ?? ''} reihe={reihe} />}</Show>
            {p.inhalt(z)}
          </div>); }}</For>
      </Show>
    </div>
  );
}
