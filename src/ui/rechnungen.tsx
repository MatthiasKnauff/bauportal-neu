// Rechnungen (wie im bisherigen Bauportal, einfacher gebaut): links die LVs, oben die Rechnungen des gewählten Auftrags in ihrer
// Reihenfolge (dieselbe Leiste wie in der Aufmaßprüfung), darunter die Karte der gewählten Rechnung – Kopf (Nr., Datum, Eingang,
// gefordert, Prüffrist), wie geprüft wird, Leistung, Abzüge (Rechenleiter) und Freigabe. „Schritt für Schritt“ zeigt dieselben
// Teile nacheinander in einem großen Fenster; in Schritt 3 steht dort die Aufmaßprüfung selbst.
import { For, Show, createEffect, createMemo, createSignal, useContext, type JSX } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { geprueft as istGeprueft, ketteVon, nachAufmass, neueGesperrt, pruefFrist, pruefung, rechnungTitel, standAus, zeilenBis, zeilenSumme } from '../module/ava/aufmass';
import { RECHNUNGSARTEN } from '../module/ava/beipackzettel';
import { bedingungenAus, gp, leiter, strafeVorschlag, zaehlt, zahl } from '../module/ava/rechnung';
import { angeboteVon, lvZahlen, name } from './ava';
import { Aufmasspruefung, AufmassKarte, RechnungsLeiste } from './aufmasspruefung';
import { lvVon, lvWaehlen } from './avakopf';
import { projektId } from './projekt';
import type { Mitte } from './baukasten/anpassung';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { zeigeMenue } from './baukasten/kontextmenue';
import type { Knopf } from './baukasten/menueleiste';
import { AppUmgebung } from './baukasten/rahmen';
import { druckOeffnen } from './druck';
import { eur, lvZeiger, setLvZeiger } from './lvbearbeiten';
import { LvListe } from './lvliste';
import { abschliessen, aufmassVon, epVon, leistungJetzt, rechnungenVon, setRechnungWahl, zeilenDer, zuruecknehmbar, zuruecknehmen } from './rechnungpruefen';
import { rechnungEinlesen } from './rechnungeinlesen';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, modell, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const datumText = (t: unknown) => { const s = String(t ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s; };
const heute = () => new Date().toLocaleDateString('sv');
const feld = (n: string) => modell('rechnung').felder.find((f) => f.name === n)!;
const darfSchreiben = (r: Zeile) => darf('rechnung', 'schreiben') && !istGeprueft(r);
const setze = (r: Zeile, werte: Record<string, Wert>, titel: string) => ausfuehren({ objekt: 'rechnung', art: 'aendern', objektId: r.id, werte }, titel);

/** Ein Feld der Rechnung – derselbe Baustein wie in der Karte, gesperrt, sobald geprüft. */
function RFeld(p: { r: Zeile; n: string; titel?: string; offen?: boolean }): JSX.Element {
  const f = () => (p.titel ? { ...feld(p.n), titel: p.titel } : feld(p.n));
  return <FeldEingabe feld={f()} wert={p.r.werte[p.n] ?? null} gesperrt={p.offen ? !darf('rechnung', 'schreiben') : !darfSchreiben(p.r)} onWert={(w) => setze(p.r, { [p.n]: w }, f().titel)} />;
}

/** Neue Rechnung (Menü am Knopf): offene Rechnung derselben Kette erst prüfen – sie baut auf ihr auf. */
export function neueRechnung(e: MouseEvent, lv: Zeile, danach: (id: string) => void): void {
  const R = rechnungenVon(lv.id), auftrag = angeboteVon(lv.id).find((a) => a.werte.beauftragt === true);
  const arten = RECHNUNGSARTEN.filter((a) => (lv.werte.ohne_lv ? a.wert === 'einzel' || a.wert === 'stundenlohn' : a.wert !== 'einzel'));
  zeigeMenue(e, arten.map((a) => {
    const grund = neueGesperrt(R, a.wert);
    return { titel: grund ? `${a.titel} – gesperrt` : a.titel, tun: () => {
      if (grund) { hinweis(grund); return; }
      const id = neueKennung(), vor = [...R].reverse().find((x) => x.werte.art === a.wert);
      ausfuehren({ objekt: 'rechnung', art: 'anlegen', objektId: id, werte: { projekt: lv.werte.projekt ?? null, lv: lv.id, firma: auftrag?.werte.bieter ?? null, art: a.wert, status: 'offen', eingang: heute(),
        ...(a.wert === 'abschlag' || a.wert === 'schluss' || a.wert === 'nachtrag' ? { pruefweg: String(vor?.werte.pruefweg ?? 'aufmass') } : {}) } }, `Neue ${a.titel}`);
      danach(id);
    } };
  }));
}

/** 1 – Kopf: Nummer, Datum, Eingang, gefordert, Prüffrist. */
function Kopf(p: { r: Zeile }): JSX.Element {
  const frist = () => pruefFrist(p.r.werte.eingang, p.r.werte.art);
  return (
    <div class="re-kopf">
      <RFeld r={p.r} n="nummer" /><RFeld r={p.r} n="datum" /><RFeld r={p.r} n="eingang" />
      <RFeld r={p.r} n="betrag" titel={ketteVon(p.r) === null ? 'gefordert netto in €' : 'gefordert netto (Leistungsstand kumuliert) in €'} />
      <Show when={p.r.werte.art === 'schluss'}><RFeld r={p.r} n="abnahme" /></Show>
      <Show when={frist()}><p class="re-frist"><span class="pille" classList={{ rot: !istGeprueft(p.r) && frist() < heute() }}>Prüffrist bis {datumText(frist())}</span>
        <small class="still-text">{p.r.werte.art === 'schluss' ? '30 Tage, § 16 Abs. 3 VOB/B' : '21 Tage, § 16 Abs. 1 VOB/B'}</small></p></Show>
    </div>
  );
}

/** 2 – Wie wird geprüft? (Stundenlohn: immer mit Stundenzetteln.) */
function Pruefweg(p: { r: Zeile }): JSX.Element {
  const WEGE = [['aufmass', '📐', 'Nach Aufmaß', 'Je Position die Menge laut Firma und das eigene Aufmaß (Menge oder Rechenweg), kumuliert × EP des Auftrags.'],
    ['ohne', '💶', 'Ohne Aufmaß', 'Pauschal, kleine Rechnungen, Abschlag nach Zahlungsplan: den geprüften Leistungsstand eintragen – oder die Positionen von Hand.']] as const;
  return (
    <Show when={p.r.werte.art !== 'stundenlohn' && p.r.werte.art !== 'einzel'} fallback={<p class="still-text">{p.r.werte.art === 'einzel' ? 'Rechnung ohne LV: geprüft wird der Betrag – oder die Positionen von Hand. Jede Rechnung steht für sich, ohne Einbehalt.' : 'Stundenlohnrechnung: geprüft wird nach den Stundenzetteln (Lohn, Gerät, Material).'}</p>}>
      <div class="re-wege" role="radiogroup" aria-label="Wie wird geprüft?">
        <For each={WEGE}>{([w, ic, t, txt]) => (
          <button type="button" role="radio" class="re-weg" classList={{ an: (p.r.werte.pruefweg || 'aufmass') === w }} aria-checked={(p.r.werte.pruefweg || 'aufmass') === w} disabled={!darfSchreiben(p.r)}
            onClick={() => setze(p.r, { pruefweg: w }, 'Wie geprüft wird')}><span class="re-weg-ic">{ic}</span><b>{t}</b><small>{txt}</small></button>)}</For>
      </div>
    </Show>
  );
}

/** Zeilen von Hand (Stundenzettel, Positionen ohne Aufmaß) – direkt in der Tabelle. */
function Zeilen(p: { r: Zeile }): JSX.Element {
  const Z = createMemo(() => zeilenDer(p.r));
  const zfeld = (n: string) => modell('rechnungszeile').felder.find((f) => f.name === n)!;
  const frei = () => darfSchreiben(p.r) && darf('rechnungszeile', 'schreiben');
  const dazu = () => ausfuehren({ objekt: 'rechnungszeile', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.r.werte.projekt ?? null, rechnung: p.r.id, einheit: p.r.werte.art === 'stundenlohn' ? 'h' : null } }, 'Zeile');
  return (
    <div class="re-zeilen">
      <table class="tabelle schmal">
        <thead><tr><th>{p.r.werte.art === 'stundenlohn' ? 'Stundenlohnarbeiten (Stundenzettel)' : 'Positionen der Rechnung (von Hand)'}</th><th class="zahl">Menge</th><th>EH</th><th class="zahl">{p.r.werte.art === 'stundenlohn' ? 'Satz €' : 'EP €'}</th><th class="zahl">Betrag</th><th /></tr></thead>
        <tbody>
          <For each={Z()}>{(z) => (
            <tr>
              <For each={['text', 'menge', 'einheit', 'ep']}>{(n) => <td classList={{ zahl: n === 'menge' || n === 'ep' }}><FeldEingabe feld={{ ...zfeld(n), titel: '' }} wert={z.werte[n] ?? null} gesperrt={!frei()} onWert={(w) => ausfuehren({ objekt: 'rechnungszeile', art: 'aendern', objektId: z.id, werte: { [n]: w } }, zfeld(n).titel)} /></td>}</For>
              <td class="zahl">{eur(gp(z.werte.menge, z.werte.ep))}</td>
              <td><Show when={frei()}><button type="button" class="knopf klein still" aria-label="Zeile entfernen" onClick={() => ausfuehren({ objekt: 'rechnungszeile', art: 'loeschen', objektId: z.id }, 'Zeile entfernen')}>✕</button></Show></td>
            </tr>)}</For>
        </tbody>
        <tfoot><tr><td colSpan={4}>Summe netto</td><td class="zahl">{eur(zeilenSumme(Z()))}</td><td /></tr></tfoot>
      </table>
      <Show when={frei()}><button type="button" class="knopf klein" onClick={dazu}>＋ {p.r.werte.art === 'stundenlohn' ? 'Zeile (Lohn, Gerät, Material)' : 'Position'}</button></Show>
    </div>
  );
}

