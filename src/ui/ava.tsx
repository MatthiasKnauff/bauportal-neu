// Ausschreibung in der Oberfläche: Summen in den Karten (LV, Position) und der Preisspiegel – Positionen mit den Preisen
// aller Bieter:innen nebeneinander, das günstigste je Position markiert, unten Summe, Nachlass, Rang und „Vergeben an …“.
import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { nachfassenFaellig, ruecklaufVon, ruecklaufZaehlen, type Ruecklauf, nachtragNetto, ozVergleich, wertung, zaehlt, zahl, bedingungenAus, gewaehrleistungBis } from '../module/ava/rechnung';
import type { Werte } from '../kern/modell';
import { LV_STATUS, NACHTRAGSSTAENDE, RUECKMELDUNGEN } from '../module/ava/beipackzettel';
import { gaebEinlesen } from './uebernahme';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { lvVon } from './avakopf';
import { springeZu } from './sprung';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, modell } from './unterbau/api';
import { FeldEingabe } from './baukasten/feld';
import { Zeichen } from './baukasten/zeichen';
import { druckOeffnen, verzeichnisDrucken } from './druck';
import { LvListe } from './lvliste';
import { hinweis } from './unterbau/meldungen';
import { BieterDazu } from './preisspiegel';
import { allePositionenVon, angeboteVon, gaebAusgeben, gpMit, lvZahlen, name, positionenVon, preiseVon, type LvZahlen } from './avadaten';
import { istText, istZuschlag, zuschlagAuf } from '../kern/lvarten';
import { LAEUFE, laufText, vorab, type Lauf } from '../module/ava/bieterversand';
import { STUFEN, lvLage } from '../module/ava/lvlage';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { mailSchreiben } from './versand';

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Karte eines LV: die Summen – geschätzt, Angebote (günstigstes), Auftrag, abgerechnet. */
const heute = () => new Date().toLocaleDateString('sv');

/** Überblick des LV oben in der Karte (wie bisher „Details“): Stand in vier Stufen, Schätzung · Auftrag · Nachträge,
 *  Leistungsfortschritt aus dem Aufmaß, was das LV enthält, gelbe Hinweise nur bei Fehlendem oder naher Frist. */
