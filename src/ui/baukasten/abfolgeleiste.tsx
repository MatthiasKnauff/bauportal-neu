// Baustein „Abfolge-Leiste“: für Apps, die in Schritten ablaufen (Kosten, AVA, Wärmeschutz, Einrichtung).
// aktiv = wie weit es ist (davor: erledigt); hier = der Schritt, dessen Ansicht offen ist (ohne Angabe: der aktive);
// weg = Schritt entfällt (z. B. Aufmaß, wenn ein LV nicht vergeben wurde) – bleibt sichtbar, ausgegraut.
import { For } from 'solid-js';

export interface Schritt { id: string; titel: string; weg?: boolean }

export function Abfolgeleiste(p: { schritte: Schritt[]; aktiv: string; hier?: string; onWahl?: (id: string) => void; bisher?: boolean }) {
  const stelle = () => p.schritte.findIndex((s) => s.id === p.aktiv);
  const hier = () => p.hier ?? p.aktiv;
  return (
    <ol class="abfolge" aria-label="Abfolge">
      <For each={p.schritte}>{(s, i) => (
        <li classList={{ aktiv: i() === stelle(), erledigt: i() < stelle(), hier: s.id === hier() && hier() !== p.aktiv, weg: !!s.weg }} aria-current={s.id === hier() ? 'step' : undefined}>
          {/* bisher = nur schon erreichte Schritte sind anklickbar (Assistent); sonst alle (App mit freier Abfolge) */}
          <button type="button" disabled={!p.onWahl || s.weg || (p.bisher && i() > stelle())} onClick={() => p.onWahl?.(s.id)}><b>{i() + 1}</b><span>{s.titel}</span></button>
        </li>
      )}</For>
    </ol>
  );
}