/** 3 – Leistung: nach Aufmaß der Stand mit dem Vergleich zur Firma, sonst Betrag oder Zeilen. */
function Leistung(p: { r: Zeile; zumAufmass?: () => void }): JSX.Element {
  const lvId = () => String(p.r.werte.lv ?? '');
  const vergleich = createMemo(() => {
    if (!nachAufmass(p.r)) return null;
    const ep = epVon(lvId()), stand = standAus(zeilenBis(lebende('aufmass').filter((a) => a.werte.lv === lvId()), rechnungenVon(lvId()), p.r));
    const firma = new Map(lebende('rechnungsmenge').filter((m) => m.werte.rechnung === p.r.id).map((m) => [String(m.werte.position), zahl(m.werte.menge)]));
    const pos = lebende('lv_position').filter((q) => q.werte.lv === lvId() && zaehlt(q));
    let laut = 0, abw = 0, offen = 0;
    for (const q of pos) {
      const f = firma.get(q.id), s = stand.get(q.id);
      if (f != null) laut += gp(f, ep(q) ?? 0);
      const pr = pruefung(f, s); if (pr === 'abweichend' && (f != null || s)) abw++; else if (pr === 'offen' && f != null) offen++;
    }
    return { laut: Math.round(laut * 100) / 100, abw, offen, firma: firma.size };
  });
  return (
    <div class="re-leistung">
      <Show when={nachAufmass(p.r)} fallback={<>
        <Show when={p.r.werte.art !== 'stundenlohn' && !zeilenDer(p.r).length}><RFeld r={p.r} n="geprueft" titel={ketteVon(p.r) === null ? 'geprüfter Betrag netto in €' : 'geprüfter Leistungsstand netto (kumuliert) in €'} /></Show>
        <Zeilen r={p.r} /></>}>
        <p class="re-zahlen"><span>Leistungsstand nach Aufmaß <b>{eur(leistungJetzt(p.r))} €</b></span>
          <Show when={vergleich()?.firma}><span>laut Firma <b>{eur(vergleich()!.laut)} €</b></span></Show>
          <Show when={vergleich()?.abw}><span class="re-warn">{vergleich()!.abw} {vergleich()!.abw === 1 ? 'Position weicht' : 'Positionen weichen'} ab</span></Show>
          <Show when={vergleich()?.offen}><span>{vergleich()!.offen} noch nicht aufgemessen</span></Show></p>
        <Show when={p.zumAufmass}><button type="button" class="knopf klein" onClick={() => p.zumAufmass!()}>Zur Aufmaßprüfung</button></Show>
      </Show>
    </div>
  );
}

