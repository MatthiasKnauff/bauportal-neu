// Ausschreibung in der Oberfläche: Summen in den Karten (LV, Position) und der Preisspiegel – Positionen mit den Preisen
// aller Bieter:innen nebeneinander, das günstigste je Position markiert, unten Summe, Nachlass, Rang und „Vergeben an …“.
import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { auftragsstand, ausgeschrieben, nachfassenFaellig, ruecklaufVon, ruecklaufZaehlen, type Auftragsstand, type Ruecklauf, gp, guenstigster, nachtragNetto, naechsterNachtrag, ozVergleich, leiter, nachOz, pruefstand, summeGeschaetzt, wertung, zaehlt, zahl, bedingungenAus, gewaehrleistungBis, strafeVorschlag, type Pruefstand } from '../module/ava/rechnung';
import type { Werte } from '../kern/modell';
import { standAus, zeilenBis } from '../module/ava/aufmass';
import { LV_STATUS, NACHTRAGSSTAENDE, RUECKMELDUNGEN } from '../module/ava/beipackzettel';
import { gaebSchreiben, type GaebPosten } from '../module/ava/gaeb';
import { gaebEinlesen } from './uebernahme';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Seitenliste } from './baukasten/seitenliste';
import { lvVon, lvWaehlen } from './avakopf';
import { springeZu } from './sprung';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, modell, neueKennung } from './unterbau/api';
import { FeldEingabe } from './baukasten/feld';
import { Zeichen } from './baukasten/zeichen';
import { druckOeffnen } from './druck';
import { LvListe } from './lvliste';
import { hinweis } from './unterbau/meldungen';
import { BieterDazu } from './preisspiegel';

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const name = (kontakt: unknown) => String(sicht.kontakt?.[String(kontakt ?? '')]?.werte.name ?? 'Bieter:in');
/** Positionen der Ausschreibung (ohne Nachträge) – Preisspiegel, Summen, GAEB. */
const positionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv && ausgeschrieben(p)));
/** Alle Positionen eines Auftrags, mit Nachträgen – Aufmaß und Abrechnung. */
const allePositionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv));
export const angeboteVon = (lv: string) => lebende('angebot').filter((a) => a.werte.lv === lv).sort((a, b) => name(a.werte.bieter).localeCompare(name(b.werte.bieter), 'de'));
/** Preise eines LV: „angebot:position“ → Eintrag. */
export const preiseVon = (angebote: Zeile[]) => { const ids = new Set(angebote.map((a) => a.id)); return new Map(lebende('angebot_preis').filter((x) => ids.has(String(x.werte.angebot))).map((x) => [`${x.werte.angebot}:${x.werte.position}`, x])); };

/** Die Zahlen eines LV an einer Stelle (Karte, Aufträge, Kostenkontrolle): Schätzung, bestes Angebot, Auftrag, Nachträge, abgerechnet. */
export interface LvZahlen { schaetzung: number; bestes: number | null; besterBieter: string; auftrag: Zeile | undefined; haupt: number; nachlass: number; stand: Auftragsstand; leistung: number; abgerechnet: number; rechnungen: number }
export function lvZahlen(lvId: string): LvZahlen {
  const pos = positionenVon(lvId), ang = angeboteVon(lvId), pr = preiseVon(ang);
  const w = wertung(pos, ang, (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null));
  const erster = w.find((x) => x.rang === 1), auftrag = ang.find((x) => x.werte.beauftragt === true);
  const nachlass = zahl(auftrag?.werte.nachlass), haupt = auftrag ? w.find((x) => x.angebot === auftrag.id)?.nachLass ?? 0 : 0;
  const nachtraege = lebende('nachtrag').filter((n) => n.werte.lv === lvId);
  const rechnungen = lebende('rechnung').filter((r) => r.werte.lv === lvId).sort((a, b) => String(a.werte.datum ?? '').localeCompare(String(b.werte.datum ?? '')));
  const letzte = rechnungen.at(-1);
  // Leistungsstand: geprüfte Mengen (Aufmaß) × EP des Auftrags (Nachtragspositionen: ihr eigener EP), nach Nachlass
  const preisAuftrag = (q: Zeile) => (q.werte.nachtrag ? zahl(q.werte.ep) : auftrag && pr.has(`${auftrag.id}:${q.id}`) ? zahl(pr.get(`${auftrag.id}:${q.id}`)!.werte.ep) : 0);
  const stand = standAus(zeilenBis(lebende('aufmass').filter((a) => a.werte.lv === lvId), rechnungen, null));
  const leistung = auftrag ? allePositionenVon(lvId).filter(zaehlt).reduce((s, q) => s + gp(stand.get(q.id) ?? 0, preisAuftrag(q)), 0) * (1 - nachlass / 100) : 0;
  return {
    leistung: Math.round(leistung * 100) / 100,
    schaetzung: summeGeschaetzt(pos), bestes: erster?.nachLass ?? null, besterBieter: name(ang.find((a) => a.id === erster?.angebot)?.werte.bieter),
    auftrag, haupt, nachlass, stand: auftragsstand(haupt, auftrag ? nachtraege : [], allePositionenVon(lvId), nachlass),
    abgerechnet: letzte ? Math.round(zahl(letzte.werte.geprueft ?? letzte.werte.betrag) * (1 - nachlass / 100) * 100) / 100 : 0, rechnungen: rechnungen.length,
  };
}

