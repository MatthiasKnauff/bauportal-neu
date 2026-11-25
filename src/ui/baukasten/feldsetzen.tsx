// Baustein „Für alle setzen“: ein Feld für alle gewählten Einträge auf einen Wert setzen – derselbe für jedes Objekt
// (Gebäudemodell, Bauzeitenplan …). Feld wählen, Wert mit dem Baustein „Feld“ eintragen, OK setzt ihn bei allen; ein
// „Zurück“ nimmt die Änderung für alle zurück. Felder, die eindeutig sein müssen oder verborgen sind, stehen nicht zur Wahl.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Feld, Wert } from '../../kern/modell';
import type { Vorlage } from '../../kern/befehl';
import { ausfuehrenMehrere, rueckgaengig, sicht } from '../unterbau/abgleich';
import { modell } from '../unterbau/api';
import { hinweis } from '../unterbau/meldungen';
import { Dialog } from './dialog';
import { FeldEingabe } from './feld';

const [offen, setOffen] = createSignal<{ objekt: string; ids: string[]; fest: string[] } | null>(null);
/** fest: Felder, die der Zusammenhang vorgibt (Projekt, Version) – nicht zur Wahl. */
export const feldSetzenOeffnen = (objekt: string, ids: string[], fest: string[] = []) => setOffen({ objekt, ids, fest });

function Fenster(p: { objekt: string; ids: string[]; fest: string[] }) {
  const m = modell(p.objekt);
  const felder = m.felder.filter((f) => !f.verborgen && !f.eindeutig && !p.fest.includes(f.name) && f.name !== m.anzeigeFeld);
  const [name, setName] = createSignal('');
  const feld = createMemo((): Feld | undefined => felder.find((f) => f.name === name()));
  const [wert, setWert] = createSignal<Wert>(null);
  const n = p.ids.length, zu = () => setOffen(null);
  const ok = () => {
    const f = feld(); if (!f) return;
    const w = wert() ?? null;
    const vs = p.ids.filter((id) => { const z = sicht[p.objekt]?.[id]; return z && !z.geloescht && (z.werte[f.name] ?? null) !== w; })
      .map((id): Vorlage => ({ objekt: p.objekt, art: 'aendern', objektId: id, werte: { [f.name]: w } }));
    zu();
    if (!vs.length) { hinweis('Nichts zu ändern – alle gewählten hatten den Wert schon.'); return; }
    ausfuehrenMehrere(vs, `${f.titel} für ${vs.length} ${vs.length === 1 ? m.titel : m.titelMehrzahl} gesetzt`);
    hinweis(`${f.titel} für ${vs.length} ${vs.length === 1 ? m.titel : m.titelMehrzahl} gesetzt.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  return (
    <Dialog titel={`Ändern – ${n} ${n === 1 ? m.titel : m.titelMehrzahl}`} breit onAbbrechen={zu} geaendert={() => !!name()}
      knoepfe={<><button class="knopf" data-abbrechen onClick={zu}>Abbrechen</button><button class="knopf haupt" disabled={!feld()} onClick={ok}>OK</button></>}>
      {/* die Felder direkt im Fenster (eine aufklappende Liste würde im Fenster abgeschnitten) */}
      <p class="still-text">Was ändern?</p>
      <div class="wahl-chips" role="radiogroup" aria-label="Feld">
        <For each={felder}>{(f) => <button type="button" role="radio" aria-checked={name() === f.name} classList={{ aktiv: name() === f.name }} onClick={() => { setName(f.name); setWert(null); }}>{f.titel}</button>}</For>
      </div>
      <Show when={feld()} keyed>{(f) => (
        <FeldEingabe feld={{ ...f, pflicht: false, titel: `Neuer Wert: ${f.titel}` }} wert={wert()} objekt={p.objekt} sofort onWert={setWert} />
      )}</Show>
      <p class="still-text klein-text">Gilt für alle {n} gewählten. Leer lassen setzt das Feld leer. „Zurück“ nimmt die Änderung für alle zurück.</p>
    </Dialog>
  );
}

/** Einmal in der App eingehängt. */
export function FeldSetzen() {
  return <Show when={offen()} keyed>{(o) => <Fenster objekt={o.objekt} ids={o.ids} fest={o.fest} />}</Show>;
}