/** Rechenleiter bis zur Auszahlung – Nachlass und Skonto aus dem beauftragten Angebot, Sicherheiten, Bauabzugsteuer und
 *  Vertragsstrafe aus den Vertragsbedingungen des LV; offene Rechnungen mit dem Stand der Prüfung. */
export function RechnungLeiter(p: { rechnung: Zeile }): JSX.Element {
  const lvId = () => String(p.rechnung.werte.lv ?? '');
  const bed = createMemo(() => bedingungenAus(sicht.lv?.[lvId()]?.werte, angeboteVon(lvId()).find((a) => a.werte.beauftragt === true)?.werte));
  const zeilen = createMemo(() => { if (!lvId()) return []; const ep = epVon(lvId()); return leiter(rechnungenVon(lvId()), p.rechnung.id, bed(), (r) => leistungJetzt(r, ep)); });
  // Schlussrechnung mit Abnahme: Vertragsstrafe vorschlagen (Verzug nach der vertraglichen Fertigstellung), solange keine eingetragen ist
  const vorschlag = createMemo(() => {
    const w = p.rechnung.werte, abnahme = String(w.abnahme || bed().abnahme || '');
    if (w.art !== 'schluss' || (w.strafe != null && w.strafe !== '') || !abnahme) return null;
    return strafeVorschlag(bed(), Math.round(leistungJetzt(p.rechnung) * (1 - bed().nachlass / 100) * 100) / 100, abnahme);
  });
  return (
    <Show when={zeilen().length} fallback={<p class="still-text klein-text">Mit dem Auftrag (LV) rechnet die Karte die Auszahlung: Nachlass, Sicherheiten, bisherige Zahlungen, Umsatzsteuer, Bauabzugsteuer.</p>}>
      <h3 class="ava-leiter-titel">Rechenleiter</h3>
      <table class="ava-leiter"><tbody><For each={zeilen()}>{(z) => <tr classList={{ summe: !!z.summe, hinweis: !!z.hinweis }}><td>{z.titel}</td><td class="zahl">{eur(z.betrag)} €</td></tr>}</For>
        <Show when={zahl(p.rechnung.werte.betrag)}>{(() => { const d = () => Math.round((leistungJetzt(p.rechnung) - zahl(p.rechnung.werte.betrag)) * 100) / 100; return (
          <tr class="hinweis" classList={{ 're-kuerzung': d() < -0.5 }}><td>gefordert netto {eur(zahl(p.rechnung.werte.betrag))} € – {d() < -0.5 ? 'Kürzung' : 'Differenz'}</td><td class="zahl">{eur(d())} €</td></tr>); })()}</Show></tbody></table>
      <Show when={vorschlag()}>{(v) => (
        <p class="still-text klein-text">Vertragsstrafe laut Vertragsbedingungen: {v().tage} Tage Verzug bis zur Abnahme → {eur(v().betrag)} €.{' '}
          <Show when={darfSchreiben(p.rechnung)}><button type="button" class="knopf klein" onClick={() => setze(p.rechnung, { strafe: v().betrag }, 'Vertragsstrafe übernehmen')}>übernehmen</button></Show></p>)}
      </Show>
    </Show>
  );
}

