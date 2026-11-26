// Soll festhalten und zurücknehmen (wie im bisherigen Bauzeitenplan): Festhalten merkt die gerechneten Termine als Soll; ein neues
// Soll braucht eine Begründung, das bisherige bleibt (nicht mehr gültig) im Verlauf. Zurücknehmen braucht immer eine Begründung –
// danach hat der Plan kein Soll. Beides ist ein Schritt, Strg+Z nimmt ihn zurück.
import { createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { sollStand, type SollZeile } from '../module/bauzeitenplan/soll';
import { ausfuehrenMehrere } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { Dialog } from './baukasten/dialog';

const heute = () => new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function SollFesthalten(p: { bisher?: Zeile; zusammenhang: Record<string, Wert>; ist: () => SollZeile[]; onZu: () => void }) {
  const [name, setName] = createSignal(`Soll ${heute()}`);
  const [grund, setGrund] = createSignal('');
  const fest = () => {
    if (p.bisher && !grund().trim()) { hinweis('Bitte begründen, warum das Soll neu festgehalten wird.', { art: 'fehler' }); return; }
    ausfuehrenMehrere([
      ...(p.bisher ? [{ objekt: 'soll', art: 'aendern' as const, objektId: p.bisher.id, werte: { gilt: false } }] : []),
      { objekt: 'soll', art: 'anlegen' as const, objektId: neueKennung(), werte: { ...p.zusammenhang, name: name().trim() || `Soll ${heute()}`, begruendung: grund().trim(), gilt: true, stand: sollStand(p.ist()) } },
    ], p.bisher ? 'Soll neu festhalten' : 'Soll festhalten');
    hinweis(`Soll „${name().trim() || `Soll ${heute()}`}“ festgehalten.`);
    p.onZu();
  };
  return (
    <Dialog titel={p.bisher ? 'Soll neu festhalten' : 'Plan scharf schalten – Soll festhalten'} onAbbrechen={p.onZu} geaendert={() => !!grund().trim()}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" onClick={fest}>Festhalten</button></>}>
      <p class="still-text">{p.bisher ? `Der heutige Plan wird das neue Soll. Das bisherige („${String(p.bisher.werte.name ?? 'Soll')}“) bleibt im Verlauf, gilt aber nicht mehr.`
        : 'Der heutige Plan wird als Soll festgehalten und liegt ab jetzt blass unter dem laufenden Plan (Ist). Fortschritt und verschobene Termine trägst du im Ist ein.'}</p>
      <label class="feld"><span>Name</span><input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="z. B. Nachtrag 2 – Bauzeitverlängerung" /></label>
      <label class="feld"><span>Begründung{p.bisher ? ' (Pflicht)' : ''}</span><textarea rows={3} value={grund()} onInput={(e) => setGrund(e.currentTarget.value)} placeholder={p.bisher ? 'z. B. vereinbart mit der Bauherrschaft am …' : 'optional'} /></label>
    </Dialog>
  );
}

export function SollZurueck(p: { soll: Zeile; onZu: () => void }) {
  const [grund, setGrund] = createSignal('');
  const weg = () => {
    if (!grund().trim()) { hinweis('Bitte begründen, warum das Soll zurückgenommen wird.', { art: 'fehler' }); return; }
    ausfuehrenMehrere([{ objekt: 'soll', art: 'aendern', objektId: p.soll.id, werte: { gilt: false, zurueck_grund: grund().trim() } }], 'Soll zurücknehmen');
    hinweis('Soll zurückgenommen – der Plan ist wieder ein Entwurf ohne Soll.');
    p.onZu();
  };
  return (
    <Dialog titel="Soll zurücknehmen" onAbbrechen={p.onZu} geaendert={() => !!grund().trim()}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" onClick={weg}>Zurücknehmen</button></>}>
      <p class="still-text">Das Soll „{String(p.soll.werte.name ?? 'Soll')}“ wird zurückgenommen. Der Plan ist danach wieder ein Entwurf: ohne Soll-Balken, auch ein älteres Soll gilt nicht wieder.</p>
      <label class="feld"><span>Begründung (Pflicht, steht im Verlauf)</span><textarea rows={3} value={grund()} onInput={(e) => setGrund(e.currentTarget.value)} placeholder="z. B. versehentlich vor Baubeginn festgehalten" /></label>
    </Dialog>
  );
}
