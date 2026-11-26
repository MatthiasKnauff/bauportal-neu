// Aufmaß der Firma einlesen (Excel/CSV): Datei wählen → Vorschau je Position (bisher → neu, abwählbar) → „Übernehmen“
// schreibt „Menge laut Firma“, ein Rückgängig für alles. Gelesen wird im Gerät – die Datei geht nirgends hin.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { tabelleLesen } from '../kern/tabellendatei';
import type { Vorlage, Zeile } from '../kern/befehl';
import { aufmassAusZeilen, type AufmassLesung } from '../module/ava/aufmasslesen';
import { Dialog } from './baukasten/dialog';
import { ausfuehrenMehrere } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const zahlText = (n: unknown) => (n == null || n === '' ? '' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 }));

export function AufmassEinlesen(p: { lv: Zeile; positionen: Zeile[]; aufmasse: Map<string, Zeile> }) {
  const [offen, setOffen] = createSignal<{ name: string; l: AufmassLesung } | null>(null);
  const waehlen = () => {
    const wahl = document.createElement('input');
    wahl.type = 'file'; wahl.accept = '.xlsx,.xlsm,.csv,.txt';
    wahl.onchange = async () => {
      const d = wahl.files?.[0]; if (!d) return;
      try {
        const t = await tabelleLesen(d.name, new Uint8Array(await d.arrayBuffer()));
        setOffen({ name: d.name, l: aufmassAusZeilen([t.kopf, ...t.zeilen], p.positionen) });
      } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
    };
    wahl.click();
  };
  return (
    <>
      <button type="button" class="knopf" onClick={waehlen} title="Aufmaß der Firma aus Excel oder CSV: Spalten „OZ“ und „Menge“">Aufmaß einlesen</button>
      <Show when={offen()}>{(o) => <Fenster name={o().name} l={o().l} {...p} zu={() => setOffen(null)} />}</Show>
    </>
  );
}

function Fenster(p: { name: string; l: AufmassLesung; lv: Zeile; positionen: Zeile[]; aufmasse: Map<string, Zeile>; zu: () => void }) {
  const [aus, setAus] = createSignal<Set<string>>(new Set());
  const kurz = (id: string) => String(p.positionen.find((q) => q.id === id)?.werte.kurztext ?? '');
  const bisher = (id: string) => p.aufmasse.get(id)?.werte.menge_firma;
  const geaendert = createMemo(() => p.l.treffer.filter((t) => !aus().has(t.position) && bisher(t.position) !== t.menge));
  const uebernehmen = () => {
    const befehle = geaendert().map((t): Vorlage => {
      const a = p.aufmasse.get(t.position);
      return a ? { objekt: 'aufmass', art: 'aendern', objektId: a.id, werte: { menge_firma: t.menge } }
        : { objekt: 'aufmass', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.lv.werte.projekt ?? null, lv: p.lv.id, position: t.position, menge_firma: t.menge } };
    });
    if (befehle.length) ausfuehrenMehrere(befehle, `Aufmaß ${p.name} eingelesen`);
    hinweis(`${befehle.length} ${befehle.length === 1 ? 'Menge' : 'Mengen'} übernommen – ein Rückgängig nimmt alles zurück.`);
    p.zu();
  };
  return (
    <Dialog titel={`Aufmaß einlesen – ${p.name}`} gross onAbbrechen={p.zu} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={p.zu}>Abbrechen</button>
        <button class="knopf haupt" disabled={!geaendert().length} onClick={uebernehmen}>Übernehmen ({geaendert().length})</button></>}>
      <div class="einlesen">
        <p class="still-text">Gelesen: Spalte „{p.l.ozSpalte}“ als Ordnungszahl, „{p.l.mengeSpalte}“ als Menge. Mehrere Zeilen einer Position werden addiert.</p>
        <Show when={p.l.treffer.length} fallback={<p class="feld-fehler">Keine Ordnungszahl der Datei passt zu einer Position dieses LV.</p>}>
          <div class="einlesen-liste">
            <table class="einlesen-tabelle">
              <thead><tr><th /><th>OZ</th><th>Kurztext</th><th class="zahl">bisher</th><th class="zahl">neu</th></tr></thead>
              <tbody>
                <For each={p.l.treffer}>{(t) => (
                  <tr classList={{ aus: aus().has(t.position), schon: bisher(t.position) === t.menge }}>
                    <td><input type="checkbox" checked={!aus().has(t.position)} aria-label={`${t.oz} übernehmen`}
                      onChange={(e) => { const s = new Set(aus()); if (e.currentTarget.checked) s.delete(t.position); else s.add(t.position); setAus(s); }} /></td>
                    <td>{t.oz}</td><td>{kurz(t.position)}</td>
                    <td class="zahl">{zahlText(bisher(t.position))}</td>
                    <td class="zahl" title={t.zeilen > 1 ? `Summe aus ${t.zeilen} Zeilen` : undefined}>{zahlText(t.menge)}{t.zeilen > 1 ? ` (${t.zeilen})` : ''}</td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={p.l.fremd.length}><p class="feld-fehler">Ohne passende Position ({p.l.fremd.length}): {p.l.fremd.join(', ')}</p></Show>
      </div>
    </Dialog>
  );
}