/** 4 – Abzüge: Einbehalt dieser Rechnung (leer: wie im LV) und die Rechenleiter. */
function Abzuege(p: { r: Zeile }): JSX.Element {
  return (<div class="re-abzuege"><div class="re-kopf"><RFeld r={p.r} n="einbehalt" /><Show when={p.r.werte.art === 'schluss'}><RFeld r={p.r} n="strafe" /></Show></div><RechnungLeiter rechnung={p.r} /></div>);
}

/** Text für den Prüfvermerk aus den Abweichungen zur Firma: „Pos. 01.0010: 200 statt 210 m²“. */
function abweichungenText(r: Zeile): string {
  if (!nachAufmass(r)) return '';
  const lvId = String(r.werte.lv ?? ''), stand = standAus(zeilenBis(lebende('aufmass').filter((a) => a.werte.lv === lvId), rechnungenVon(lvId), r));
  return lebende('rechnungsmenge').filter((m) => m.werte.rechnung === r.id).map((m) => {
    const q = sicht.lv_position?.[String(m.werte.position)]; const s = stand.get(String(m.werte.position)) ?? 0, f = zahl(m.werte.menge);
    return q && !q.geloescht && Math.abs(s - f) > 0.0005 ? `Pos. ${String(q.werte.oz ?? '')}: ${s.toLocaleString('de-DE')} statt ${f.toLocaleString('de-DE')} ${String(q.werte.einheit ?? '')}`.trim() : '';
  }).filter(Boolean).join('; ');
}

