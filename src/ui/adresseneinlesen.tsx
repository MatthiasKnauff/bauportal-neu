// Adressen einlesen (wie im bisherigen Bauportal): Datei wählen (.xlsx, .csv) → Spalten zuordnen (je Spalte ein Knopf mit
// Beispielwert) → Vorschau je Kontakt (☑, „schon da“ → ergänzen · überspringen · doppelt) → „Einlesen“: ein Rückgängig für alles.
// Gelesen wird im Gerät – die Datei geht nirgends hin.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { tabelleLesen, type Tabelle } from '../kern/tabellendatei';
import { ZIELE, ergaenzung, kontakteAus, zuordnungVorschlagen, type Aktion } from '../module/adressen/einlesen';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import type { Vorlage } from '../kern/befehl';
import { TABELLEN, dateiWaehlen } from './baukasten/dateiwahl';

const [offen, setOffen] = createSignal<{ name: string; t: Tabelle } | null>(null);
const AKTIONEN: { wert: Aktion; titel: string }[] = [{ wert: 'ergaenzen', titel: 'ergänzen' }, { wert: 'ueberspringen', titel: 'überspringen' }, { wert: 'doppelt', titel: 'doppelt anlegen' }];

export function adressenEinlesen(): void {
  dateiWaehlen(TABELLEN, async (d) => { setOffen({ name: d.name, t: await tabelleLesen(d.name, new Uint8Array(await d.arrayBuffer())) }); });
}

function EinlesenFenster(p: { name: string; t: Tabelle }) {
  const [zuordnung, setZuordnung] = createSignal(zuordnungVorschlagen(p.t.kopf));
  const [aus, setAus] = createSignal<Set<number>>(new Set());              // abgewählte Zeilen
  const [aktion, setAktion] = createSignal<Record<number, Aktion>>({});    // geänderte Aktion bei „schon da“
  const vorschlaege = createMemo(() => kontakteAus(p.t.zeilen, zuordnung(), lebende('kontakt')));
  const aktionVon = (i: number) => aktion()[i] ?? vorschlaege()[i]!.aktion;
  const zaehl = createMemo(() => {
    const z = { neu: 0, ergaenzen: 0, ueberspringen: 0 };
    vorschlaege().forEach((v, i) => { if (aus().has(i)) return; const a = aktionVon(i); if (a === 'ueberspringen') z.ueberspringen++; else if (a === 'ergaenzen') z.ergaenzen++; else z.neu++; });
    return z;
  });
  const beispiel = (i: number) => p.t.zeilen.find((z) => z[i])?.[i] ?? '';
  const einlesen = () => {
    const befehle = vorschlaege().flatMap((v, i): Vorlage[] => {
      if (aus().has(i)) return [];
      const a = aktionVon(i);
      if (a === 'ueberspringen') return [];
      if (a === 'ergaenzen' && v.vorhanden) { const w = ergaenzung(sicht.kontakt?.[v.vorhanden]?.werte ?? {}, v.werte); return Object.keys(w).length ? [{ objekt: 'kontakt', art: 'aendern', objektId: v.vorhanden, werte: w }] : []; }
      return [{ objekt: 'kontakt', art: 'anlegen', objektId: neueKennung(), werte: v.werte }];
    });
    if (befehle.length) ausfuehrenMehrere(befehle, `${p.name} eingelesen`);
    hinweis(`${zaehl().neu} angelegt, ${zaehl().ergaenzen} ergänzt${zaehl().ueberspringen ? `, ${zaehl().ueberspringen} übersprungen` : ''} – ein Rückgängig nimmt alles zurück.`);
    setOffen(null);
  };
  const feldOptionen = [{ wert: '', titel: '– nicht einlesen –' }, ...ZIELE.map((z) => ({ wert: z.feld, titel: z.titel }))];
  return (
    <Dialog titel={`Adressen einlesen – ${p.name}`} gross onAbbrechen={() => setOffen(null)} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={() => setOffen(null)}>Abbrechen</button>
        <button class="knopf haupt" disabled={!zaehl().neu && !zaehl().ergaenzen} onClick={einlesen}>Einlesen ({zaehl().neu} neu{zaehl().ergaenzen ? `, ${zaehl().ergaenzen} ergänzen` : ''})</button></>}>
      <div class="einlesen">
        <h3>Spalten zuordnen</h3>
        <div class="einlesen-spalten">
          <For each={p.t.kopf}>{(k, i) => (
            <div class="einlesen-spalte" classList={{ leer: !zuordnung()[i()] }}>
              <b>{k || `Spalte ${i() + 1}`}</b><small>{beispiel(i())}</small>
              <Auswahlliste titel={`Spalte ${k}`} wert={zuordnung()[i()] ?? ''} optionen={feldOptionen}
                onWert={(w) => setZuordnung(zuordnung().map((x, j) => (j === i() ? w : x === w && w ? '' : x)))} />
            </div>
          )}</For>
        </div>
        <Show when={!zuordnung().includes('name') && !zuordnung().includes('ansprechpartner')}><p class="feld-fehler">Eine Spalte muss „Firma / Name“ (oder „Ansprechpartner:in“) sein.</p></Show>
        <h3>Vorschau – {vorschlaege().length} Kontakte</h3>
        <div class="einlesen-liste">
          <table class="einlesen-tabelle">
            <thead><tr><th /><th>Firma / Name</th><th>Ort</th><th>E-Mail</th><th>Gewerk</th><th /></tr></thead>
            <tbody>
              <For each={vorschlaege()}>{(v, i) => (
                <tr classList={{ schon: !!v.vorhanden, aus: aus().has(i()) }}>
                  <td><input type="checkbox" checked={!aus().has(i())} aria-label={`${String(v.werte.name)} einlesen`} onChange={(e) => { const s = new Set(aus()); if (e.currentTarget.checked) s.delete(i()); else s.add(i()); setAus(s); }} /></td>
                  <td>{String(v.werte.name ?? '')}</td><td>{String(v.werte.ort ?? '')}</td><td>{String(v.werte.email ?? '')}</td><td>{String(v.werte.gewerk ?? '')}</td>
                  <td><div class="einlesen-aktion"><Show when={v.vorhanden} fallback={<span class="still-text klein-text">neu</span>}>
                    <span class="still-text klein-text">schon da · </span>
                    <Auswahlliste titel={`${String(v.werte.name)}: schon da`} wert={aktionVon(i())} optionen={AKTIONEN} onWert={(w) => setAktion({ ...aktion(), [i()]: w as Aktion })} />
                  </Show></div></td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
        <p class="still-text klein-text">„Ergänzen“ füllt nur leere Felder – was im Bauportal schon steht, bleibt. Danach hilft „Aufräumen“ bei doppelten Gewerken und Firmen.</p>
      </div>
    </Dialog>
  );
}

export function AdressenEinlesen() {
  return <Show when={offen()}>{(o) => <EinlesenFenster name={o().name} t={o().t} />}</Show>;
}
