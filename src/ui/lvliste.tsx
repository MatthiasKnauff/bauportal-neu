// Baustein „LV-Liste“ (wie im bisherigen Bauportal neben Versand, Besprechung …): das Projekt mit der Summe aller LVs, darunter die
// LVs mit Zahl der Positionen und Summe; Klick wählt das LV für die ganze AVA. Daneben der Inhalt der Ansicht.
import { For, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { summeGeschaetzt } from '../module/ava/rechnung';
import { lvFolge, lvVon, lvWaehlen } from './avakopf';
import type { Mitte } from './baukasten/anpassung';
import { Ordner } from './baukasten/baum';
import { projektId } from './projekt';
import { lebende, sicht } from './unterbau/abgleich';

const geld = (n: number) => (n ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const positionen = (lv: string) => lebende('lv_position').filter((q) => q.werte.lv === lv && !q.werte.nachtrag);

export function LvListe(p: { m: Mitte; zusatz?: (lv: Zeile) => string; children: JSX.Element }): JSX.Element {
  const lvs = () => lebende('lv').filter((l) => l.werte.projekt === projektId() && !l.werte.archiviert).sort(lvFolge);
  const projekt = () => sicht.projekt?.[projektId() ?? '']?.werte;
  const summe = (l: Zeile) => summeGeschaetzt(positionen(l.id));
  return (
    <div class="lv-geteilt">
      <nav class="lv-liste" aria-label="Leistungsverzeichnisse">
        <div class="lv-liste-projekt"><Ordner offen /><b>{[projekt()?.nummer, projekt()?.name].filter(Boolean).join(' ')}</b><span>{geld(lvs().reduce((s, l) => s + summe(l), 0))}</span></div>
        <For each={lvs()}>{(l) => (
          <button type="button" class="lv-liste-lv" classList={{ an: lvVon(p.m)?.id === l.id }} aria-current={lvVon(p.m)?.id === l.id ? 'true' : undefined} onClick={() => lvWaehlen(p.m, l.id)}>
            <Ordner /><span class="lv-liste-text"><b>{[l.werte.nummer, l.werte.name].filter(Boolean).join(' ')}</b>
              <small>{positionen(l.id).filter((q) => q.werte.art !== 'titel' && q.werte.art !== 'hinweis').length} Pos.{p.zusatz ? ` · ${p.zusatz(l)}` : ''}</small></span>
            <span class="lv-liste-summe">{geld(summe(l))}</span>
          </button>)}</For>
      </nav>
      <div class="lv-geteilt-inhalt">{p.children}</div>
    </div>
  );
}
