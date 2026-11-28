// AVA: ein gewähltes LV für alle Ansichten der App (LV bearbeiten, Versand, Preisspiegel, Aufträge, Aufmaß …) und oben sein Kopf –
// Bezeichnung, Stand, an wen vergeben, Eckdaten; darunter der Ablauf (Abfolge-Leiste), wie weit das LV ist. Wie im bisherigen Bauportal.
import { For, Show, createEffect, createMemo, createSignal, onCleanup, useContext, type JSX } from 'solid-js';
import { angeboteVon, lvZahlen, positionenVon } from './avadaten';
import { istZuschlag, zaehlt } from '../module/ava/rechnung';
import { AppUmgebung } from './baukasten/rahmen';
import type { Zeile } from '../kern/befehl';
import { avaAbfolge, avaSchrittVon } from '../module/ava/abfolge';
import { LV_STATUS, NICHT_GRUENDE } from '../module/ava/beipackzettel';
import type { Anpassung, Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { anzeige } from './baukasten/feld';
import { Zeichen } from './baukasten/zeichen';
import { projektId } from './projekt';
import { karteOeffnen } from './kartendialog';
import { ausfuehren, ebenenWerte, lebende, sicht, wirksameWerte } from './unterbau/abgleich';
import { geerbt, istLeer } from '../kern/erben';
import type { Wert } from '../kern/modell';
import { darf, modell } from './unterbau/api';

const [aktivesLv, setAktivesLv] = createSignal<string | null>(null);
export { setAktivesLv };

/** Reihenfolge der LVs: nach Nummer, archivierte am Ende. */
export const lvFolge = (a: Zeile, b: Zeile) => Number(!!a.werte.archiviert) - Number(!!b.werte.archiviert) || String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true });
/** Das gewählte LV des Projekts – sonst sein erstes (nach Nummer). */
export function gewaehltesLv(): Zeile | undefined {
  const pr = projektId(), imProjekt = (z: Zeile | undefined) => (z && !z.geloescht && z.werte.projekt === pr ? z : undefined);
  return imProjekt(sicht.lv?.[aktivesLv() ?? ''])
    ?? lebende('lv').filter((z) => z.werte.projekt === pr).sort(lvFolge)[0];
}
/** Das LV, um das es in der Ansicht geht: das dort gewählte (wenn die Ansicht LVs zeigt), sonst das gewählte LV der AVA. */
export function lvVon(p: Mitte): Zeile | undefined {
  const z = sicht.lv?.[p.gewaehlt() ?? ''];
  return z && !z.geloescht && z.werte.projekt === projektId() ? z : gewaehltesLv();
}
/** Ein LV wählen – gilt dann in allen Ansichten der AVA (zeigt die Ansicht LVs, ist es dort auch gewählt). */
export const lvWaehlen = (p: Mitte, id: string) => { setAktivesLv(id); if (p.alle().some((z) => z.id === id)) p.onWahl(id); };
const lvListe = () => lebende('lv').filter((z) => z.werte.projekt === projektId())
  .sort(lvFolge)
  .map((z) => ({ wert: z.id, titel: `${[z.werte.nummer, z.werte.name].filter(Boolean).join(' · ')}${z.werte.archiviert ? ' (Archiv)' : ''}` }));