export function LvUeberblick(p: { lv: Zeile }): JSX.Element {
  const pos = () => allePositionenVon(p.lv.id);
  const z = createMemo(() => lvZahlen(p.lv.id));
  const ang = () => angeboteVon(p.lv.id);
  const lage = createMemo(() => { const pr = preiseVon(ang()); const mitPreis = new Set([...pr.values()].map((x) => String(x.werte.angebot)));
    return lvLage(p.lv.werte, pos(), ang(), { vergeben: !!z().auftrag, abgerechnet: z().abgerechnet, heute: heute(), hatAngebot: (a) => !!a.werte.eingang || mitPreis.has(a.id) }); });
  const gesamt = () => z().haupt + z().stand.beauftragt;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const e0 = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
  return (
    <div class="lv-ueberblick">
      <div class="lvu-stufen" role="img" aria-label={`Stand: ${STUFEN[lage().stufe]}`}>
        <For each={STUFEN}>{(s, i) => <div classList={{ fertig: i() < lage().stufe || (i() === 3 && lage().stufe === 3), jetzt: i() === lage().stufe && lage().stufe < 3 }}><i /><span>{s}</span></div>}</For>
      </div>
      <div class="lvu-kacheln">
        <div><small>Schätzung</small><b>{z().schaetzung ? e0(z().schaetzung) : '–'}</b></div>
        <div><small>Auftrag</small><b>{z().auftrag ? e0(z().haupt) : '–'}</b><Show when={z().auftrag}><span>{name(z().auftrag!.werte.bieter)}</span></Show></div>
        <div><small>Nachträge</small><b>{z().stand.beauftragt ? `+ ${e0(z().stand.beauftragt)}` : '–'}</b><Show when={z().stand.offen}><span>offen {e0(z().stand.offen)}</span></Show></div>
      </div>
      <Show when={z().auftrag && gesamt() > 0}>
        <div class="lvu-balken"><div><span>Leistungsfortschritt (Aufmaß)</span><span>{e0(z().leistung)} · {pct(z().leistung, gesamt())} %</span></div>
          <div class="lvu-spur"><i classList={{ ueber: z().leistung > gesamt() }} style={{ width: `${Math.min(100, pct(z().leistung, gesamt()))}%` }} /></div></div>
      </Show>
      <dl class="angaben">
        <dt>Positionen</dt><dd>{lage().positionen}{lage().bedarf || lage().wahl ? ` · davon ${[lage().bedarf ? `${lage().bedarf} Bedarf` : '', lage().wahl ? `${lage().wahl} Wahl` : ''].filter(Boolean).join(', ')}` : ''}</dd>
        <dt>Gliederungspunkte</dt><dd>{lage().titel}</dd>
        <dt>Vorbemerkungen</dt><dd>{lage().vorbemerkungen ? `✓ ${lage().vorbemerkungen} ${lage().vorbemerkungen === 1 ? 'Text' : 'Texte'}` : '–'}</dd>
        <Show when={lage().angeschrieben || lage().angebote}><dt>{lage().angeschrieben ? 'Versendet' : 'Angebote'}</dt>
          <dd>{lage().angeschrieben ? `an ${lage().angeschrieben} · ` : ''}{lage().angebote} {lage().angebote === 1 ? 'Angebot' : 'Angebote'}{z().bestes != null ? ` · günstigstes ${e0(z().bestes!)} (${z().besterBieter})` : ''}</dd></Show>
        <Show when={zahl(p.lv.werte.budget)}><dt>Kostenansatz</dt><dd>{e0(zahl(p.lv.werte.budget))}</dd></Show>
        <Show when={z().rechnungen}><dt>abgerechnet</dt><dd>{e0(z().abgerechnet)}{gesamt() ? ` (${pct(z().abgerechnet, gesamt())} %)` : ''} · {z().rechnungen} {z().rechnungen === 1 ? 'Rechnung' : 'Rechnungen'}</dd></Show>
      </dl>
      <Show when={lage().warnungen.length}><p class="lvu-warn" role="note">{lage().warnungen.join(' · ')}</p></Show>
      <div class="reihe">
        <button type="button" class="knopf klein" onClick={() => druckOeffnen('ava.lv', p.lv.id)}>Drucken</button>
        <button type="button" class="knopf klein" disabled={!positionenVon(p.lv.id).length} title="Angebotsaufforderung: das LV ohne Preise für die Bieter:innen" onClick={() => gaebAusgeben(p.lv)}>X83 ausgeben</button>
        <Show when={darf('lv_position', 'schreiben')}><button type="button" class="knopf klein" title="X83/X86: Positionen mit diesem LV abgleichen · X84: ein Angebot mit Preisen einlesen" onClick={() => gaebEinlesen(String(p.lv.werte.projekt), p.lv.id)}>GAEB einlesen …</button></Show>
      </div>
    </div>
  );
}

/** Karte einer Zuschlagsposition (wie bisher Art Z): auf welche Positionen des LV der Satz gerechnet wird – zum Ankreuzen. */
export function ZuschlagAuf(p: { pos: Zeile }): JSX.Element | undefined {
  if (!istZuschlag(p.pos.werte.art)) return undefined;
  const kandidaten = () => allePositionenVon(String(p.pos.werte.lv ?? '')).filter((q) => q.id !== p.pos.id && !istText(q.werte.art) && !istZuschlag(q.werte.art));
  const auf = () => new Set(zuschlagAuf(p.pos.werte));
  const setzen = (ids: Set<string>) => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: p.pos.id, werte: { zuschlag_auf: [...ids].join(',') || null } }, 'Zuschlag auf Positionen');
  const umschalten = (id: string) => { const n = new Set(auf()); if (n.has(id)) n.delete(id); else n.add(id); setzen(n); };
  const schreiben = () => darf('lv_position', 'schreiben');
  return (
    <div class="zuschlag-auf">
      <div class="reihe"><strong>Zuschlag auf</strong><span class="still-text klein-text">{auf().size} von {kandidaten().length} Positionen</span>
        <Show when={schreiben()}><button type="button" class="knopf klein still" onClick={() => setzen(new Set(kandidaten().map((q) => q.id)))}>alle</button>
          <button type="button" class="knopf klein still" onClick={() => setzen(new Set())}>keine</button></Show></div>
      <ul><For each={kandidaten()}>{(q) => <li><label><input type="checkbox" disabled={!schreiben()} checked={auf().has(q.id)} onChange={() => umschalten(q.id)} /> {String(q.werte.oz ?? '')} {String(q.werte.kurztext ?? '')}</label></li>}</For></ul>
    </div>
  );
}