/** Kennzahlen in der Menüleiste (wie im bisherigen Bauportal): je Bereich die passenden Summen des gewählten LV. */
const KENNZAHLEN: Record<string, ('schaetzung' | 'bestes' | 'auftrag' | 'nachtraege' | 'leistung' | 'abgerechnet')[]> = {
  lv: ['schaetzung'], tueren: [], versand: ['schaetzung', 'bestes'], nachverfolgen: [], preisspiegel: ['schaetzung', 'bestes', 'auftrag', 'leistung'],
  besprechungen: ['schaetzung', 'bestes', 'auftrag', 'nachtraege', 'leistung', 'abgerechnet'], auftraege: ['auftrag', 'nachtraege', 'leistung', 'abgerechnet'],
  aufmass: ['auftrag', 'nachtraege', 'leistung', 'abgerechnet'], rechnungen: ['auftrag', 'nachtraege', 'leistung', 'abgerechnet'],
};
const KZ_TITEL = { schaetzung: 'Schätzung', bestes: 'Bestes Angebot', auftrag: 'Auftrag', nachtraege: 'Nachträge beauftragt', leistung: 'Leistungsstand', abgerechnet: 'abgerechnet' };
export function AvaKennzahlen(p: { lv: Zeile | undefined; ansicht: string }): JSX.Element {
  const z = createMemo(() => (p.lv ? lvZahlen(p.lv.id) : undefined));
  const welche = () => (KENNZAHLEN[p.ansicht] ?? []).map((k) => (k === 'schaetzung' && z()?.auftrag && p.ansicht === 'lv' ? 'auftrag' : k));
  const wert = (k: keyof typeof KZ_TITEL): string => {
    const x = z(); if (!x) return '–';
    const n = { schaetzung: x.schaetzung, bestes: x.bestes, auftrag: x.auftrag ? x.haupt : null, nachtraege: x.auftrag ? x.stand.beauftragt : null, leistung: x.auftrag ? x.leistung : null, abgerechnet: x.rechnungen ? x.abgerechnet : null }[k];
    return n == null ? '–' : `${Math.round(n).toLocaleString('de-DE')} €`;
  };
  return <div class="kennzahlen" role="group" aria-label="Kennzahlen"><For each={welche()}>{(k) => <span class="kennzahl" title={k === 'bestes' && z()?.bestes != null ? z()!.besterBieter : undefined}><small>{KZ_TITEL[k]}</small><b>{wert(k)}</b></span>}</For></div>;
}

/** Karte eines LV: die Summen – geschätzt, Angebote (günstigstes), Auftrag, abgerechnet. */
export function LvSummen(p: { lv: Zeile }): JSX.Element {
  const pos = () => positionenVon(p.lv.id);
  const z = createMemo(() => lvZahlen(p.lv.id));
  return (
    <div class="ava-summen">
      <h3>Summen netto</h3>
      <dl class="angaben">
        <dt>Positionen</dt><dd>{pos().filter((x) => x.werte.art !== 'titel').length}</dd>
        <dt>geschätzt</dt><dd>{eur(z().schaetzung)} €</dd>
        <Show when={zahl(p.lv.werte.budget)}><dt>Kostenansatz</dt><dd>{eur(zahl(p.lv.werte.budget))} €</dd></Show>
        <Show when={angeboteVon(p.lv.id).length}><dt>Angebote</dt><dd>{angeboteVon(p.lv.id).length}{z().bestes != null ? ` · günstigstes ${eur(z().bestes!)} € (${z().besterBieter})` : ''}</dd></Show>
        <Show when={z().auftrag}>{(a) => <><dt>Auftrag</dt><dd>{name(a().werte.bieter)} · {eur(z().haupt)} €</dd></>}</Show>
        <Show when={z().stand.beauftragt || z().stand.offen}><dt>Nachträge</dt><dd>{eur(z().stand.beauftragt)} € beauftragt{z().stand.offen ? ` · ${eur(z().stand.offen)} € offen` : ''}</dd></Show>
        <Show when={z().rechnungen}><dt>abgerechnet</dt><dd>{eur(z().abgerechnet)} € in {z().rechnungen} {z().rechnungen === 1 ? 'Rechnung' : 'Rechnungen'}</dd></Show>
      </dl>
      <h3>GAEB</h3>
      <div class="reihe">
        <button type="button" class="knopf" disabled={!pos().length} title="Angebotsaufforderung: das LV ohne Preise für die Bieter:innen" onClick={() => gaebAusgeben(p.lv, '83')}>X83 ausgeben</button>
        <Show when={darf('lv_position', 'schreiben')}><button type="button" class="knopf" title="X83/X86: Positionen mit diesem LV abgleichen · X84: ein Angebot mit Preisen einlesen" onClick={() => gaebEinlesen(String(p.lv.werte.projekt), p.lv.id)}>Einlesen …</button></Show>
      </div>
    </div>
  );
}