function AvaKopf(p: Mitte): JSX.Element {
  // in Ansichten, die LVs zeigen, gilt das dort gewählte für die ganze App
  createEffect(() => { const id = p.gewaehlt(); if (id && sicht.lv?.[id]) setAktivesLv(id); });
  const lv = () => lvVon(p);
  const m = () => modell('lv');
  const feld = (n: string) => m().felder.find((f) => f.name === n)!;
  const auftrag = () => (lv() ? lebende('angebot').find((a) => a.werte.lv === lv()!.id && a.werte.beauftragt === true) : undefined);
  // wie bisher: Gewerk · Vertrag · Strafe, dazu die Fristen
  const strafe = () => { const w = wirksameWerte(modell('lv'), lv()!.werte); return w.strafe_prozent ? `${anzeige(feld('strafe_prozent'), w.strafe_prozent)} % je ${anzeige(feld('strafe_tagart'), w.strafe_tagart ?? 'wt')}${w.strafe_max ? `, höchstens ${anzeige(feld('strafe_max'), w.strafe_max)} %` : ''}` : ''; };
  // wie bisher rechts (Steckbrief): Gewerk · KG, Abgabe mit Uhrzeit, Bindefrist, Vertrag, Strafe, „abweichend vom Projekt: n“ – ein Klick öffnet die Ausschreibungsdaten
  const tag = (n: string, w: Wert | undefined) => (w ? anzeige(feld(n), w) : '');
  const angaben = (): [string, string, string?][] => {
    if (!lv()) return [];
    const w = wirksameWerte(m(), lv()!.werte), kg = sicht.kostengruppe?.[String(w.kostengruppe ?? '')]?.werte.nummer;
    return ([['Gewerk', [anzeige(feld('gewerk'), w.gewerk), kg ? `KG ${String(kg)}` : ''].filter(Boolean).join(' · ')],
      ['Abgabe', [tag('abgabe', w.abgabe), w.abgabe ? String(w.abgabe_zeit ?? '') : ''].filter(Boolean).join(' ')], ['Bindefrist', tag('bindefrist', w.bindefrist)],
      ['Vertrag', anzeige(feld('vertragsart'), w.vertragsart)], ['Strafe', strafe() || 'keine'],
      ...(abweichend().length ? [['abweichend vom Projekt', String(abweichend().length), abweichend().join(', ')] as [string, string, string]] : [])] as [string, string, string?][]).filter(([, x]) => x);
  };
  /** Ausschreibungsdaten, die dieses LV anders hat als das Projekt (bzw. das Büro) – wie bisher als Zahl mit den Feldnamen als Hinweis. */
  const abweichend = () => { const z = lv(); if (!z) return []; const eb = ebenenWerte(m(), z.werte);
    return m().felder.filter((f) => f.erbt && !istLeer(z.werte[f.name]) && (() => { const g = geerbt(m(), f, eb); return !!g && String(g.wert) !== String(z.werte[f.name]); })()).map((f) => f.titel); };
  const datenOeffnen = () => { const z = lv(); if (z) karteOeffnen({ objekt: 'lv', id: z.id, titel: `Ausschreibungsdaten – LV ${[z.werte.nummer, z.werte.name].filter(Boolean).join(' ')}`, ohneOben: true }); };
  const app = useContext(AppUmgebung);
  const ansichtTitel = () => app?.reiter().find((r) => r.id === app.aktiv())?.titel ?? 'Ausschreibung';
  return (
    <Show when={lv()}>{(z) => (
      <div class="ansicht-kopf" aria-label="Leistungsverzeichnis">
        {/* wie im bisherigen Bauportal: oben das LV wählen – gilt dann in allen Ansichten der AVA */}
        <div class="kopf-titel"><span class="kopf-ansicht">{ansichtTitel()}:</span>
          <span class="kopf-lv"><Auswahlliste titel="Leistungsverzeichnis" aussehen="titel" wert={z().id} optionen={lvListe()} onWert={(id) => lvWaehlen(p, id)} /></span>
          <Auswahlliste titel="Stand" aussehen="kapsel" vorsatz="Stand:" wert={String(z().werte.status ?? 'bearbeitung')} optionen={LV_STATUS} gesperrt={!darf('lv', 'schreiben')}
            onWert={(w) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: z().id, werte: { status: w } }, 'Stand des LV')} /></div>
        <span class="kopf-rechts">
        <Show when={auftrag()} fallback={<span class="kopf-firma offen">{z().werte.status === 'aufgehoben' ? ['nicht vergeben', NICHT_GRUENDE.find((g) => g.wert && g.wert === z().werte.nicht_vergeben_grund)?.titel, z().werte.nicht_vergeben_am ? `am ${anzeige(modell('lv').felder.find((f) => f.name === 'nicht_vergeben_am')!, z().werte.nicht_vergeben_am)}` : ''].filter(Boolean).join(' · ') : 'noch nicht vergeben'}</span>}>
          {(a) => <span class="kopf-firma">{anzeige(modell('angebot').felder.find((f) => f.name === 'bieter')!, a().werte.bieter)}{a().werte.auftragsdatum ? ` · beauftragt am ${anzeige(modell('angebot').felder.find((f) => f.name === 'auftragsdatum')!, a().werte.auftragsdatum)}` : ''}</span>}
        </Show>
        {angaben().map(([k, w, t]) => <button type="button" class="kopf-angabe" title={t ? `Eigene Angaben dieses LV: ${t}` : 'Ausschreibungsdaten öffnen'} onClick={datenOeffnen}><small>{k}</small>{w}</button>)}
          <button type="button" class="knopf klein" title="Projektdaten: Bauherr:in, Baustelle, Beteiligte, Termine – gelten für alle Apps des Projekts" onClick={() => karteOeffnen({ objekt: 'projekt', id: String(z().werte.projekt), titel: 'Projektdaten' })}><Zeichen name="bearbeiten" groesse={14} /> Projektdaten</button>
          <button type="button" class="knopf klein" title="Ausschreibungsdaten dieses LV: Vergabenummer, Fristen, Ausführung, Kostenansatz" onClick={() => karteOeffnen({ objekt: 'lv', id: z().id, titel: `Ausschreibungsdaten – LV ${[z().werte.nummer, z().werte.name].filter(Boolean).join(' ')}`, ohneOben: true })}><Zeichen name="bearbeiten" groesse={14} /> Ausschreibungsdaten</button>
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
/** Kopf der Ansichten, die für das ganze Projekt gelten (Fenster- & Türliste): wie bisher „Ansicht: Projekt“, rechts Vertrag und Strafe
 *  der Ausschreibungsdaten des Projekts (gelten für alle LVs) und die Knöpfe Projektdaten und Ausschreibungsdaten. */
export function AvaProjektKopf(): JSX.Element {
  const app = useContext(AppUmgebung);
  const ansichtTitel = () => app?.reiter().find((r) => r.id === app.aktiv())?.titel ?? 'Ausschreibung';
  const projekt = () => { const id = projektId(); const z = id ? sicht.projekt?.[id] : undefined; return z && !z.geloescht ? z : undefined; };
  const feld = (n: string) => modell('projekt').felder.find((f) => f.name === n);
  const wert = (n: string) => { const f = feld(n); return f ? anzeige(f, wirksameWerte(modell('projekt'), projekt()!.werte)[n]) : ''; };
  const strafe = () => (wert('lv_strafe_prozent') ? `${wert('lv_strafe_prozent')} % je ${wert('lv_strafe_tagart') || 'Werktag'}` : 'keine');
  return (
    <Show when={projekt()}>{(z) => (
      <div class="ansicht-kopf" aria-label="Projekt">
        <div class="kopf-titel"><span class="kopf-ansicht">{ansichtTitel()}:</span><span class="kopf-lv kopf-projekt">{String(z().werte.name ?? '')}</span></div>
        <span class="kopf-rechts">
          <Show when={wert('lv_vertragsart')}><span class="kopf-angabe"><small>Vertrag</small>{wert('lv_vertragsart')}</span></Show>
          <span class="kopf-angabe"><small>Strafe</small>{strafe()}</span>
          <button type="button" class="knopf klein" title="Projektdaten: Bauherr:in, Baustelle, Beteiligte, Termine – gelten für alle Apps des Projekts" onClick={() => karteOeffnen({ objekt: 'projekt', id: z().id, titel: 'Projektdaten' })}><Zeichen name="bearbeiten" groesse={14} /> Projektdaten</button>
          <button type="button" class="knopf klein" title="Ausschreibungsdaten des Projekts – gelten für alle LVs, solange ein LV nichts Eigenes einträgt" onClick={() => karteOeffnen({ objekt: 'projekt', id: z().id, titel: 'Ausschreibungsdaten (alle LVs)', nurGruppen: ['Ausschreibung (alle LVs)'] })}><Zeichen name="bearbeiten" groesse={14} /> Ausschreibungsdaten</button>
        </span>
      </div>
    )}</Show>
  );
}

export const AVA_OBEN: Anpassung = { kopf: (p) => <AvaKopf {...p} />, abfolge, menueMitte: (p) => <Kennzahlen {...p} />, linksTitel: 'Bereiche' };
function Kennzahlen(p: Mitte) { const app = useContext(AppUmgebung); return <AvaKennzahlen lv={lvVon(p)} ansicht={(app?.aktiv() ?? '').replace(/^ava\./, '')} />; }

/** Kennzahlen in der Menüleiste (wie im bisherigen Bauportal): je Bereich die passenden Summen des gewählten LV. */
// Kennzahlen in der Menüleiste wie bisher: alle sechs in jeder Ansicht, mit Zusatz (Pos. ohne Preis, wer, % …); Reihenfolge durch Ziehen, gemerkt
type Kz = 'schaetzung' | 'bestes' | 'auftrag' | 'nachtraege' | 'leistung' | 'abgerechnet';
const KZ_ALLE: Kz[] = ['schaetzung', 'bestes', 'auftrag', 'nachtraege', 'leistung', 'abgerechnet'];
const KZ_TITEL: Record<Kz, string> = { schaetzung: 'Schätzung', bestes: 'Bestes Angebot', auftrag: 'Auftrag', nachtraege: 'Nachträge beauftragt', leistung: 'Leistungsstand', abgerechnet: 'abgerechnet' };
const KZ_MERKER = 'bp_ava_kennzahlen';
const [kzReihe, setKzReihe] = createSignal<Kz[]>((() => { try { const l = JSON.parse(localStorage.getItem(KZ_MERKER) ?? '[]') as Kz[]; return [...l.filter((k) => KZ_ALLE.includes(k)), ...KZ_ALLE.filter((k) => !l.includes(k))]; } catch { return KZ_ALLE; } })());
const kzSchieben = (was: Kz, wohin: Kz) => {
  if (was === wohin) return;
  const r = kzReihe().filter((k) => k !== was); r.splice(r.indexOf(wohin) + (kzReihe().indexOf(was) < kzReihe().indexOf(wohin) ? 1 : 0), 0, was);
  setKzReihe(r); try { localStorage.setItem(KZ_MERKER, JSON.stringify(r)); } catch { /* gesperrt */ }
};
export function AvaKennzahlen(p: { lv: Zeile | undefined; ansicht: string }): JSX.Element {
  const z = createMemo(() => (p.lv ? lvZahlen(p.lv.id) : undefined));
  const e0 = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
  const ohnePreis = createMemo(() => (p.lv ? positionenVon(p.lv.id).filter((q) => zaehlt(q) && !istZuschlag(q.werte.art) && (q.werte.ep == null || q.werte.ep === '')).length : 0));
  const inhalt = (k: Kz): { wert: string; zusatz?: string } => {
    const x = z(); if (!x) return { wert: '–' };
    const ges = x.haupt + x.stand.beauftragt;
    switch (k) {
      case 'schaetzung': return { wert: e0(x.schaetzung), zusatz: ohnePreis() ? `${ohnePreis()} Pos. ohne Preis` : undefined };
      case 'bestes': return { wert: x.bestes != null ? e0(x.bestes) : '–', zusatz: x.bestes != null ? x.besterBieter : angeboteVon(p.lv!.id).length ? undefined : 'noch keine' };
      case 'auftrag': return { wert: x.auftrag ? e0(x.haupt) : '–', zusatz: x.auftrag && x.schaetzung ? `${Math.round((x.haupt / x.schaetzung - 1) * 100)} % zur Schätzung` : undefined };
      case 'nachtraege': return { wert: x.auftrag && x.stand.beauftragt ? e0(x.stand.beauftragt) : '–', zusatz: x.stand.offen ? `angemeldet ${e0(x.stand.offen)}` : undefined };
      case 'leistung': return { wert: x.auftrag && x.leistung ? e0(x.leistung) : '–', zusatz: ges && x.leistung ? `${Math.round((x.leistung / ges) * 100)} %` : undefined };
      default: return { wert: x.rechnungen ? e0(x.abgerechnet) : '–' };
    }
  };
  let gezogen: Kz | null = null;
  // wird die Menüleiste eng (Stufe „nur Symbole“), steht wie bisher nur die erste Kennzahl da; ▾ klappt alle untereinander auf
  const [auf, setAuf] = createSignal(false);
  let kasten!: HTMLDivElement;
  createEffect(() => { if (!auf()) return; const zu = (e: Event) => { if (!kasten.contains(e.target as Node)) setAuf(false); }; document.addEventListener('pointerdown', zu); onCleanup(() => document.removeEventListener('pointerdown', zu)); });
  return <div class="kennzahlen" classList={{ auf: auf() }} ref={kasten} role="group" aria-label="Kennzahlen">
    <button type="button" class="kz-auf" aria-expanded={auf()} aria-label="Alle Kennzahlen" title="Alle Kennzahlen – zum Umsortieren ziehen" onClick={() => setAuf(!auf())}>▾</button>
    <div class="kz-liste"><For each={kzReihe()}>{(k) => { const i = () => inhalt(k); return (
    <span class="kennzahl" draggable="true" title={`${KZ_TITEL[k]}: ${i().wert}${i().zusatz ? ` · ${i().zusatz}` : ''} – zum Umsortieren ziehen`}
      onDragStart={(e) => { gezogen = k; e.dataTransfer!.effectAllowed = 'move'; e.dataTransfer!.setData('text/plain', k); }} onDragOver={(e) => { if (gezogen) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (gezogen) kzSchieben(gezogen, k); gezogen = null; }} onDragEnd={() => { gezogen = null; }}>
      <small>{KZ_TITEL[k]}</small><b>{i().wert}</b><Show when={i().zusatz}><span class="kz-zusatz">{i().zusatz}</span></Show></span>); }}</For></div></div>;
}
