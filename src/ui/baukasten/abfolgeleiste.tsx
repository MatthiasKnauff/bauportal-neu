// Baustein „Abfolge-Leiste“: für Apps, die in Schritten ablaufen (Kosten, AVA, Wärmeschutz, Einrichtung).
import { For } from 'solid-js';

export interface Schritt { id: string; titel: string }

export function Abfolgeleiste(p: { schritte: Schritt[]; aktiv: string; onWahl?: (id: string) => void; bisher?: boolean }) {
  const stelle = () => p.schritte.findIndex((s) => s.id === p.aktiv);
  return (
    <ol class="abfolge" aria-label="Abfolge">
      <For each={p.schritte}>{(s, i) => (
        <li classList={{ aktiv: i() === stelle(), erledigt: i() < stelle() }} aria-current={i() === stelle() ? 'step' : undefined}>
          {/* bisher = nur schon erreichte Schritte sind anklickbar (Assistent); sonst alle (App mit freier Abfolge) */}
          <button type="button" disabled={!p.onWahl || (p.bisher && i() > stelle())} onClick={() => p.onWahl?.(s.id)}><b>{i() + 1}</b><span>{s.titel}</span></button>
        </li>
      )}</For>
    </ol>
  );
}