/** 5 – Freigabe: frei festgesetzter Zahlbetrag (mit Pflichtgrund), Prüfvermerk, Abschließen, Freigabe-PDF. */
function Freigabe(p: { r: Zeile }): JSX.Element {
  const hand = () => p.r.werte.zahlbetrag_hand != null && p.r.werte.zahlbetrag_hand !== '';
  const gefordert = () => zahl(p.r.werte.betrag), kuerzung = () => gefordert() > 0 && leistungJetzt(p.r) < gefordert() - 0.5;
  const vor = createMemo(() => abweichungenText(p.r));
  const rechnerisch = () => { const lvId = String(p.r.werte.lv ?? ''); const b = bedingungenAus(sicht.lv?.[lvId]?.werte, angeboteVon(lvId).find((a) => a.werte.beauftragt === true)?.werte);
    return leiter(rechnungenVon(lvId), p.r.id, b, (x) => leistungJetzt(x)).find((z) => z.titel === 'Zahlbetrag netto')?.betrag ?? 0; };
  return (
    <div class="re-freigabe">
      <Show when={hand()} fallback={<Show when={darfSchreiben(p.r)}><button type="button" class="knopf klein still" onClick={() => setze(p.r, { zahlbetrag_hand: rechnerisch() }, 'Zahlbetrag frei festsetzen')}>＋ abweichender Zahlbetrag mit Begründung …</button></Show>}>
        <div class="re-kopf re-hand">
          <RFeld r={p.r} n="zahlbetrag_hand" /><RFeld r={p.r} n="hand_grund" titel="Begründung (Pflicht – steht im Prüfblatt und in der Freigabe)" />
          <Show when={darfSchreiben(p.r)}><button type="button" class="knopf klein still" onClick={() => setze(p.r, { zahlbetrag_hand: null, hand_grund: null }, 'Wieder rechnerisch')}>✕ wieder rechnerisch</button></Show>
        </div>
      </Show>
      <RFeld r={p.r} n="notiz" titel={kuerzung() ? 'Kürzung begründen (steht auf dem Prüfblatt)' : 'Bemerkung zur Prüfung (steht auf dem Prüfblatt)'} />
      <Show when={vor() && darfSchreiben(p.r) && !String(p.r.werte.notiz ?? '').includes(vor())}>
        <p class="still-text klein-text">Vorschlag aus den Abweichungen zur Firma: {vor()} <button type="button" class="knopf klein still" onClick={() => setze(p.r, { notiz: [String(p.r.werte.notiz ?? '').trim(), vor()].filter(Boolean).join('\n') }, 'Prüfvermerk')}>übernehmen</button></p>
      </Show>
      <PruefKnoepfe r={p.r} />
    </div>
  );
}

/** Abschließen / Zurücknehmen und die Freigabe – in der Karte und im letzten Schritt gleich. */
function PruefKnoepfe(p: { r: Zeile }): JSX.Element {
  const fehlt = () => (p.r.werte.zahlbetrag_hand != null && p.r.werte.zahlbetrag_hand !== '' && !String(p.r.werte.hand_grund ?? '').trim() ? 'Für den frei festgesetzten Zahlbetrag fehlt die Begründung.' : '');
  return (
    <div class="re-knoepfe">
      <Show when={istGeprueft(p.r)} fallback={<button type="button" class="knopf haupt" disabled={!darf('rechnung', 'schreiben') || !!fehlt()} title={fehlt() || 'Aufmaß und Betrag festhalten – spätere Aufmaße zählen erst in der nächsten Rechnung'} onClick={() => abschliessen(p.r)}>✓ Prüfung abschließen</button>}>
        <span class="pille gut">geprüft{p.r.werte.geprueft_am ? ` am ${datumText(p.r.werte.geprueft_am)}` : ''}</span>
        <Show when={zuruecknehmbar(p.r) && darf('rechnung', 'schreiben')}><button type="button" class="knopf" onClick={() => zuruecknehmen(p.r)}>Prüfung zurücknehmen</button></Show>
      </Show>
      <button type="button" class="knopf" onClick={() => druckOeffnen('ava.freigabe', p.r.id)}>⎙ Rechnungsfreigabe / PDF …</button>
      <Show when={fehlt()}><small class="fehler-text">{fehlt()}</small></Show>
    </div>
  );
}

