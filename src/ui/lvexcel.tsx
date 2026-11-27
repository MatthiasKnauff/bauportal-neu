// LV als Excel ausgeben und aus Excel/CSV einlesen (Rechnung in module/ava/lvexcel.ts). Einlesen zeigt erst, was kommt
// (Titel, Positionen, schon vorhandene OZ), und legt dann alles mit einem Rückgängig an.
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { tabelleLesen } from '../kern/tabellendatei';
import { xlsxSchreiben } from '../kern/xlsx';
import { lvAlsTabelle, lvAusTabelle, type LvEinlesung } from '../module/ava/lvexcel';
import { Dialog } from './baukasten/dialog';
import { herunterladen } from './baukasten/herunterladen';
import { ausfuehrenMehrere, lebende } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const lvName = (lv: Zeile) => [lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ') || 'LV';
const positionen = (lv: string) => lebende('lv_position').filter((q) => q.werte.lv === lv && !q.werte.nachtrag);

export function lvExcelAusgeben(lv: Zeile): void {
  herunterladen(new Blob([xlsxSchreiben(lvAlsTabelle(positionen(lv.id)), 'LV')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `LV ${lvName(lv)}.xlsx`);
}

const [einlesen, setEinlesen] = createSignal<{ lv: Zeile; datei: string; e: LvEinlesung } | null>(null);
export function lvExcelEinlesen(lv: Zeile): void {
  const wahl = document.createElement('input');
  wahl.type = 'file'; wahl.accept = '.xlsx,.xlsm,.csv,.txt';
  wahl.onchange = async () => {
    const d = wahl.files?.[0]; if (!d) return;
    try { const t = await tabelleLesen(d.name, new Uint8Array(await d.arrayBuffer())); setEinlesen({ lv, datei: d.name, e: lvAusTabelle([t.kopf, ...t.zeilen], positionen(lv.id)) }); }
    catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
  };
  wahl.click();
}

export function LvExcelFenster(): JSX.Element {
  const uebernehmen = () => {
    const x = einlesen()!; setEinlesen(null);
    ausfuehrenMehrere(x.e.zeilen.map((z) => ({ objekt: 'lv_position', art: 'anlegen' as const, objektId: neueKennung(), werte: { projekt: x.lv.werte.projekt ?? null, lv: x.lv.id, oz: z.oz || null, art: z.art,
      kurztext: z.kurztext, langtext: z.langtext || null, menge: z.menge, einheit: z.einheit || null, ep: z.ep } })), `Excel eingelesen: ${x.datei}`);
    hinweis(`${x.e.titel} Titel und ${x.e.positionen} Positionen eingelesen – rückgängig mit Strg+Z.`);
  };
  return (
    <Show when={einlesen()}>{(x) => (
      <Dialog titel={`Excel einlesen – ${x().datei}`} onAbbrechen={() => setEinlesen(null)}
        knoepfe={<><button type="button" class="knopf" onClick={() => setEinlesen(null)}>Abbrechen</button><button type="button" class="knopf haupt" disabled={!x().e.zeilen.length} onClick={uebernehmen}>Übernehmen ({x().e.zeilen.length})</button></>}>
        <p>Ins LV <b>{lvName(x().lv)}</b>: {x().e.titel} Titel, {x().e.positionen} Positionen{x().e.zeilen.length - x().e.titel - x().e.positionen ? `, ${x().e.zeilen.length - x().e.titel - x().e.positionen} Hinweise` : ''}.</p>
        <Show when={x().e.doppelt.length}><p class="still-text">Schon im LV, nicht noch einmal ({x().e.doppelt.length}): {x().e.doppelt.slice(0, 12).join(', ')}{x().e.doppelt.length > 12 ? ' …' : ''}</p></Show>
        <ul class="still-text klein-text"><For each={x().e.zeilen.slice(0, 8)}>{(z) => <li>{z.oz} {z.kurztext}{z.menge != null ? ` · ${z.menge.toLocaleString('de-DE')} ${z.einheit}` : ''}</li>}</For>{x().e.zeilen.length > 8 ? <li>…</li> : null}</ul>
      </Dialog>)}</Show>
  );
}