/** Karte einer Position: der Gesamtpreis (und warum er nicht zählt). */
export function PositionSumme(p: { pos: Zeile }): JSX.Element | undefined {
  if (istText(p.pos.werte.art)) return undefined;
  return <p class="ava-gp">Gesamtpreis geschätzt: <b>{eur(gpMit(p.pos))} €</b>{!zaehlt(p.pos) ? ' – zählt nicht zur Summe des LV' : ''}</p>;
}


/** Für die Karte eines Angebots: seine Summe und sein Rang im Preisspiegel. */
export function AngebotSumme(p: { angebot: Zeile }): JSX.Element {
  const lvId = () => String(p.angebot.werte.lv ?? '');
  const w = createMemo(() => { const ang = angeboteVon(lvId()), pr = preiseVon(ang); return wertung(positionenVon(lvId()), ang, (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null)).find((x) => x.angebot === p.angebot.id); });
  return <Show when={w()}>{(x) => <p class="ava-gp">Summe netto <b>{eur(x().netto)} €</b>, nach Nachlass <b>{eur(x().nachLass)} €</b>{x().rang ? ` · Rang ${x().rang}` : ''}{x().fehlend ? ` · ${x().fehlend} Positionen ohne Preis` : ''}</p>}</Show>;
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
                  <For each={posVon(n)}>{(q) => <tr class="nt-pos"><td>{String(q.werte.oz ?? '')}</td><td colSpan={2}>{String(q.werte.kurztext ?? '')} · {String(q.werte.menge ?? '').replace('.', ',')} {String(q.werte.einheit ?? '')} × {q.werte.ep != null ? eur(zahl(q.werte.ep)) : '–'} €</td><td class="zahl still-text">{eur(gpMit(q))}</td></tr>}</For>
                </>)}</For>
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Auftrag aktuell (Hauptauftrag + beauftragte Nachträge)</td><td class="zahl">{eur(stand().aktuell)}</td></tr>
                <tr><td colSpan={3}>offene Nachträge (angemeldet bis geprüft)</td><td class="zahl">{eur(stand().offen)}</td></tr>
                <tr class="ps-summe"><td colSpan={3}>Prognose</td><td class="zahl">{eur(stand().prognose)}</td></tr>
                <tr><td colSpan={3}>abgerechnet (geprüfte Rechnungen, Leistungsstand nach Nachlass)</td><td class="zahl">{eur(abgerechnet())}</td></tr>
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
          <thead><tr><th>LV</th><th>Stand</th><th class="zahl">Schätzung</th><th class="zahl">bestes Angebot</th><th class="zahl">Auftrag</th><th class="zahl">Nachträge</th><th class="zahl">{"abge\u00ADrechnet"}</th><th class="zahl">noch offen</th><th class="zahl">{"Abw. zur Schät\u00ADzung"}</th></tr></thead>
          <tbody>
            <For each={zeilen()}>{(x) => (
              <tr classList={{ gewaehlt: p.gewaehlt() === x.l.id }} onClick={() => { p.onWahl(x.l.id); p.onOeffnen(); }}>
                <td><span class="kk-nr">{String(x.l.werte.nummer ?? '')}</span> {String(x.l.werte.name ?? '')}</td><td>{STAND[String(x.l.werte.status ?? '')] ?? ''}</td>
                <td class="zahl">{x.z.schaetzung ? eur(x.z.schaetzung) : '–'}</td><td class="zahl">{zelle(x.z.bestes)}</td>
                <td class="zahl">{x.z.auftrag ? eur(x.z.haupt) : '–'}</td><td class="zahl">{x.z.auftrag && x.z.stand.beauftragt ? eur(x.z.stand.beauftragt) : '–'}</td>
                <td class="zahl">{x.z.rechnungen ? eur(x.z.abgerechnet) : '–'}</td><td class="zahl">{zelle(offen(x.z))}</td>
                <td class="zahl" classList={{ 'gefahr-text': (abw(x.z) ?? 0) > 0, 'gut-text': (abw(x.z) ?? 0) < 0 }}><Show when={abw(x.z) != null}>{`${abw(x.z)! > 0 ? '+' : ''}${eur(abw(x.z)!)}`}<br /><small>{`${abw(x.z)! > 0 ? '+' : ''}${(abw(x.z)! / x.z.schaetzung * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`}</small></Show></td>
              </tr>
            )}</For>
          </tbody>
          <tfoot><tr class="ps-summe"><td colSpan={2}>Summe netto in €</td><td class="zahl">{eur(summe((z) => z.schaetzung))}</td><td class="zahl">{eur(summe((z) => z.bestes))}</td><td class="zahl">{eur(summe((z) => (z.auftrag ? z.haupt : null)))}</td>
            <td class="zahl">{eur(summe((z) => (z.auftrag ? z.stand.beauftragt : null)))}</td><td class="zahl">{eur(summe((z) => z.abgerechnet))}</td><td class="zahl">{eur(summe(offen))}</td><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

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
        <thead><tr><Show when={p.mitLv}><th>LV</th><th>Abgabe</th></Show><th>Bieter:in · Telefon</th><th title="angeschrieben am">{'ange\u00ADschrieben'}</th><th>Stand</th><th>{'Nach\u00ADfassen'}</th><th>Angebot</th></tr></thead>
        <tbody>
          <For each={p.bieter}>{(a) => {
            const st = () => ruecklaufVon(a);
            return (
              <tr classList={{ 'vr-faellig': nachfassenFaellig(a, heute()), 'vr-ab': st() === 'gibt_nicht_ab' }}>
                <Show when={p.mitLv}><td><button type="button" class="link-knopf" onClick={() => p.onLv?.(String(a.werte.lv))}>{lvName(a.werte.lv)}</button></td><td>{datum(sicht.lv?.[String(a.werte.lv)]?.werte.abgabe)}</td></Show>
                <td><span class="vr-name">{name(a.werte.bieter)}<Show when={!p.mitLv && darf('angebot', 'loeschen')}><button type="button" class="knopf klein still vr-weg" title="Bieter:in entfernen – mit Angebot und Preisen in den Papierkorb (Rückgängig holt alles zurück)" aria-label={`${name(a.werte.bieter)} entfernen`} onClick={() => bieterEntfernen(a)}><Zeichen name="loeschen" groesse={14} /></button></Show></span><Show when={telefon(a)}><br /><a class="klein-text" href={`tel:${telefon(a).replace(/[^+\d]/g, '')}`}>{telefon(a)}</a></Show></td>
                <td>{datum(a.werte.angeschrieben)}</td>
                <td><Show when={schreiben() && st() !== 'abgegeben'} fallback={<b class={`vr-${st()}`}>{STAND_RUECKLAUF[st()]}</b>}>
                  <Auswahlliste titel={`Rückmeldung ${name(a.werte.bieter)}`} wert={String(a.werte.rueckmeldung || 'offen')} optionen={RUECKMELDUNGEN} onWert={(w) => aendern(a, { rueckmeldung: w }, 'Rückmeldung')} /></Show></td>
                <td><Show when={schreiben() && st() !== 'abgegeben' && st() !== 'gibt_nicht_ab'} fallback={a.werte.nachfassen ? datum(a.werte.nachfassen) : ''}>
                  <FeldEingabe feld={{ name: 'nachfassen', titel: `Nachfassen ${name(a.werte.bieter)}`, art: 'datum' }} wert={a.werte.nachfassen ?? null} onWert={(w) => aendern(a, { nachfassen: w || null }, 'Nachfassen')} />
                  <Show when={nachfassenFaellig(a, heute())}><small class="gefahr-text"> fällig</small></Show></Show></td>
                <td><Show when={a.werte.eingang} fallback={<Show when={schreiben() && st() !== 'gibt_nicht_ab'}><button type="button" class="knopf klein" onClick={() => aendern(a, { eingang: heute() }, 'Angebot eingegangen')}>eingegangen</button></Show>}>
                  {datum(a.werte.eingang)}</Show></td>
              </tr>
            );
          }}</For>
        </tbody>
      </table>
    </div>
  );
}