const SCHRITTE = ['Rechnung', 'Wie prüfen?', 'Leistung', 'Abzüge', 'Freigabe'];
const [schritt, setSchritt] = createSignal<{ id: string; nr: number } | null>(null);
export const schrittFuerSchritt = (id: string, nr = 1) => setSchritt({ id, nr });

/** „Schritt für Schritt“: dieselben Teile wie in der Karte, nacheinander; in Schritt 3 (nach Aufmaß) die Aufmaßprüfung selbst. */
function SchrittFenster(): JSX.Element {
  const r = () => { const s = schritt(); const z = s ? sicht.rechnung?.[s.id] : undefined; return z && !z.geloescht ? z : undefined; };
  const nr = () => schritt()?.nr ?? 1, geh = (n: number) => setSchritt({ id: schritt()!.id, nr: Math.max(1, Math.min(5, n)) });
  const [knoepfe, setKnoepfe] = createSignal<Knopf[]>([]);
  // Mitte für die Aufmaßprüfung im Fenster: das LV der Rechnung, ihre Knöpfe stehen im Fenster
  const mitte = (): Mitte => ({ alle: () => [], zeilen: () => [], fest: () => ({}), gewaehlt: () => String(r()?.werte.lv ?? ''), onWahl: () => {}, onOeffnen: () => {}, setReihe: () => {}, setKnoepfe, setNeu: () => {} });
  createEffect(() => { if (schritt() && !r()) setSchritt(null); });
  return (
    <Show when={r()}>{(z) => {
      createEffect(() => setRechnungWahl(z().id));
      const lv = () => sicht.lv?.[String(z().werte.lv ?? '')];
      return (
        <Dialog titel={`Rechnung prüfen · ${name(z().werte.firma)} · ${rechnungTitel(z(), rechnungenVon(String(z().werte.lv ?? '')))}${z().werte.nummer ? ` Nr. ${String(z().werte.nummer)}` : ''}`} gross onAbbrechen={() => setSchritt(null)}
          knoepfe={<>
            <Show when={nr() > 1} fallback={<span />}><button type="button" class="knopf" onClick={() => geh(nr() - 1)}>← Zurück</button></Show>
            <span class="re-summe">Leistungsstand netto <b>{eur(leistungJetzt(z()))} €</b>{zahl(z().werte.betrag) ? ` · gefordert ${eur(zahl(z().werte.betrag))} €` : ''}</span>
            <Show when={nr() < 5} fallback={<button type="button" class="knopf haupt" onClick={() => setSchritt(null)}>Fertig</button>}><button type="button" class="knopf haupt" onClick={() => geh(nr() + 1)}>Weiter →</button></Show>
          </>}>
          <div class="re-fenster"><nav class="re-schritte" aria-label="Schritte">
            <For each={SCHRITTE}>{(t, i) => <button type="button" classList={{ hier: nr() === i() + 1, ok: nr() > i() + 1 }} aria-current={nr() === i() + 1 ? 'step' : undefined} onClick={() => geh(i() + 1)}>{i() + 1} {t}</button>}</For>
          </nav>
          <div class="re-schritt">
            <Show when={nr() === 1}><h3>Rechnung</h3><Kopf r={z()} /></Show>
            <Show when={nr() === 2}><h3>Wie wird geprüft?</h3><Pruefweg r={z()} /><p class="still-text klein-text">Vorgeschlagen ist der Weg der letzten Rechnung dieser Art. Wechseln geht auch später – Aufmaß und Zeilen bleiben erhalten.</p></Show>
            <Show when={nr() === 3}>
              <Show when={nachAufmass(z()) && lv()} fallback={<><h3>Leistung</h3><Leistung r={z()} /></>}>
                <div class="re-aufmass">
                  <div class="re-aufmass-baum"><div class="re-aufmass-knoepfe"><For each={knoepfe()}>{(k) => <button type="button" class="knopf klein" disabled={k.gesperrt} onClick={(e) => k.tun(e)}>{k.titel}</button>}</For></div><Aufmasspruefung {...mitte()} /></div>
                  <Show when={lvZeiger() && sicht.lv_position?.[lvZeiger()!]}><div class="re-aufmass-karte"><AufmassKarte position={sicht.lv_position![lvZeiger()!]!} heftzwecke={<button type="button" class="knopf klein still" aria-label="Schließen" onClick={() => setLvZeiger(null)}>✕</button>} /></div></Show>
                </div>
              </Show>
            </Show>
            <Show when={nr() === 4}><h3>Abzüge und Einbehalt</h3><p class="still-text klein-text">Was im Auftrag vereinbart ist, gilt ab Werk – hier je Rechnung änderbar.</p><Abzuege r={z()} /></Show>
            <Show when={nr() === 5}><h3>Freigabe</h3><div class="re-zwei"><Freigabe r={z()} /><div><RechnungLeiter rechnung={z()} /></div></div></Show>
          </div></div>
        </Dialog>
      );
    }}</Show>
  );
}