/** Das LV als GAEB-Datei herunterladen: X83 Angebotsaufforderung (ohne Preise). */
export function gaebAusgeben(lv: Zeile, dp: '83'): void {
  const pos = positionenVon(lv.id).map((x): Omit<GaebPosten, 'kennung'> => ({ oz: String(x.werte.oz ?? ''), art: (x.werte.art || 'normal') as GaebPosten['art'], kurztext: String(x.werte.kurztext ?? ''), langtext: String(x.werte.langtext ?? ''),
    menge: x.werte.menge == null ? null : zahl(x.werte.menge), einheit: String(x.werte.einheit ?? ''), ep: null }));
  const projekt = sicht.projekt?.[String(lv.werte.projekt)]?.werte;
  const xml = gaebSchreiben({ projekt: [projekt?.nummer, projekt?.name].filter(Boolean).join(' '), name: String(lv.werte.name ?? ''), nummer: String(lv.werte.nummer ?? '') }, pos, dp);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  a.download = `${[lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ') || 'LV'}.X${dp}`.replace(/[\\/:*?"<>|]+/g, '-');
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Karte einer Position: der Gesamtpreis (und warum er nicht zählt). */
export function PositionSumme(p: { pos: Zeile }): JSX.Element | undefined {
  if (p.pos.werte.art === 'titel' || p.pos.werte.art === 'hinweis') return undefined;
  return <p class="ava-gp">Gesamtpreis geschätzt: <b>{eur(gp(p.pos.werte.menge, p.pos.werte.ep))} €</b>{!zaehlt(p.pos) ? ' – zählt nicht zur Summe des LV' : ''}</p>;
}

/** Links im Preisspiegel: die LVs des Projekts. */
export function LvWahl(p: Mitte): JSX.Element {
  // wie im bisherigen Bauportal: archivierte LVs stehen nicht mehr in der Liste, sondern darunter unter „Archiv“
  const eintraege = (archiv: boolean) => [...p.alle()].filter((l) => !!l.werte.archiviert === archiv).sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true }))
    .map((l) => ({ id: l.id, titel: [l.werte.nummer, l.werte.name].filter(Boolean).join(' · '), zeichen: 'ausschreibung' as const, anzahl: angeboteVon(l.id).length }));
  return <Seitenliste name="Leistungsverzeichnisse" aktiv={lvVon(p)?.id ?? ''} onWahl={(id) => lvWaehlen(p, id)}
    abschnitte={[{ titel: 'Leistungsverzeichnisse', eintraege: eintraege(false) }, ...(eintraege(true).length ? [{ titel: 'Archiv', eintraege: eintraege(true) }] : [])]} />;
}

/** Für die Karte eines Angebots: seine Summe und sein Rang im Preisspiegel. */
export function AngebotSumme(p: { angebot: Zeile }): JSX.Element {
  const lvId = () => String(p.angebot.werte.lv ?? '');
  const w = createMemo(() => { const ang = angeboteVon(lvId()), pr = preiseVon(ang); return wertung(positionenVon(lvId()), ang, (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null)).find((x) => x.angebot === p.angebot.id); });
  return <Show when={w()}>{(x) => <p class="ava-gp">Summe netto <b>{eur(x().netto)} €</b>, nach Nachlass <b>{eur(x().nachLass)} €</b>{x().rang ? ` · Rang ${x().rang}` : ''}{x().fehlend ? ` · ${x().fehlend} Positionen ohne Preis` : ''}</p>}</Show>;
}

/** Karte einer Rechnung: die Rechenleiter bis zur Auszahlung – Nachlass und Skonto aus dem beauftragten Angebot, Sicherheiten,
 *  Bauabzugsteuer und Vertragsstrafe aus den Vertragsbedingungen des LV. */
export function RechnungLeiter(p: { rechnung: Zeile }): JSX.Element {
  const lvId = () => String(p.rechnung.werte.lv ?? '');
  const bed = createMemo(() => bedingungenAus(sicht.lv?.[lvId()]?.werte, angeboteVon(lvId()).find((a) => a.werte.beauftragt === true)?.werte));
  const zeilen = createMemo(() => (lvId() ? leiter(lebende('rechnung').filter((r) => r.werte.lv === lvId()), p.rechnung.id, bed()) : []));
  // Schlussrechnung mit Abnahme: Vertragsstrafe vorschlagen (Verzug nach der vertraglichen Fertigstellung), solange keine eingetragen ist
  const vorschlag = createMemo(() => {
    const w = p.rechnung.werte;
    const abnahme = String(w.abnahme || bed().abnahme || '');   // in der Rechnung eingetragen, sonst die Abnahme im LV
    if (w.art !== 'schluss' || (w.strafe != null && w.strafe !== '') || !abnahme) return null;
    const stand = zahl(w.geprueft ?? w.betrag);
    return strafeVorschlag(bed(), Math.round(stand * (1 - bed().nachlass / 100) * 100) / 100, abnahme);
  });
  return (
    <Show when={zeilen().length} fallback={<p class="still-text klein-text">Mit dem Auftrag (LV) rechnet die Karte die Auszahlung: Nachlass, Sicherheiten, bisherige Zahlungen, Umsatzsteuer, Bauabzugsteuer.</p>}>
      <h3 class="ava-leiter-titel">Rechenleiter</h3>
      <table class="ava-leiter"><tbody><For each={zeilen()}>{(z) => <tr classList={{ summe: !!z.summe, hinweis: !!z.hinweis }}><td>{z.titel}</td><td class="zahl">{eur(z.betrag)} €</td></tr>}</For></tbody></table>
      <Show when={vorschlag()}>{(v) => (
        <p class="still-text klein-text">Vertragsstrafe laut Vertragsbedingungen: {v().tage} Tage Verzug bis zur Abnahme → {eur(v().betrag)} €.{' '}
          <Show when={darf('rechnung', 'schreiben')}><button type="button" class="knopf klein" onClick={() => ausfuehren({ objekt: 'rechnung', art: 'aendern', objektId: p.rechnung.id, werte: { strafe: v().betrag } }, 'Vertragsstrafe übernehmen')}>übernehmen</button></Show></p>)}
      </Show>
    </Show>
  );
}


