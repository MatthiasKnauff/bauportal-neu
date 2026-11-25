// Baustein „Schritt für Schritt“: führt durch einen Eintrag, ein Abschnitt nach dem anderen – gedacht fürs Handy
// auf der Baustelle. Die Abschnitte sind dieselben Bausteine wie in der Karte; jede Eingabe gilt sofort.
import { For, createSignal, type JSX } from 'solid-js';
import { Dialog } from './dialog';

export interface Schritt { titel: string; inhalt: () => JSX.Element }

export function Schrittweise(p: { knopf: string; titel: string; schritte: Schritt[] }) {
  const [nr, setNr] = createSignal<number | null>(null);
  const s = () => p.schritte[nr() ?? 0]!;
  const letzter = () => nr() === p.schritte.length - 1;
  return (
    <>
      <button class="knopf" onClick={() => setNr(0)}>{p.knopf}</button>
      {nr() !== null && (
        <Dialog titel={`${p.titel} – ${s().titel}`} gross onAbbrechen={() => setNr(null)}
          knoepfe={<>
            <button class="knopf" disabled={nr() === 0} onClick={() => setNr(nr()! - 1)}>‹ Zurück</button>
            <button class="knopf haupt" onClick={() => setNr(letzter() ? null : nr()! + 1)}>{letzter() ? 'Fertig' : 'Weiter ›'}</button>
          </>}>
          <ol class="schritte-punkte" aria-label="Abschnitte">
            <For each={p.schritte}>{(x, i) => (
              <li><button classList={{ an: i() === nr(), vorbei: i() < nr()! }} aria-current={i() === nr() ? 'step' : undefined} title={x.titel} aria-label={`${i() + 1}. ${x.titel}`} onClick={() => setNr(i())} /></li>
            )}</For>
          </ol>
          <p class="leise">Schritt {nr()! + 1} von {p.schritte.length} · Alles wird sofort gespeichert.</p>
          <div class="schritt-inhalt">{s().inhalt()}</div>
        </Dialog>
      )}
    </>
  );
}
