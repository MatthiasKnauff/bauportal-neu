// Hilfe zur aktuellen Seite (Knopf „?“ oben): was die App macht, was man in dieser Ansicht tut, und die Bedienung, die
// überall gleich ist. Die Texte stehen im Beipackzettel des Moduls (Ansicht.hilfe) – kein eigenes Handbuch pro Seite.
import { For, Show } from 'solid-js';
import type { Ansicht, Beipackzettel } from '../kern/modul';
import { Dialog } from './baukasten/dialog';
import { STUFEN, UEBERALL } from '../kern/handbuch';
import { istAdmin } from './unterbau/api';



export function Hilfe(p: { modul?: Beipackzettel; ansicht?: Ansicht; onZu: () => void }) {
  return (
    <Dialog titel={p.modul ? `Hilfe – ${p.modul.name}${p.ansicht ? ` · ${p.ansicht.titel}` : ''}` : 'Hilfe – Startseite'} onAbbrechen={p.onZu} knoepfe={<button class="knopf haupt" onClick={p.onZu}>Verstanden</button>}>
      <div class="hilfe">
        <p>{p.modul ? p.modul.beschreibung : 'Auf der Startseite wählst du die App, oben rechts das Projekt. Alles wird sofort gespeichert – auch ohne Verbindung, dann geht es später zum Server.'}</p>
        <Show when={p.ansicht?.hilfe}><For each={p.ansicht!.hilfe!.split(/\n\s*\n/)}>{(absatz) => <p>{absatz}</p>}</For></Show>
        <h3>Überall gleich</h3>
        <dl class="hilfe-tasten"><For each={UEBERALL}>{([t, w]) => <><dt><kbd>{t}</kbd></dt><dd>{w}</dd></>}</For></dl>
        <h3>Handbuch</h3>
        <p class="still-text klein-text">Entsteht aus dem Programm selbst und wird nachts neu erzeugt, wenn sich etwas geändert hat.</p>
        <div class="reihe"><For each={STUFEN.filter((x) => x.wert === 'anwender' || istAdmin())}>{(x) => <>
          <a class="knopf klein" href={`/api/handbuch?stufe=${x.wert}`} target="_blank" rel="noopener">Handbuch {x.titel}</a>
          <a class="knopf klein still" href={`/api/handbuch?stufe=${x.wert}&format=pdf`}>PDF</a></>}</For></div>
      </div>
    </Dialog>
  );
}
