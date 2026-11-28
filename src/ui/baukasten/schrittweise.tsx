// Baustein „Schritt für Schritt“: führt durch einen Eintrag, ein Abschnitt nach dem anderen – gedacht fürs Handy
// auf der Baustelle. Die Abschnitte sind dieselben Bausteine wie in der Karte; jede Eingabe gilt sofort.
import { For, createSignal, type JSX } from 'solid-js';
import { Dialog } from './dialog';

export interface Schritt { titel: string; inhalt: () => JSX.Element }

/** wahl: Schritte auslassen (wie bisher „Schritte wählen“ ⚙ je Benutzer:in) – aus: die Titel der ausgelassenen, setzen: speichert sie. */
export function Schrittweise(p: { knopf: string; titel: string; schritte: Schritt[]; steuer?: (oeffnen: () => void) => void;
  wahl?: { aus: () => string[]; setzen: (aus: string[]) => void } }) {   // mit steuer: Knopf steht woanders (Menüleiste)
  const [nr, setNr] = createSignal<number | null>(null);
  const [waehlen, setWaehlen] = createSignal(false);
  const gezeigt = () => { const aus = new Set(p.wahl?.aus() ?? []), l = p.schritte.filter((x) => !aus.has(x.titel)); return l.length ? l : p.schritte; };
  const s = () => gezeigt()[Math.min(nr() ?? 0, gezeigt().length - 1)]!;
  const letzter = () => (nr() ?? 0) >= gezeigt().length - 1;
  p.steuer?.(() => { setWaehlen(false); setNr(0); });
  const umschalten = (titel: string) => { const aus = new Set(p.wahl!.aus()); if (aus.has(titel)) aus.delete(titel); else if (gezeigt().length > 1) aus.add(titel); p.wahl!.setzen([...aus]); };
  return (
    <>
      {!p.steuer && <button class="knopf" onClick={() => setNr(0)}>{p.knopf}</button>}
      {nr() !== null && (
        <Dialog titel={waehlen() ? `${p.titel} – Schritte wählen` : `${p.titel} – ${s().titel}`} gross onAbbrechen={() => setNr(null)}
          knoepfe={waehlen() ? <button class="knopf haupt" onClick={() => { setWaehlen(false); setNr(0); }}>Fertig</button> : <>
            <button class="knopf" disabled={nr() === 0} onClick={() => setNr(nr()! - 1)}>‹ Zurück</button>
            <button class="knopf haupt" onClick={() => setNr(letzter() ? null : nr()! + 1)}>{letzter() ? 'Fertig' : 'Weiter ›'}</button>
          </>}>
          {waehlen() ? (
            <div class="schritt-wahl">
              <p class="leise">Welche Schritte du durchgehen willst – gilt für dich auf allen Geräten.</p>
              <For each={p.schritte}>{(x) => <label><input type="checkbox" checked={!(p.wahl!.aus()).includes(x.titel)} onChange={() => umschalten(x.titel)} /> {x.titel}</label>}</For>
            </div>
          ) : (
          <div class="schritt-rahmen">
          <ol class="schritte-punkte" aria-label="Abschnitte">
            <For each={gezeigt()}>{(x, i) => (
              <li><button classList={{ an: i() === nr(), vorbei: i() < nr()! }} aria-current={i() === nr() ? 'step' : undefined} title={x.titel} aria-label={`${i() + 1}. ${x.titel}`} onClick={() => setNr(i())} /></li>
            )}</For>
          </ol>
          <p class="leise">Schritt {nr()! + 1} von {gezeigt().length} · Alles wird sofort gespeichert.
            {p.wahl && <button type="button" class="knopf klein still" title="Schritte wählen oder auslassen" aria-label="Schritte wählen" onClick={() => setWaehlen(true)}>⚙</button>}</p>
          <div class="schritt-inhalt">{s().inhalt()}</div>
          </div>
          )}
        </Dialog>
      )}
    </>
  );
}
