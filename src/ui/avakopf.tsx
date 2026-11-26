// AVA: ein gewähltes LV für alle Ansichten der App (LV bearbeiten, Versand, Preisspiegel, Aufträge, Aufmaß …) und oben sein Kopf –
// Bezeichnung, Stand, an wen vergeben, Eckdaten; darunter der Ablauf (Abfolge-Leiste), wie weit das LV ist. Wie im bisherigen Bauportal.
import { Show, createEffect, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { avaAbfolge, avaSchrittVon } from '../module/ava/abfolge';
import { LV_STATUS } from '../module/ava/beipackzettel';
import type { Anpassung, Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { anzeige } from './baukasten/feld';
import { Zeichen } from './baukasten/zeichen';
import { projektId } from './projekt';
import { springeZu } from './sprung';
import { ausfuehren, lebende, sicht } from './unterbau/abgleich';
import { darf, modell } from './unterbau/api';

const [aktivesLv, setAktivesLv] = createSignal<string | null>(null);

/** Das gewählte LV des Projekts – sonst sein erstes (nach Nummer). */
function gewaehltesLv(): Zeile | undefined {
  const pr = projektId(), imProjekt = (z: Zeile | undefined) => (z && !z.geloescht && z.werte.projekt === pr ? z : undefined);
  return imProjekt(sicht.lv?.[aktivesLv() ?? ''])
    ?? lebende('lv').filter((z) => z.werte.projekt === pr).sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true }))[0];
}
/** Das LV, um das es in der Ansicht geht: das dort gewählte (wenn die Ansicht LVs zeigt), sonst das gewählte LV der AVA. */
export function lvVon(p: Mitte): Zeile | undefined {
  const z = sicht.lv?.[p.gewaehlt() ?? ''];
  return z && !z.geloescht && z.werte.projekt === projektId() ? z : gewaehltesLv();
}
/** Ein LV wählen – gilt dann in allen Ansichten der AVA. */
export const lvWaehlen = (p: Mitte, id: string) => { setAktivesLv(id); p.onWahl(id); };

function AvaKopf(p: Mitte): JSX.Element {
  // in Ansichten, die LVs zeigen, gilt das dort gewählte für die ganze App
  createEffect(() => { const id = p.gewaehlt(); if (id && sicht.lv?.[id]) setAktivesLv(id); });
  const lv = () => lvVon(p);
  const m = () => modell('lv');
  const feld = (n: string) => m().felder.find((f) => f.name === n)!;
  const auftrag = () => (lv() ? lebende('angebot').find((a) => a.werte.lv === lv()!.id && a.werte.beauftragt === true) : undefined);
  const angaben = () => (lv() ? ['gewerk', 'abgabe', 'bindefrist', 'ausfuehrung_beginn'].map((n) => [feld(n).titel.replace(/ (bis|nach VOB\/C)$/, ''), anzeige(feld(n), lv()!.werte[n])] as const).filter(([, w]) => w) : []);
  return (
    <Show when={lv()}>{(z) => (
      <div class="ansicht-kopf" aria-label="Leistungsverzeichnis">
        <h2>{[z().werte.nummer, z().werte.name].filter(Boolean).join(' · ')}</h2>
        <span class="kopf-angabe"><small>Stand</small><Auswahlliste titel="Stand" wert={String(z().werte.status ?? 'bearbeitung')} optionen={LV_STATUS} gesperrt={!darf('lv', 'schreiben')}
          onWert={(w) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: z().id, werte: { status: w } }, 'Stand des LV')} /></span>
        <Show when={auftrag()} fallback={<span class="kopf-firma offen">{z().werte.status === 'aufgehoben' ? 'aufgehoben – nicht vergeben' : 'noch nicht vergeben'}</span>}>
          {(a) => <span class="kopf-firma">{anzeige(modell('angebot').felder.find((f) => f.name === 'bieter')!, a().werte.bieter)}{a().werte.auftragsdatum ? ` · beauftragt am ${anzeige(modell('angebot').felder.find((f) => f.name === 'auftragsdatum')!, a().werte.auftragsdatum)}` : ''}</span>}
        </Show>
        {angaben().map(([k, w]) => <span class="kopf-angabe"><small>{k}</small>{w}</span>)}
        <span class="kopf-rechts">
          <button type="button" class="knopf klein" title="Projektdaten: Bauherr:in, Baustelle, Beteiligte, Termine – gelten für alle Apps des Projekts" onClick={() => springeZu('projekt', String(z().werte.projekt))}><Zeichen name="bearbeiten" groesse={14} /> Projektdaten</button>
          <button type="button" class="knopf klein" title="Ausschreibungsdaten dieses LV: Vergabenummer, Fristen, Ausführung, Kostenansatz" onClick={() => springeZu('lv', z().id, { modul: 'ava', ansicht: 'lvs' })}><Zeichen name="bearbeiten" groesse={14} /> Ausschreibungsdaten</button>
        </span>
      </div>
    )}</Show>
  );
}

/** Wie weit das LV ist – aus seinem Inhalt (Versand, Angebote, Besprechung, Auftrag, Aufmaß, Rechnungen). */
function abfolge(p: Mitte, ansicht: string) {
  const z = lvVon(p);
  if (!z) return undefined;
  const ang = lebende('angebot').filter((a) => a.werte.lv === z.id);
  const { schritte, stand } = avaAbfolge({
    status: String(z.werte.status ?? 'bearbeitung'),
    angeschrieben: ang.length, eingegangen: ang.filter((a) => a.werte.eingang).length,
    besprochen: lebende('besprechung').some((b) => b.werte.lv === z.id && b.werte.stand === 'abgeschlossen'),
    vergeben: ang.some((a) => a.werte.beauftragt === true),
    aufmass: lebende('aufmass').some((a) => a.werte.lv === z.id),
    abgerechnet: lebende('rechnung').some((r) => r.werte.lv === z.id),
  });
  return { schritte, stand, hier: avaSchrittVon(ansicht) };
}

/** Für jede Ansicht der AVA: oben der Kopf des LV und der Ablauf. */
export const AVA_OBEN: Anpassung = { kopf: (p) => <AvaKopf {...p} />, abfolge };