/** Karte der Rechnung (Mitte der Ansicht „Rechnungen“): alles untereinander. */
function RechnungKarte(p: { r: Zeile; rechnungen: Zeile[] }): JSX.Element {
  const app = useContext(AppUmgebung);
  return (
    <section class="re-karte" aria-label="Rechnung">
      <h2>{rechnungTitel(p.r, p.rechnungen)}{p.r.werte.nummer ? <small> Nr. {String(p.r.werte.nummer)}</small> : ''} · {name(p.r.werte.firma)}
        <span class="pille" classList={{ gut: istGeprueft(p.r) }}>{istGeprueft(p.r) ? `geprüft${p.r.werte.geprueft_am ? ` ${datumText(p.r.werte.geprueft_am)}` : ''}` : 'in Prüfung'}</span></h2>
      <Kopf r={p.r} />
      <h3>Prüfen</h3><Pruefweg r={p.r} />
      <Leistung r={p.r} zumAufmass={() => { setRechnungWahl(p.r.id); app?.onReiter('aufmass'); }} />
      <Abzuege r={p.r} />
      <h3>Freigabe</h3><Freigabe r={p.r} />
      <Show when={p.r.werte.abgelegt}><p class="re-abgelegt">📁 Geprüft abgelegt: <code>{String(p.r.werte.abgelegt)}</code></p></Show>
    </section>
  );
}

/** Auftrag ohne LV und Angebot (bisher „Zettelwirtschaft“): Firma, Kostengruppe, Auftragssumme – ein LV ohne Positionen, an die Firma
 *  vergeben; abgerechnet wird mit Einzelrechnungen. */
function AuftragOhneLv(p: { projekt: string; onZu: () => void; onFertig: (lv: string) => void }): JSX.Element {
  const lvf = (n: string) => modell('lv').felder.find((f) => f.name === n)!;
  const [firma, setFirma] = createSignal<string | null>(null), [kg, setKg] = createSignal<string | null>(null), [summe, setSumme] = createSignal<Wert>(null);
  const ok = () => {
    if (!firma()) { hinweis('Bitte die Firma wählen.', { art: 'fehler' }); return; }
    const lv = neueKennung();
    ausfuehrenMehrere([
      { objekt: 'lv', art: 'anlegen', objektId: lv, werte: { projekt: p.projekt, name: `${name(firma())} (ohne LV)`, kostengruppe: kg(), status: 'vergeben', ohne_lv: true, auftragssumme: summe(), ve_prozent: 0, ma_prozent: 0 } },
      { objekt: 'angebot', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.projekt, lv, bieter: firma(), beauftragt: true, auftragsdatum: heute() } },
    ], 'Auftrag ohne LV');
    p.onFertig(lv);
  };
  return (
    <Dialog titel="Auftrag ohne LV" onAbbrechen={p.onZu} geaendert={() => !!firma()}
      knoepfe={<><button type="button" class="knopf" data-abbrechen>Abbrechen</button><button type="button" class="knopf haupt" onClick={ok}>Anlegen</button></>}>
      <div class="formular">
        <p class="still-text klein-text">Für kleine Aufträge ohne Ausschreibung: nur Firma und Summe. Geprüft wird jede Rechnung für sich (Betrag oder Positionen von Hand), ohne Einbehalt; sie zählt in der Kostenkontrolle unter der Kostengruppe.</p>
        <FeldEingabe feld={{ name: 'firma', titel: 'Firma', art: 'verweis', ziel: 'kontakt', pflicht: true }} wert={firma()} onWert={(w) => setFirma(w ? String(w) : null)} />
        <FeldEingabe feld={lvf('kostengruppe')} wert={kg()} onWert={(w) => setKg(w ? String(w) : null)} />
        <FeldEingabe feld={{ ...lvf('auftragssumme'), titel: 'Auftragssumme netto in € (leer: zählt, was abgerechnet wird)' }} wert={summe()} onWert={setSumme} />
      </div>
    </Dialog>
  );
}

