// Hilfe zur aktuellen Seite (Knopf „?“ oben): was die App macht, was man in dieser Ansicht tut, und die Bedienung, die
// überall gleich ist. Die Texte stehen im Beipackzettel des Moduls (Ansicht.hilfe) – kein eigenes Handbuch pro Seite.
import { For, Show } from 'solid-js';
import type { Ansicht, Beipackzettel } from '../kern/modul';
import { Dialog } from './baukasten/dialog';

const UEBERALL: [string, string][] = [
  ['Strg+K', 'Suche über alles – Projekte, Firmen, Berichte, Leistungen …'],
  ['Strg+Z / Strg+Y', 'Rückgängig und Wiederholen, auch für mehrere Änderungen in einem Schritt'],
  ['Pfeiltasten, Enter', 'in Tabellen bewegen und öffnen; in Zellen tippen ändert sofort'],
  ['Esc', 'Fenster schließen, Eingabe abbrechen'],
  ['Rechtsklick', 'Menü zu einem Eintrag (Öffnen, Duplizieren, Löschen …)'],
];

export function Hilfe(p: { modul?: Beipackzettel; ansicht?: Ansicht; onZu: () => void }) {
  return (
    <Dialog titel={p.modul ? `Hilfe – ${p.modul.name}${p.ansicht ? ` · ${p.ansicht.titel}` : ''}` : 'Hilfe – Startseite'} onAbbrechen={p.onZu} knoepfe={<button class="knopf haupt" onClick={p.onZu}>Verstanden</button>}>
      <div class="hilfe">
        <p>{p.modul ? p.modul.beschreibung : 'Auf der Startseite wählst du die App, oben rechts das Projekt. Alles wird sofort gespeichert – auch ohne Verbindung, dann geht es später zum Server.'}</p>
        <Show when={p.ansicht?.hilfe}><For each={p.ansicht!.hilfe!.split(/\n\s*\n/)}>{(absatz) => <p>{absatz}</p>}</For></Show>
        <h3>Überall gleich</h3>
        <dl class="hilfe-tasten"><For each={UEBERALL}>{([t, w]) => <><dt><kbd>{t}</kbd></dt><dd>{w}</dd></>}</For></dl>
      </div>
    </Dialog>
  );
}