/** Aufträge (wie im bisherigen Bauportal): Hauptauftrag und Nachträge mit Stand und Betrag, Prognose und abgerechnet. */
/** Karte des Auftrags (rechts in „Aufträge“): Hauptauftrag, Nachträge mit Stand, Summen, Sicherheiten. */
export function AuftragKarte(p: { lv: Zeile }): JSX.Element {
  const lv = () => p.lv;
  const z = createMemo(() => (lv() ? lvZahlen(lv()!.id) : undefined));
  const auftrag = () => z()?.auftrag, nachlass = () => z()?.nachlass ?? 0, haupt = () => z()?.haupt ?? 0;
  const stand = () => z()!.stand, abgerechnet = () => z()?.abgerechnet ?? 0;
  const nachtraege = createMemo(() => (lv() ? lebende('nachtrag').filter((n) => n.werte.lv === lv()!.id).sort((a, b) => ozVergleich(a.werte.nummer, b.werte.nummer)) : []));
  const alle = createMemo(() => (lv() ? allePositionenVon(lv()!.id) : []));
  const STAND: Record<string, string> = Object.fromEntries(NACHTRAGSSTAENDE.map((x) => [x.wert, x.titel]));
  const setzeStand = (n: Zeile, st: string) => ausfuehren({ objekt: 'nachtrag', art: 'aendern', objektId: n.id, werte: { stand: st, ...(st === 'beauftragt' && !n.werte.beauftragt_am ? { beauftragt_am: new Date().toLocaleDateString('sv') } : {}) } }, `Nachtrag ${String(n.werte.nummer ?? '')}: ${STAND[st] ?? st}`);
  const posVon = (n: Zeile) => alle().filter((q) => q.werte.nachtrag === n.id && q.werte.art !== 'titel');
  return (
    <div class="preisspiegel-flaeche">
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – unter „Leistungsverzeichnisse“ anlegen.</p>}>
        <h3>Auftrag {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' ')}</h3>
        <Show when={auftrag()} fallback={<p class="still-text">Dieses LV ist noch nicht vergeben – unter „Preisspiegel“ mit „Vergeben an …“ beauftragen. Nachträge gibt es erst mit Auftrag.</p>}>
          <div class="ps-rollen">
            <table class="preisspiegel auftraege">
              <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Stand</th><th class="zahl">netto{nachlass() ? ' nach Nachlass' : ''}</th></tr></thead>
              <tbody>
                <tr class="ps-titel"><td>HA</td><td>Hauptauftrag · {name(auftrag()!.werte.bieter)}{nachlass() ? ` · Nachlass ${String(auftrag()!.werte.nachlass).replace('.', ',')} %` : ''}</td><td>beauftragt{auftrag()!.werte.auftragsdatum ? ` am ${new Date(String(auftrag()!.werte.auftragsdatum)).toLocaleDateString('de-DE')}` : ''}</td><td class="zahl">{eur(haupt())}</td></tr>
                <For each={nachtraege()}>{(n) => (<>
                  <tr classList={{ 'nt-ab': n.werte.stand === 'abgelehnt' }}>
                    <td>{String(n.werte.nummer ?? '')}</td>
                    <td>{String(n.werte.name ?? '')}<Show when={!posVon(n).length && !zahl(n.werte.betrag)}><small class="still-text"> · noch ohne Positionen und Betrag</small></Show></td>
                    <td><Show when={darf('nachtrag', 'schreiben')} fallback={STAND[String(n.werte.stand ?? '')] ?? ''}>
                      <Auswahlliste titel={`Stand ${String(n.werte.nummer ?? '')}`} wert={String(n.werte.stand ?? '')} optionen={NACHTRAGSSTAENDE} onWert={(w) => setzeStand(n, w)} /></Show></td>
                    <td class="zahl">{eur(Math.round(nachtragNetto(n, alle()) * (1 - nachlass() / 100) * 100) / 100)}</td>
                  </tr>
                  <For each={posVon(n)}>{(q) => <tr class="nt-pos"><td>{String(q.werte.oz ?? '')}</td><td colSpan={2}>{String(q.werte.kurztext ?? '')} · {String(q.werte.menge ?? '').replace('.', ',')} {String(q.werte.einheit ?? '')} × {q.werte.ep != null ? eur(zahl(q.werte.ep)) : '–'} €</td><td class="zahl still-text">{eur(gp(q.werte.menge, q.werte.ep))}</td></tr>}</For>
                </>)}</For>
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Auftrag aktuell (Hauptauftrag + beauftragte Nachträge)</td><td class="zahl">{eur(stand().aktuell)}</td></tr>
                <tr><td colSpan={3}>offene Nachträge (angemeldet bis geprüft)</td><td class="zahl">{eur(stand().offen)}</td></tr>
                <tr class="ps-summe"><td colSpan={3}>Prognose</td><td class="zahl">{eur(stand().prognose)}</td></tr>
                <tr><td colSpan={3}>abgerechnet (letzte Rechnung, Leistungsstand nach Nachlass)</td><td class="zahl">{eur(abgerechnet())}</td></tr>
                <tr><td colSpan={3}>noch abzurechnen laut Prognose</td><td class="zahl">{eur(Math.round((stand().prognose - abgerechnet()) * 100) / 100)}</td></tr>
                <Show when={zahl(lv()!.werte.budget)}><tr><td colSpan={3}>Kostenansatz · Abweichung der Prognose</td><td class="zahl">{eur(zahl(lv()!.werte.budget))} · {stand().prognose - zahl(lv()!.werte.budget) >= 0 ? '+' : ''}{eur(Math.round((stand().prognose - zahl(lv()!.werte.budget)) * 100) / 100)}</td></tr></Show>
              </tfoot>
            </table>
          </div>
          <Sicherheiten lv={lv()!} />
        </Show>
      </Show>
    </div>
  );
}

