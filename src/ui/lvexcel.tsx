// LV als Excel ausgeben und aus Excel/CSV einlesen (Rechnung in module/ava/lvexcel.ts). Einlesen zeigt erst, was kommt
// (Titel, Positionen, schon vorhandene OZ), und legt dann alles mit einem Rückgängig an.
// Dazu das Angebot einer Bieter:in als Excel (OZ und EP) – wie das X84, nur aus einer Tabelle.
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Vorlage } from '../kern/befehl';
import { xlsxSchreiben } from '../kern/xlsx';
import { lvAlsTabelle, lvAusTabelle, preiseAusTabelle, type LvEinlesung, type PreisEinlesung } from '../module/ava/lvexcel';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { herunterladen } from './baukasten/herunterladen';
import { ausfuehrenMehrere, lebende, verweisname } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { tabelleWaehlen } from './baukasten/dateiwahl';

const lvName = (lv: Zeile) => [lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ') || 'LV';
const positionen = (lv: string) => lebende('lv_position').filter((q) => q.werte.lv === lv && !q.werte.nachtrag);

export function lvExcelAusgeben(lv: Zeile): void {
  herunterladen(new Blob([xlsxSchreiben(lvAlsTabelle(positionen(lv.id)), 'LV')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `LV ${lvName(lv)}.xlsx`);
}

const [einlesen, setEinlesen] = createSignal<{ lv: Zeile; datei: string; e: LvEinlesung } | null>(null);
export function lvExcelEinlesen(lv: Zeile): void {
  tabelleWaehlen((datei, zeilen) => setEinlesen({ lv, datei, e: lvAusTabelle(zeilen, positionen(lv.id)) }));
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

// ---------- Angebot aus Excel: EP je OZ für eine Bieter:in des LV ----------
type AngebotEinlesen = { lv: Zeile; angebot: string | null; datei?: string; e?: PreisEinlesung };
const [angebotEin, setAngebotEin] = createSignal<AngebotEinlesen | null>(null);
/** Öffnet das Einlesen; vorgewählt die Bieter:in, deren Spalte gerade gewählt ist. */
export const angebotExcelEinlesen = (lv: Zeile, angebot: string | null) => setAngebotEin({ lv, angebot });
const angeboteDes = (lv: string) => lebende('angebot').filter((a) => a.werte.lv === lv);

export function AngebotExcelFenster(): JSX.Element {
  const datei = () => {
    const x = angebotEin()!;
    tabelleWaehlen((datei, zeilen) => setAngebotEin({ ...x, datei, e: preiseAusTabelle(zeilen, positionen(x.lv.id)) }));
  };
  const uebernehmen = () => {
    const x = angebotEin()!; if (!x.angebot || !x.e) return; setAngebotEin(null);
    const da = new Map(lebende('angebot_preis').filter((p) => p.werte.angebot === x.angebot).map((p) => [String(p.werte.position), p.id]));
    const bieter = verweisname('kontakt', String(lebende('angebot').find((a) => a.id === x.angebot)?.werte.bieter ?? ''));
    ausfuehrenMehrere(x.e.preise.map((p): Vorlage => (da.has(p.position)
      ? { objekt: 'angebot_preis', art: 'aendern' as const, objektId: da.get(p.position)!, werte: { ep: p.ep } }
      : { objekt: 'angebot_preis', art: 'anlegen' as const, objektId: neueKennung(), werte: { projekt: x.lv.werte.projekt ?? null, angebot: x.angebot, position: p.position, ep: p.ep } })), `Angebot aus Excel: ${bieter}`);
    hinweis(`${x.e.preise.length} Preise von ${bieter} eingelesen – rückgängig mit Strg+Z.`);
  };
  return (
    <Show when={angebotEin()}>{(x) => (
      <Dialog titel="Angebot aus Excel einlesen" onAbbrechen={() => setAngebotEin(null)}
        knoepfe={<><button type="button" class="knopf" onClick={() => setAngebotEin(null)}>Abbrechen</button><button type="button" class="knopf haupt" disabled={!x().angebot || !x().e?.preise.length} onClick={uebernehmen}>Übernehmen{x().e ? ` (${x().e!.preise.length})` : ''}</button></>}>
        <div class="formular">
          <Auswahlliste titel="Bieter:in" platzhalter="Bieter:in wählen …" wert={x().angebot}
            optionen={angeboteDes(x().lv.id).map((a) => ({ wert: a.id, titel: verweisname('kontakt', String(a.werte.bieter ?? '')) }))} onWert={(w) => setAngebotEin({ ...x(), angebot: w ? String(w) : null })} />
          <p class="still-text">Die Tabelle braucht die Spalten „OZ“ und „EP“ (oder „Einheitspreis“). Die Preise gehen an die Positionen mit derselben OZ; vorhandene Preise dieser Bieter:in werden ersetzt. Neue Firmen erst mit „Bieter:in“ dazunehmen.</p>
          <div><button type="button" class="knopf" onClick={datei}>{x().datei ? `Andere Datei … (${x().datei})` : 'Datei wählen …'}</button></div>
          <Show when={x().e}>{(e) => (
            <p>{e().preise.length} Preise zu Positionen des LV{e().ohnePreis ? `, ${e().ohnePreis} Positionen ohne Preis` : ''}.
              <Show when={e().fremd.length}><br /><span class="still-text">Ohne passende OZ im LV ({e().fremd.length}): {e().fremd.slice(0, 12).join(', ')}{e().fremd.length > 12 ? ' …' : ''}</span></Show></p>)}</Show>
        </div>
      </Dialog>)}</Show>
  );
}
