// Aufmaß der Firma einlesen (Excel/CSV): Datei wählen → Vorschau je Position (bisher → neu, abwählbar) → „Übernehmen“
// schreibt „Menge laut Firma“ zur Rechnung, ein Rückgängig für alles. Gelesen wird im Gerät – die Datei geht nirgends hin.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { aufmassAusZeilen, type AufmassLesung, type AufmassTreffer } from '../module/ava/aufmasslesen';
import { Dialog } from './baukasten/dialog';
import { ausfuehrenMehrere } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { tabelleWaehlen } from './baukasten/dateiwahl';

const zahlText = (n: unknown) => (n == null || n === '' ? '' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 }));

/** mengen: die Mengen laut Firma der Rechnung je Position (Einträge „rechnungsmenge“). */
export function AufmassEinlesen(p: { lv: Zeile; rechnung: Zeile; positionen: Zeile[]; mengen: Map<string, Zeile> }) {
  const [offen, setOffen] = createSignal<{ name: string; l: AufmassLesung } | null>(null);
  const waehlen = () => {
    tabelleWaehlen((name, zeilen) => setOffen({ name, l: aufmassAusZeilen(zeilen, p.positionen) }));
  };
  return (
    <>
      <button type="button" class="knopf" onClick={waehlen} title="Aufmaß der Firma aus Excel oder CSV: Spalten „OZ“ und „Menge“">Aufmaß einlesen</button>
      <Show when={offen()}>{(o) => <Fenster name={o().name} l={o().l} {...p} zu={() => setOffen(null)} />}</Show>
    </>
  );
}

function Fenster(p: { name: string; l: AufmassLesung; lv: Zeile; rechnung: Zeile; positionen: Zeile[]; mengen: Map<string, Zeile>; zu: () => void }) {
  const [aus, setAus] = createSignal<Set<string>>(new Set());
  const befehle = createMemo(() => mengenBefehle(p.l.treffer.filter((t) => !aus().has(t.position)), p.lv, p.rechnung.id, p.mengen));
  const uebernehmen = () => {
    if (befehle().length) ausfuehrenMehrere(befehle(), `Aufmaß ${p.name} eingelesen`);
    hinweis(`${befehle().length} ${befehle().length === 1 ? 'Menge' : 'Mengen'} übernommen – ein Rückgängig nimmt alles zurück.`);
    p.zu();
  };
  return (
    <Dialog titel={`Aufmaß einlesen – ${p.name}`} gross onAbbrechen={p.zu} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={p.zu}>Abbrechen</button>
        <button class="knopf haupt" disabled={!befehle().length} onClick={uebernehmen}>Übernehmen ({befehle().length})</button></>}>
      <div class="einlesen">
        <p class="still-text">Gelesen: Spalte „{p.l.ozSpalte}“ als Ordnungszahl, „{p.l.mengeSpalte}“ als Menge. Mehrere Zeilen einer Position werden addiert.</p>
        <MengenTabelle treffer={p.l.treffer} fremd={p.l.fremd} positionen={p.positionen} mengen={p.mengen} aus={aus()} setAus={setAus} />
      </div>
    </Dialog>
  );
}

/** Befehle für „Menge laut Firma“ einer Rechnung: nur, wo sich etwas ändert; fehlt der Eintrag, wird er angelegt. */
export function mengenBefehle(treffer: AufmassTreffer[], lv: Zeile, rechnung: string, mengen: Map<string, Zeile>): Vorlage[] {
  return treffer.filter((t) => mengen.get(t.position)?.werte.menge !== t.menge).map((t): Vorlage => {
    const a = mengen.get(t.position);
    return a ? { objekt: 'rechnungsmenge', art: 'aendern', objektId: a.id, werte: { menge: t.menge } }
      : { objekt: 'rechnungsmenge', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv.werte.projekt ?? null, rechnung, position: t.position, menge: t.menge } };
  });
}

/** Vorschau je Position: bisher → neu, abwählbar; dazu die OZ ohne passende Position. */
export function MengenTabelle(p: { treffer: AufmassTreffer[]; fremd: string[]; positionen: Zeile[]; mengen: Map<string, Zeile>; aus: Set<string>; setAus: (s: Set<string>) => void }) {
  const kurz = (id: string) => String(p.positionen.find((q) => q.id === id)?.werte.kurztext ?? '');
  const bisher = (id: string) => p.mengen.get(id)?.werte.menge;
  return (
    <>
      <Show when={p.treffer.length} fallback={<p class="feld-fehler">Keine Ordnungszahl der Datei passt zu einer Position dieses LV.</p>}>
        <div class="einlesen-liste">
          <table class="einlesen-tabelle">
            <thead><tr><th /><th>OZ</th><th>Kurztext</th><th class="zahl">bisher</th><th class="zahl">neu</th></tr></thead>
            <tbody>
              <For each={p.treffer}>{(t) => (
                <tr classList={{ aus: p.aus.has(t.position), schon: bisher(t.position) === t.menge }}>
                  <td><input type="checkbox" checked={!p.aus.has(t.position)} aria-label={`${t.oz} übernehmen`}
                    onChange={(e) => { const s = new Set(p.aus); if (e.currentTarget.checked) s.delete(t.position); else s.add(t.position); p.setAus(s); }} /></td>
                  <td>{t.oz}</td><td>{kurz(t.position)}</td>
                  <td class="zahl">{zahlText(bisher(t.position))}</td>
                  <td class="zahl" title={t.zeilen > 1 ? `Summe aus ${t.zeilen} Zeilen` : undefined}>{zahlText(t.menge)}{t.zeilen > 1 ? ` (${t.zeilen})` : ''}</td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </Show>
      <Show when={p.fremd.length}><p class="feld-fehler">Ohne passende Position ({p.fremd.length}): {p.fremd.join(', ')}</p></Show>
    </>
  );
}
