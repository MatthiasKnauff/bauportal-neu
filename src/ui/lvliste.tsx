// Baustein „LV-Liste“ (wie im bisherigen Bauportal neben Versand, Besprechung …): das Projekt mit der Summe aller LVs, darunter die
// LVs mit Zahl der Positionen und Summe; Klick wählt das LV für die ganze AVA. Daneben der Inhalt der Ansicht.
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { summeGeschaetzt } from '../module/ava/rechnung';
import { lvFolge, lvVon, lvWaehlen } from './avakopf';
import type { Mitte } from './baukasten/anpassung';
import { Klappe, Ordner } from './baukasten/baum';
import { projektId } from './projekt';
import { ausfuehren, lebende, sicht } from './unterbau/abgleich';
import { darf } from './unterbau/api';
import { istText } from '../kern/lvarten';

const geld = (n: number) => (n ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const positionen = (lv: string) => lebende('lv_position').filter((q) => q.werte.lv === lv && !q.werte.nachtrag);

/** haken: Häkchen an den LVs (wie bisher nur im Versand – mehrere LVs auf einmal verschicken). */
export function LvListe(p: { m: Mitte; zusatz?: (lv: Zeile) => string; haken?: { an: (id: string) => boolean; onHaken: (id: string, an: boolean) => void }; children: JSX.Element }): JSX.Element {
  const lvs = () => lebende('lv').filter((l) => l.werte.projekt === projektId() && !l.werte.archiviert).sort(lvFolge);
  const projekt = () => sicht.projekt?.[projektId() ?? '']?.werte;
  const summe = (l: Zeile) => summeGeschaetzt(positionen(l.id));
  const [zu, setZu] = createSignal(false);   // Baum wie bisher: das Projekt klappt seine LVs auf und zu
  return (
    <div class="lv-geteilt">
      <nav class="lv-liste" aria-label="Leistungsverzeichnisse">
        <div class="lv-liste-projekt"><Klappe zu={zu()} titel={zu() ? 'LVs zeigen' : 'LVs zuklappen'} onKlick={() => setZu(!zu())} /><Ordner offen={!zu()} /><b>{[projekt()?.nummer, projekt()?.name].filter(Boolean).join(' ')}</b><span>{geld(lvs().reduce((s, l) => s + summe(l), 0))}</span></div>
        <Show when={!zu()}><For each={lvs()}>{(l) => (
          <div class="lv-liste-reihe"><Show when={p.haken}><input type="checkbox" class="lv-liste-haken" checked={p.haken!.an(l.id)} aria-label={`${[l.werte.nummer, l.werte.name].filter(Boolean).join(' ')} mitverschicken`}
            title="Mehrere LVs auf einmal verschicken – eine Mail je Firma" onChange={(e) => p.haken!.onHaken(l.id, e.currentTarget.checked)} /></Show>
          <button type="button" class="lv-liste-lv" classList={{ an: lvVon(p.m)?.id === l.id }} aria-current={lvVon(p.m)?.id === l.id ? 'true' : undefined} onClick={() => lvWaehlen(p.m, l.id)}>
            <i class="klappe-platz" /><Ordner /><span class="lv-liste-text"><b>{[l.werte.nummer, l.werte.name].filter(Boolean).join(' ')}</b>
              <small>{positionen(l.id).filter((q) => !istText(q.werte.art)).length} Pos.{p.zusatz ? ` · ${p.zusatz(l)}` : ''}</small></span>
            <span class="lv-liste-summe">{geld(summe(l))}</span>
          </button></div>)}</For></Show>
        <LvArchiv m={p.m} />
      </nav>
      <div class="lv-geteilt-inhalt">{p.children}</div>
    </div>
  );
}

/** Baustein „Archiv“ unter den LVs (wie bisher in jedem Baum der AVA): zugeklappt „Archiv n“, offen je archiviertem LV
 *  der Name (Klick öffnet es) und „Zurückholen“. ausser: das gerade offene LV (steht schon im Baum). */
export function LvArchiv(p: { m: Mitte; ausser?: string }): JSX.Element {
  const liste = () => lebende('lv').filter((l) => l.werte.projekt === projektId() && l.werte.archiviert && l.id !== p.ausser).sort(lvFolge);
  const [auf, setAuf] = createSignal(false);
  const zurueck = (l: Zeile) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: l.id, werte: { archiviert: false } }, `LV „${String(l.werte.name ?? '')}“ zurückholen`);
  return (
    <Show when={liste().length}>
      <div class="lv-archiv">
        <div class="lv-archiv-kopf" title="Archivierte LVs – alles bleibt erhalten" onClick={() => setAuf(!auf())}>
          <Klappe zu={!auf()} fokus titel={auf() ? 'Archiv zuklappen' : 'Archiv zeigen'} onKlick={() => setAuf(!auf())} /><Ordner offen={auf()} /><b>Archiv</b><small>{liste().length}</small></div>
        <Show when={auf()}><For each={liste()}>{(l) => (
          <div class="lv-archiv-lv"><button type="button" class="lv-archiv-name" onClick={() => lvWaehlen(p.m, l.id)}>{[l.werte.nummer, l.werte.name].filter(Boolean).join(' ')}</button>
            <Show when={darf('lv', 'schreiben')}><button type="button" class="knopf klein" title="Wieder in die Listen holen" onClick={() => zurueck(l)}>Zurückholen</button></Show></div>)}</For></Show>
      </div>
    </Show>
  );
}