/** Sicherheiten des Auftrags (VOB/B § 17, wie im bisherigen Bauportal): Vertragserfüllung und Mängelansprüche – Einbehalt oder
 *  Bürgschaft (eingegangen, zurückgegeben), Abnahme und Ende der Verjährung. Eingetragen wird im LV unter „Sicherheiten“. */
function Sicherheiten(p: { lv: Zeile }): JSX.Element {
  const w = () => p.lv.werte, b = () => bedingungenAus(w());
  const de = (d: unknown) => (d ? new Date(`${String(d)}T12:00:00`).toLocaleDateString('de-DE') : '');
  const art = (form: unknown, satz: number | undefined, eingang: unknown, rueckgabe: unknown, standard: number) => {
    const s = `${String(satz ?? standard).replace('.', ',')} %`;
    if (form !== 'buergschaft') return `${s} Einbehalt`;
    return `${s} als Bürgschaft – ${rueckgabe ? `zurückgegeben am ${de(rueckgabe)}` : eingang ? `eingegangen am ${de(eingang)}` : 'noch nicht eingegangen (bis dahin Einbehalt)'}`;
  };
  return (
    <div class="ava-sicherheiten">
      <h3 class="ava-leiter-titel">Sicherheiten</h3>
      <dl class="angaben">
        <dt>Vertragserfüllung</dt><dd>{art(w().ve_form, b().ve, w().ve_eingang, w().ve_rueckgabe, 5)}</dd>
        <dt>Abnahme</dt><dd>{w().abnahme ? de(w().abnahme) : 'noch nicht'}</dd>
        <dt>Mängelansprüche</dt><dd>{art(w().ma_form, b().ma, w().ma_eingang, w().ma_rueckgabe, b().ve ?? 5)}{gewaehrleistungBis(b()) ? ` · Verjährung bis ${de(gewaehrleistungBis(b()))}` : ` · ${b().gewaehrleistungJahre} Jahre ab Abnahme`}</dd>
      </dl>
      <button type="button" class="knopf klein" onClick={() => springeZu('lv', p.lv.id, { modul: 'ava', ansicht: 'lvs' })}>Vertragsbedingungen und Sicherheiten …</button>
    </div>
  );
}

/** Kostenkontrolle (wie im bisherigen Bauportal): alle Vergabeeinheiten des Projekts – Schätzung, bestes Angebot, Auftrag,
 *  beauftragte Nachträge, abgerechnet, noch offen und die Abweichung zur Schätzung. Klick öffnet das LV. */
