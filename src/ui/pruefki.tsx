// Verwaltung → Prüf-KI: Schlüssel für eine andere KI erzeugen, die das Bauportal kontrolliert und berät.
// Der Schlüssel wird genau einmal angezeigt; gespeichert ist nur seine Prüfsumme. Ein neuer ersetzt den alten.
import { Show, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { ruf } from './unterbau/api';
import { Dialog } from './baukasten/dialog';
import { hinweis } from './unterbau/meldungen';

export function PruefSchluessel(p: { zugang: Zeile }) {
  const [schluessel, setSchluessel] = createSignal('');
  const [frage, setFrage] = createSignal(false);
  const erzeugen = async () => {
    setFrage(false);
    try { setSchluessel((await ruf<{ schluessel: string }>('/api/pruefer/schluessel', { zugang: p.zugang.id })).schluessel); }
    catch (e) { hinweis((e as Error).message); }
  };
  const anleitung = () => `Du prüfst das Bauportal und berätst uns. Schnittstelle: ${location.origin}/api/pruefer\nJede Anfrage mit dem Kopf „Authorization: Bearer ${schluessel()}“. Beginne mit GET /api/pruefer – dort stehen Auftrag, Regeln und alle Wege. Ratschläge schickst du mit POST /api/pruefer/ratschlag.`;
  return (
    <fieldset>
      <legend>Schlüssel</legend>
      <p class="still-text klein-text">Mit dem Schlüssel liest die Prüf-KI Aufbau, Prüfung, Quelltext und Betrieb und schickt Ratschläge – Daten aus Projekten sieht sie nicht, ändern kann sie nichts. Ausschalten sperrt sie sofort.</p>
      <div><button class="knopf" onClick={() => setFrage(true)}>Neuen Schlüssel erzeugen …</button></div>
      <Show when={frage()}>
        <Dialog titel="Neuen Schlüssel erzeugen" onAbbrechen={() => setFrage(false)}
          knoepfe={<><button class="knopf" onClick={() => setFrage(false)}>Abbrechen</button><button class="knopf haupt" onClick={() => void erzeugen()}>Erzeugen</button></>}>
          <p>Ein neuer Schlüssel ersetzt den bisherigen – die Prüf-KI braucht dann den neuen.</p>
        </Dialog>
      </Show>
      <Show when={schluessel()}>
        <Dialog titel="Schlüssel für die Prüf-KI" breit onAbbrechen={() => setSchluessel('')}
          knoepfe={<><button class="knopf" onClick={() => void navigator.clipboard.writeText(anleitung()).then(() => hinweis('Auftrag mit Schlüssel kopiert'))}>Auftrag kopieren</button><button class="knopf haupt" onClick={() => setSchluessel('')}>Fertig</button></>}>
          <p>Der Schlüssel wird nur jetzt angezeigt. Gib ihn der Prüf-KI – am einfachsten mit „Auftrag kopieren“.</p>
          <pre class="pruef-schluessel">{anleitung()}</pre>
        </Dialog>
      </Show>
    </fieldset>
  );
}
