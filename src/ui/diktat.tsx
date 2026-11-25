// Diktieren im Tagesbericht: frei erzählen mit dem Mikrofon der Handytastatur, die KI verteilt den Text auf den
// Bericht. Übernommen wird erst nach der Vorschau (Baustein Übernahme). Es wird kein Ton aufgenommen.
import { Show, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { ruf } from './unterbau/api';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { kiAnbindungen } from './baukasten/ki';
import { vorschauZeigen, type Vorschau } from './uebernahme';

export function Diktieren(p: { bericht: Zeile; steuer?: (oeffnen: () => void) => void }) {   // mit steuer: Knopf steht woanders (Menüleiste)
  const [offen, setOffen] = createSignal(false);
  const [text, setText] = createSignal('');
  const [anbindung, setAnbindung] = createSignal(kiAnbindungen()[0]?.id ?? '');
  const oeffnen = () => { setAnbindung(kiAnbindungen()[0]?.id ?? ''); setOffen(true); };
  p.steuer?.(oeffnen);
  const weiter = () => {
    const t = text().trim();
    if (!t) return;
    setOffen(false);
    void vorschauZeigen({ titel: 'Diktat übernehmen', wartetext: anbindung() ? 'Die KI ordnet den Text …' : 'Text wird vorbereitet …', fertig: 'Das Diktat steht im Bericht.', zurueck: () => setOffen(true), danach: () => setText('') },
      () => ruf<Vorschau>('/api/bautagebuch/diktat', { bericht: p.bericht.id, text: t, anbindung: anbindung() || undefined }));
  };
  return (
    <>
      <Show when={!p.steuer}><div class="diktat-knopf"><button class="knopf" onClick={oeffnen}>🎙 Diktieren</button></div></Show>
      <Show when={offen()}>
        <Dialog titel="Diktieren" breit onAbbrechen={() => setOffen(false)}
          knoepfe={<>
            <button class="knopf" onClick={() => setOffen(false)}>Abbrechen</button>
            <button class="knopf haupt" disabled={!text().trim()} onClick={weiter}>{anbindung() ? 'Ordnen lassen' : 'Als Notiz übernehmen'}</button>
          </>}>
          <p class="leise">Erzähl einfach, was auf der Baustelle los war – auf dem Handy mit dem Mikrofon der Tastatur. Wer da war, Mängel, Aufgaben, Wetter. Es wird kein Ton gespeichert.</p>
          <textarea class="diktat-text" rows={9} value={text()} onInput={(e) => setText(e.currentTarget.value)} autofocus
            placeholder="z. B. Heute sonnig, 14 Grad. Firma Müller mit drei Leuten beim Mauern im EG. Am Fenster Küche fehlt die Abdichtung, Müller bis Freitag nachbessern …" />
          <div class="diktat-ki"><span>KI</span>
            <Auswahlliste titel="KI" wert={anbindung()} onWert={setAnbindung}
              optionen={[...kiAnbindungen().map((k) => ({ wert: k.id, titel: `${String(k.werte.name)}${k.werte.art === 'ollama' ? ' (im Büro)' : ''}` })), { wert: '', titel: 'ohne KI – alles als Notiz' }]} />
          </div>
        </Dialog>
      </Show>
    </>
  );
}