export function Rechnungen(m: Mitte): JSX.Element {
  const lv = () => lvVon(m);
  const a = aufmassVon(() => lv()?.id);
  const z = createMemo(() => (lv() ? lvZahlen(lv()!.id) : undefined));
  const [ohneLv, setOhneLv] = createSignal(false);
  const waehle = (id: string) => { setRechnungWahl(id); };
  const letzte = () => { const R = a.rechnungen(); return a.r() && R.at(-1)?.id === a.r()!.id && !istGeprueft(a.r()!); };
  const wegwerfen = () => {
    const r = a.r(); if (!r) return;
    const weg = (objekt: string, Z: Zeile[]): Vorlage[] => Z.map((x) => ({ objekt, art: 'loeschen' as const, objektId: x.id }));
    const dazu = [...weg('rechnungsmenge', lebende('rechnungsmenge').filter((x) => x.werte.rechnung === r.id)), ...weg('rechnungszeile', zeilenDer(r))];
    ausfuehrenMehrere([...dazu, { objekt: 'rechnung', art: 'loeschen', objektId: r.id }], 'Rechnung in den Papierkorb'); setRechnungWahl(null);
  };
  createEffect(() => m.setKnoepfe([
    ...(lv() && z()?.auftrag && darf('rechnung', 'schreiben') ? [{ titel: 'Rechnung', zeichen: 'neu', gruppe: 'Neu', haupt: true, tun: (e: MouseEvent) => neueRechnung(e, lv()!, (id) => { waehle(id); schrittFuerSchritt(id); }) }] : []),
    ...(projektId() && darf('lv', 'schreiben') ? [{ titel: 'Auftrag ohne LV', zeichen: 'vertrag', gruppe: 'Neu', tun: () => setOhneLv(true) }] : []),
    ...(a.r() ? [{ titel: 'Schritt für Schritt', zeichen: 'liste_aufgaben', gruppe: 'Prüfen', tun: () => schrittFuerSchritt(a.r()!.id, istGeprueft(a.r()!) ? 5 : 2) },
      { titel: 'Rechnungsfreigabe', zeichen: 'drucken', gruppe: 'Ausgabe', tun: () => druckOeffnen('ava.freigabe', a.r()!.id) }] : []),
    ...(lv() && darf('rechnung', 'schreiben') ? [{ titel: 'E-Rechnung einlesen …', zeichen: 'datei_hoch', gruppe: 'Austausch', tun: () => rechnungEinlesen(String(lv()!.werte.projekt)) }] : []),
    ...(letzte() && darf('rechnung', 'loeschen') ? [{ titel: 'In den Papierkorb', zeichen: 'loeschen', gruppe: 'Löschen', rot: true, tun: wegwerfen }] : []),
  ]));
  return (
    <LvListe m={m} zusatz={(l) => { const n = rechnungenVon(l.id).length; return [l.werte.ohne_lv ? 'ohne LV' : '', n ? `${n} ${n === 1 ? 'Rechnung' : 'Rechnungen'}` : ''].filter(Boolean).join(' · '); }}>
      <SchrittFenster />
      <Show when={ohneLv() && projektId()}><AuftragOhneLv projekt={projektId()!} onZu={() => setOhneLv(false)} onFertig={(id) => { setOhneLv(false); lvWaehlen(m, id); }} /></Show>
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis.</p>}>
        <Show when={z()?.auftrag} fallback={<p class="hinweis-kasten">Rechnungen werden mit den Preisen des Auftrags geprüft – dieses LV erst unter „Angebote & Preisspiegel“ vergeben.</p>}>
          <p class="re-auftrag">Auftrag <b>{name(z()!.auftrag!.werte.bieter)}</b> · aktuell <b>{eur(z()!.stand.aktuell)} €</b> · Leistung <b>{eur(z()!.leistung)} €</b> · abgerechnet <b>{eur(z()!.abgerechnet)} €</b></p>
          <RechnungsLeiste rechnungen={a.rechnungen()} gewaehlt={a.r()} onWahl={waehle} leer="Noch keine Rechnung – oben mit „Rechnung“ anlegen." />
          <Show when={a.r()}>{(r) => <RechnungKarte r={r()} rechnungen={a.rechnungen()} />}</Show>
        </Show>
      </Show>
    </LvListe>
  );
}