export function Kostenkontrolle(p: Mitte): JSX.Element {
  const zeilen = createMemo(() => [...p.zeilen()].filter((l) => !l.werte.archiviert).sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true })).map((l) => ({ l, z: lvZahlen(l.id) })));   // wie bisher: ohne archivierte
  const vergeben = (z: LvZahlen) => z.auftrag ? z.stand.aktuell : null;
  const offen = (z: LvZahlen) => z.auftrag ? Math.round((z.stand.aktuell - z.abgerechnet) * 100) / 100 : null;
  // Abweichung zur Schätzung: mit Auftrag der aktuelle Auftrag, sonst das beste Angebot
  const abw = (z: LvZahlen) => { const v = vergeben(z) ?? z.bestes; return v == null || !z.schaetzung ? null : Math.round((v - z.schaetzung) * 100) / 100; };
  const summe = (f: (z: LvZahlen) => number | null) => Math.round(zeilen().reduce((s, x) => s + (f(x.z) ?? 0), 0) * 100) / 100;
  const zelle = (n: number | null) => (n == null ? '–' : eur(n));
  const STAND: Record<string, string> = Object.fromEntries(LV_STATUS.map((x) => [x.wert, x.titel]));
  return (
    <div class="preisspiegel-flaeche">
      <p class="still-text klein-text">Alle Vergabeeinheiten des Projekts: Schätzung im LV, bestes Angebot, Auftrag und beauftragte Nachträge (nach Nachlass), anerkannte Abrechnung. Klick öffnet das LV.</p>
      <div class="ps-rollen">
        <table class="preisspiegel kostenkontrolle">
          <thead><tr><th>Nr.</th><th>LV</th><th>Stand</th><th class="zahl">Schätzung</th><th class="zahl">bestes Angebot</th><th class="zahl">Auftrag</th><th class="zahl">Nachträge</th><th class="zahl">{"abge\u00ADrechnet"}</th><th class="zahl">noch offen</th><th class="zahl">{"Abw. zur Schät\u00ADzung"}</th></tr></thead>
          <tbody>
            <For each={zeilen()}>{(x) => (
              <tr classList={{ gewaehlt: p.gewaehlt() === x.l.id }} onClick={() => { p.onWahl(x.l.id); p.onOeffnen(); }}>
                <td>{String(x.l.werte.nummer ?? '')}</td><td>{String(x.l.werte.name ?? '')}</td><td>{STAND[String(x.l.werte.status ?? '')] ?? ''}</td>
                <td class="zahl">{x.z.schaetzung ? eur(x.z.schaetzung) : '–'}</td><td class="zahl">{zelle(x.z.bestes)}</td>
                <td class="zahl">{x.z.auftrag ? eur(x.z.haupt) : '–'}</td><td class="zahl">{x.z.auftrag && x.z.stand.beauftragt ? eur(x.z.stand.beauftragt) : '–'}</td>
                <td class="zahl">{x.z.rechnungen ? eur(x.z.abgerechnet) : '–'}</td><td class="zahl">{zelle(offen(x.z))}</td>
                <td class="zahl" classList={{ 'gefahr-text': (abw(x.z) ?? 0) > 0, 'gut-text': (abw(x.z) ?? 0) < 0 }}><Show when={abw(x.z) != null}>{`${abw(x.z)! > 0 ? '+' : ''}${eur(abw(x.z)!)}`}<br /><small>{`${abw(x.z)! > 0 ? '+' : ''}${(abw(x.z)! / x.z.schaetzung * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`}</small></Show></td>
              </tr>
            )}</For>
          </tbody>
          <tfoot><tr class="ps-summe"><td colSpan={3}>Summe netto in €</td><td class="zahl">{eur(summe((z) => z.schaetzung))}</td><td class="zahl">{eur(summe((z) => z.bestes))}</td><td class="zahl">{eur(summe((z) => (z.auftrag ? z.haupt : null)))}</td>
            <td class="zahl">{eur(summe((z) => (z.auftrag ? z.stand.beauftragt : null)))}</td><td class="zahl">{eur(summe((z) => z.abgerechnet))}</td><td class="zahl">{eur(summe(offen))}</td><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

const heute = () => new Date().toLocaleDateString('sv');
/** Bieter:in aus dem LV nehmen: Angebot mit seinen Preisen in den Papierkorb – ein Rückgängig für alles. */
function bieterEntfernen(a: Zeile): void {
  if (a.werte.beauftragt === true) { hinweis('Die beauftragte Bieter:in lässt sich erst nach „Vergabe aufheben“ entfernen.', { art: 'fehler' }); return; }
  ausfuehrenMehrere([...lebende('angebot_preis').filter((x) => x.werte.angebot === a.id).map((x) => ({ objekt: 'angebot_preis', art: 'loeschen' as const, objektId: x.id })),
    { objekt: 'angebot', art: 'loeschen', objektId: a.id }], `${name(a.werte.bieter)} entfernt`);
  hinweis(`${name(a.werte.bieter)} entfernt – rückgängig mit Strg+Z.`);
}
const datum = (w: unknown) => (w ? new Date(String(w)).toLocaleDateString('de-DE') : '–');
const STAND_RUECKLAUF: Record<Ruecklauf, string> = { abgegeben: 'abgegeben', will_abgeben: 'will abgeben', gibt_nicht_ab: 'gibt nicht ab', offen: 'offen' };

/** Bieter:innen mit Rückmeldung, Nachfassen und Eingang – ein Baustein für „Versand & Rücklauf“ (ein LV) und „Nachverfolgen“ (alle LVs). */
function BieterTabelle(p: { bieter: Zeile[]; mitLv?: boolean; onLv?: (lv: string) => void }): JSX.Element {
  const schreiben = () => darf('angebot', 'schreiben');
  const aendern = (a: Zeile, werte: Werte, titel: string) => ausfuehren({ objekt: 'angebot', art: 'aendern', objektId: a.id, werte }, `${name(a.werte.bieter)}: ${titel}`);
  const telefon = (a: Zeile) => { const k = sicht.kontakt?.[String(a.werte.bieter ?? '')]?.werte; return String(k?.telefon || k?.mobil || ''); };
  const lvName = (id: unknown) => { const l = sicht.lv?.[String(id ?? '')]?.werte; return l ? [l.nummer, l.name].filter(Boolean).join(' · ') : ''; };
  return (
    <div class="ps-rollen">
      <table class="preisspiegel versand">
        <thead><tr><Show when={p.mitLv}><th>LV</th><th>Abgabe</th></Show><th>Bieter:in</th><th>Telefon</th><th>angeschrieben</th><th>Stand</th><th>Nachfassen</th><th>Angebot</th><Show when={!p.mitLv}><th /></Show></tr></thead>
        <tbody>
          <For each={p.bieter}>{(a) => {
            const st = () => ruecklaufVon(a);
            return (
              <tr classList={{ 'vr-faellig': nachfassenFaellig(a, heute()), 'vr-ab': st() === 'gibt_nicht_ab' }}>
                <Show when={p.mitLv}><td><button type="button" class="link-knopf" onClick={() => p.onLv?.(String(a.werte.lv))}>{lvName(a.werte.lv)}</button></td><td>{datum(sicht.lv?.[String(a.werte.lv)]?.werte.abgabe)}</td></Show>
                <td>{name(a.werte.bieter)}</td>
                <td><Show when={telefon(a)}><a href={`tel:${telefon(a).replace(/[^+\d]/g, '')}`}>{telefon(a)}</a></Show></td>
                <td>{datum(a.werte.angeschrieben)}</td>
                <td><Show when={schreiben() && st() !== 'abgegeben'} fallback={<b class={`vr-${st()}`}>{STAND_RUECKLAUF[st()]}</b>}>
                  <Auswahlliste titel={`Rückmeldung ${name(a.werte.bieter)}`} wert={String(a.werte.rueckmeldung || 'offen')} optionen={RUECKMELDUNGEN} onWert={(w) => aendern(a, { rueckmeldung: w }, 'Rückmeldung')} /></Show></td>
                <td><Show when={schreiben() && st() !== 'abgegeben' && st() !== 'gibt_nicht_ab'} fallback={a.werte.nachfassen ? datum(a.werte.nachfassen) : ''}>
                  <FeldEingabe feld={{ name: 'nachfassen', titel: `Nachfassen ${name(a.werte.bieter)}`, art: 'datum' }} wert={a.werte.nachfassen ?? null} onWert={(w) => aendern(a, { nachfassen: w || null }, 'Nachfassen')} />
                  <Show when={nachfassenFaellig(a, heute())}><small class="gefahr-text"> fällig</small></Show></Show></td>
                <td><Show when={a.werte.eingang} fallback={<Show when={schreiben() && st() !== 'gibt_nicht_ab'}><button type="button" class="knopf klein" onClick={() => aendern(a, { eingang: heute() }, 'Angebot eingegangen')}>eingegangen</button></Show>}>
                  {datum(a.werte.eingang)}</Show></td>
                <Show when={!p.mitLv && darf('angebot', 'loeschen')}><td><button type="button" class="knopf klein still" title="Bieter:in entfernen – mit Angebot und Preisen in den Papierkorb (Rückgängig holt alles zurück)" aria-label={`${name(a.werte.bieter)} entfernen`} onClick={() => bieterEntfernen(a)}><Zeichen name="loeschen" groesse={14} /></button></td></Show>
              </tr>
            );
          }}</For>
        </tbody>
      </table>
    </div>
  );
}

/** Versand & Rücklauf (wie im bisherigen Bauportal): je LV die angeschriebenen Bieter:innen – Rückmeldung, Nachfassen, Eingang –
 *  mit Fristen und Zählern; Unterlagen als GAEB X83. Das Verschicken per E-Mail kommt über die zentrale Versandstelle. */
export function Versand(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const bieter = createMemo(() => (lv() ? angeboteVon(lv()!.id) : []));
  const z = createMemo(() => ruecklaufZaehlen(bieter()));
  const [dazu, setDazu] = createSignal(false);
  const feld = (n: string) => modell('lv').felder.find((f) => f.name === n)!;
  createEffect(() => p.setKnoepfe([
    ...(lv() && darf('angebot', 'schreiben') ? [{ titel: 'Bieter:in', zeichen: 'person_neu', gruppe: 'Neu', tun: () => setDazu(true) }] : []),
    { titel: 'Nachverfolgen', zeichen: 'telefon', gruppe: 'Nachverfolgen', tun: () => springeZu('lv', lv()?.id ?? '', { modul: 'ava', ansicht: 'nachverfolgen' }) },
  ]));
  return (
    <LvListe m={p} zusatz={(l) => { const n = angeboteVon(l.id).length; return n ? `${n} ${n === 1 ? 'Bieter:in' : 'Bieter:innen'}` : ''; }}>
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – unter „Leistungsverzeichnis“ mit „LV“ anlegen.</p>}>
        <div class="vr-kopf">
          <div class="vr-termine">
            <FeldEingabe feld={feld('abgabe')} wert={lv()!.werte.abgabe ?? null} gesperrt={!darf('lv', 'schreiben')} onWert={(w) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { abgabe: w } }, 'Abgabe der Angebote')} />
            <FeldEingabe feld={feld('rueckmeldung_bis')} wert={lv()!.werte.rueckmeldung_bis ?? null} gesperrt={!darf('lv', 'schreiben')} onWert={(w) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { rueckmeldung_bis: w } }, 'Rückmeldung bis')} />
          </div>
          <div class="vr-zahlen">
            <span>angeschrieben <b>{z().angeschrieben}</b> von {bieter().length}</span><span class="vr-abgegeben">abgegeben <b>{z().abgegeben}</b></span>
            <span>wollen abgeben <b>{z().will_abgeben}</b></span><span class="vr-nicht">geben nicht ab <b>{z().gibt_nicht_ab}</b></span><span>offen <b>{z().offen}</b></span>
          </div>
        </div>
        <section class="vr-unterlagen" aria-label="Unterlagen für die Bieter:innen">
          <h3>Unterlagen für die Bieter:innen · 2 Dateien</h3>
          <div class="vr-datei"><Zeichen name="pdf" groesse={16} /><span><b>LV {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' ')}.pdf</b><small>LV ohne Preise – entsteht beim Senden aus dem aktuellen Stand</small></span>
            <span class="pille">immer dabei</span><button type="button" class="knopf klein" onClick={() => druckOeffnen('ava.lv', lv()!.id)}>Ansehen</button></div>
          <div class="vr-datei"><Zeichen name="datei_runter" groesse={16} /><span><b>LV {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' ')}.x83</b><small>LV als GAEB-Datei – für die Kalkulation der Bieter:innen</small></span>
            <span class="pille">GAEB</span><button type="button" class="knopf klein" disabled={!positionenVon(lv()!.id).length} onClick={() => gaebAusgeben(lv()!, '83')}>Herunterladen</button></div>
          <p class="still-text klein-text">Verschicken per E-Mail kommt über die zentrale Versandstelle des Bauportals – bis dahin die Dateien herunterladen und selbst senden.</p>
        </section>
        <h3 class="vr-titel">Bieter:innen</h3>
        <Show when={bieter().length} fallback={<p class="hinweis-kasten">Noch keine Bieter:innen – oben „Bieter:in“ (Firmen mit passendem Gewerk stehen zuerst). Wer im Preisspiegel ein Angebot hat, steht hier von selbst.</p>}>
          <BieterTabelle bieter={bieter()} />
        </Show>
        <Show when={dazu()}><BieterDazu lv={lv()!} vorgabe={{ angeschrieben: heute() }} onZu={() => setDazu(false)} /></Show>
      </Show>
    </LvListe>
  );
}