/** Versand & Rücklauf (wie im bisherigen Bauportal): je LV die angeschriebenen Bieter:innen – Rückmeldung, Nachfassen, Eingang –
 *  mit Fristen und Zählern; Unterlagen als PDF und GAEB X83 – verschickt über die zentrale Versandstelle (Postausgang). */
export function Versand(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const bieter = createMemo(() => (lv() ? angeboteVon(lv()!.id) : []));
  const z = createMemo(() => ruecklaufZaehlen(bieter()));
  const [dazu, setDazu] = createSignal(false);
  const feld = (n: string) => modell('lv').felder.find((f) => f.name === n)!;
  /** Wie bisher je Datei: noch nicht verschickt · wartet im Postausgang · verschickt am … (aus den Nachrichten mit diesen Unterlagen) */
  const unterlagenStand = createMemo(() => {
    const l = lv(); if (!l) return '';
    const n = lebende('nachricht').filter((x) => String(x.werte.anhaenge ?? '').includes(`x83|${l.id}`));
    const am = n.map((x) => String(x.werte.verschickt_am ?? '')).filter(Boolean).sort().at(-1);
    if (am) return `verschickt am ${am.slice(8, 10)}.${am.slice(5, 7)}.${am.slice(0, 4)}`;
    return n.some((x) => x.werte.stand === 'wartet') ? 'wartet im Postausgang' : n.some((x) => x.werte.stand === 'zurueckgehalten') ? 'zurückgehalten (Testserver)' : 'noch nicht verschickt';
  });
  /** Ein Lauf über den einen Mail-Dialog: Unterlagen entstehen beim Versand, „angeschrieben am“ hält derselbe Schritt fest. */
  const anBieter = (lauf: Lauf) => {
    const l = lv()!, b = bieter(), t = laufText(lauf, l.werte, sicht.projekt?.[String(l.werte.projekt)]?.werte, sicht.buero?.[BUERO_ID]?.werte);
    const dateiname = [l.werte.nummer, l.werte.name].filter(Boolean).join(' ');
    mailSchreiben({ titel: LAEUFE[lauf].titel, projekt: String(l.werte.projekt ?? '') || undefined, betreff: t.betreff, text: t.text,
      ids: b.map((a) => String(a.werte.bieter)), vorab: vorab(lauf, b).map((a) => String(a.werte.bieter)),
      anhaenge: LAEUFE[lauf].unterlagen ? [{ titel: `LV ${dateiname}.pdf`, anhang: { art: 'druck', ausdruck: 'ava.lv', id: l.id } }, { titel: `LV ${dateiname}.X83`, anhang: { art: 'x83', id: l.id } }] : undefined,
      quelle: (k) => `angebot|${b.find((a) => a.werte.bieter === k)?.id ?? ''}`,
      dazu: lauf === 'versand' ? (ks) => b.filter((a) => ks.includes(String(a.werte.bieter)) && !a.werte.angeschrieben)
        .map((a) => ({ objekt: 'angebot', art: 'aendern' as const, objektId: a.id, werte: { angeschrieben: heute() } })) : undefined });
  };
  createEffect(() => p.setKnoepfe([
    ...(lv() && darf('angebot', 'schreiben') ? [{ titel: 'Bieter:in', zeichen: 'person_neu', gruppe: 'Neu', tun: () => setDazu(true) }] : []),
    ...(lv() && bieter().length ? (['versand', 'erinnerung', 'nachversand'] as Lauf[]).map((l) => ({ titel: LAEUFE[l].knopf, zeichen: l === 'erinnerung' ? 'glocke' : 'senden', gruppe: 'Versand',
      gesperrt: !darf('nachricht', 'schreiben') || (l !== 'versand' && !bieter().some((a) => a.werte.angeschrieben)), tun: () => anBieter(l) })) : []),
    { titel: 'Nachverfolgen', zeichen: 'telefon', gruppe: 'Nachverfolgen', tun: () => springeZu('lv', lv()?.id ?? '', { modul: 'ava', ansicht: 'nachverfolgen' }) },
    ...(lv() && bieter().length ? [{ titel: 'Bieterliste', zeichen: 'drucken', gruppe: 'Datei', rechts: true, tun: () => {
      const l = lv()!; verzeichnisDrucken('ava.bieterliste', [{ titel: 'Die Bieter:innen dieses LV', ids: bieter().map((a) => a.id), filter: `LV ${String(l.werte.nummer ?? '')} ${String(l.werte.name ?? '')}`.trim() }]);
    } }] : []),
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
            <span class="pille">immer dabei</span><span class="vr-stand">{unterlagenStand()}</span><button type="button" class="knopf klein" onClick={() => druckOeffnen('ava.lv', lv()!.id)}>Ansehen</button></div>
          <div class="vr-datei"><Zeichen name="datei_runter" groesse={16} /><span><b>LV {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' ')}.x83</b><small>LV als GAEB-Datei – für die Kalkulation der Bieter:innen</small></span>
            <span class="pille">GAEB</span><span class="vr-stand">{unterlagenStand()}</span><button type="button" class="knopf klein" disabled={!positionenVon(lv()!.id).length} onClick={() => gaebAusgeben(lv()!)}>Herunterladen</button></div>
          <p class="still-text klein-text">„An Bieter:innen senden“ legt je Firma eine Mail in den Postausgang; PDF und X83 entstehen beim Verschicken aus dem dann aktuellen Stand.</p>
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
