// Bietertextergänzung im Langtext – nur über das Kontextmenü des Langtexts (Entscheidung 26.11.2026): einfügen an der
// Schreibmarke, ändern und entfernen, wenn sie dort steht. Das Feld selbst: kern/textergaenzung.ts.
import { Show, createSignal } from 'solid-js';
import type { Feld } from '../kern/modell';
import { bieterFeld, ergaenzungBei, fragtNachProdukt, type Ergaenzung } from '../kern/textergaenzung';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { zeigeMenue } from './baukasten/kontextmenue';

const [offen, setOffen] = createSignal<{ text: string; anfang: number; ende: number; alt?: Ergaenzung; speichern: (t: string) => void } | null>(null);

/** Kontextmenü am Langtext: Bietertextergänzung einfügen – bzw. ändern oder entfernen, wenn die Schreibmarke in einer steht. */
export function langtextMenue(e: MouseEvent, ta: HTMLTextAreaElement, speichern: (text: string) => void): void {
  const text = ta.value, stelle = ta.selectionStart ?? text.length, da = ergaenzungBei(text, stelle);
  zeigeMenue(e, da ? [
    ...(da.art === 'bieter' ? [{ titel: 'Bietertextergänzung ändern …', tun: () => setOffen({ text, anfang: da.anfang, ende: da.ende, alt: da, speichern }) }] : []),
    { titel: da.art === 'bieter' ? 'Bietertextergänzung entfernen' : 'Ergänzung des Büros entfernen', gefahr: true, tun: () => speichern((text.slice(0, da.anfang) + text.slice(da.ende)).replace(/ {2,}/g, ' ')) },
  ] : [{ titel: 'Bietertextergänzung einfügen …', tun: () => setOffen({ text, anfang: stelle, ende: ta.selectionEnd ?? stelle, speichern }) }]);
}

const feld = (name: string, titel: string): Feld => ({ name, titel, art: 'text' });

/** Das Fenster dazu (einmal in der Ansicht eingehängt). */
export function ErgaenzungFenster() {
  return (
    <Show when={offen()}>{(o) => {
      const [frage, setFrage] = createSignal(o().alt?.frage ?? 'Angebotenes Fabrikat');
      const [vorschlag, setVorschlag] = createSignal(o().alt?.wert ?? '');
      const ok = () => { if (!frage().trim()) return; const t = o().text; o().speichern(t.slice(0, o().anfang) + bieterFeld(frage(), vorschlag()) + t.slice(o().ende)); setOffen(null); };
      return (
        <Dialog titel={o().alt ? 'Bietertextergänzung ändern' : 'Bietertextergänzung einfügen'} onAbbrechen={() => setOffen(null)}
          knoepfe={<><button class="knopf" onClick={() => setOffen(null)}>Abbrechen</button><button class="knopf haupt" disabled={!frage().trim()} onClick={ok}>OK</button></>}>
          <div class="formular">
            <FeldEingabe feld={feld('frage', 'Was soll die Bieter:in angeben?')} wert={frage()} onWert={(w) => setFrage(String(w ?? ''))} />
            <Show when={fragtNachProdukt(frage()) || vorschlag()}>
              <FeldEingabe feld={feld('vorschlag', 'Vorschlag des Büros (erscheint mit „oder gleichwertig“, leer = ohne)')} wert={vorschlag()} onWert={(w) => setVorschlag(String(w ?? ''))} />
            </Show>
            <p class="still-text klein-text">Die Bieter:in füllt das Feld im Angebot aus. Lässt sie es leer, gilt der Vorschlag als angeboten.</p>
          </div>
        </Dialog>
      );
    }}</Show>
  );
}