/** Nachverfolgen (wie im bisherigen Bauportal): dieselben Daten wie im Versand, über alle LVs des Projekts, die noch nicht vergeben sind. */
export function Nachverfolgen(p: Mitte): JSX.Element {
  const [nurFaellig, setNurFaellig] = createSignal(false);
  const unterwegs = createMemo(() => p.alle().filter((l) => !['vergeben', 'aufgehoben'].includes(String(l.werte.status ?? ''))));
  const alle = createMemo(() => unterwegs().flatMap((l) => angeboteVon(l.id)).sort((a, b) => String(sicht.lv?.[String(a.werte.lv)]?.werte.abgabe ?? '9').localeCompare(String(sicht.lv?.[String(b.werte.lv)]?.werte.abgabe ?? '9'))));
  const faellig = createMemo(() => alle().filter((a) => nachfassenFaellig(a, heute())));
  const bald = createMemo(() => unterwegs().filter((l) => { const ab = String(l.werte.abgabe ?? ''); if (!ab) return false; const t = (new Date(ab).getTime() - new Date(heute()).getTime()) / 86400000; return t >= 0 && t <= 3; }).length);
  return (
    <div class="preisspiegel-flaeche">
      <div class="vr-zahlen">
        <span classList={{ 'gefahr-text': faellig().length > 0 }}><b>{faellig().length}</b> {faellig().length === 1 ? 'Anruf' : 'Anrufe'} fällig</span>
        <span><b>{bald()}</b> Abgabe in ≤ 3 Tagen</span><span><b>{unterwegs().length}</b> {unterwegs().length === 1 ? 'LV' : 'LVs'} unterwegs</span>
        <span><b>{alle().filter((a) => a.werte.eingang).length}</b> / {alle().length} Angebote da</span>
        <label class="vr-nur"><input type="checkbox" checked={nurFaellig()} onChange={(e) => setNurFaellig(e.currentTarget.checked)} /> nur fällige Anrufe</label>
      </div>
      <Show when={(nurFaellig() ? faellig() : alle()).length} fallback={<p class="still-text">{nurFaellig() ? 'Keine Anrufe fällig.' : 'Kein LV unterwegs – Bieter:innen schreibt man unter „Versand & Rücklauf“ an.'}</p>}>
        <BieterTabelle bieter={nurFaellig() ? faellig() : alle()} mitLv onLv={(id) => { p.onWahl(id); p.onOeffnen(); }} />
      </Show>
      <p class="still-text klein-text">Dieselben Daten wie im Versand – nur über alle LVs, die noch nicht vergeben sind. Klick auf ein LV zeigt es rechts.</p>
    </div>
  );
}
