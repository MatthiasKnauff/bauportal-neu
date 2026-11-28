// Ausschreibung in der Oberfläche: Summen in den Karten (LV, Position) und der Preisspiegel – Positionen mit den Preisen
// aller Bieter:innen nebeneinander, das günstigste je Position markiert, unten Summe, Nachlass, Rang und „Vergeben an …“.
import { gewerkPasst } from '../module/ava/gewerkpasst';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { nachfassenFaellig, ruecklaufZaehlen, nachtragNetto, ozVergleich, wertung, zaehlt, zahl, bedingungenAus, gewaehrleistungBis } from '../module/ava/rechnung';
import type { Feld, ObjektModell, Werte } from '../kern/modell';
import { Tabelle } from './baukasten/tabelle';
import { auswahlAnlegen } from './baukasten/auswahl';
import { LV_STATUS, NACHTRAGSSTAENDE, RUECKMELDUNGEN } from '../module/ava/beipackzettel';
import { gaebEinlesen } from './uebernahme';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { lvFolge, lvVon } from './avakopf';
import { springeZu } from './sprung';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht, wirksameWerte } from './unterbau/abgleich';
import { darf, ich, modell, neueKennung, ruf, zustand } from './unterbau/api';
import { holen, merken } from './unterbau/speicher';
import { hinweis } from './unterbau/meldungen';
import { zeigeMenue } from './baukasten/kontextmenue';
import { herunterladen } from './baukasten/herunterladen';
import { xlsxSchreiben } from '../kern/xlsx';
import { FeldEingabe } from './baukasten/feld';
import { Wahltabelle } from './baukasten/wahltabelle';
import { Zeichen } from './baukasten/zeichen';
import { druckOeffnen, verzeichnisDrucken } from './druck';
import { LvListe } from './lvliste';
import { allePositionenVon, angeboteVon, aufmassStand, epVon, gaebAusgeben, gpMit, lvZahlen, name, positionenVon, preiseVon } from './avadaten';
import { rechenweg } from '../kern/rechenweg';
import { zahlText } from './lvbearbeiten';
import { DokumentListe, dokumenteAblegen, setAblageZiel } from './dokumentablage';
import { OrdnerFenster, groesse } from './dateien';
import { istText, istZuschlag, zuschlagAuf } from '../kern/lvarten';
import { LAEUFE, laufText, sammelText, sammelWerte, textMerken, vorab, type Lauf } from '../module/ava/bieterversand';
import { BieterTabelle, adresseVon, anredeVonAngebot, datum } from './bietertabelle';
import { STUFEN, lvLage } from '../module/ava/lvlage';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { mailSchreiben } from './versand';
import type { Anhang } from '../module/verwaltung/versand';

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
export function ZuschlagAuf(p: { pos: Zeile }): JSX.Element {
  const kandidaten = () => allePositionenVon(String(p.pos.werte.lv ?? '')).filter((q) => q.id !== p.pos.id && !istText(q.werte.art) && !istZuschlag(q.werte.art));
  const auf = () => new Set(zuschlagAuf(p.pos.werte));
  const setzen = (ids: Set<string>) => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: p.pos.id, werte: { zuschlag_auf: [...ids].join(',') || null } }, 'Zuschlag auf Positionen');
  const umschalten = (id: string) => { const n = new Set(auf()); if (n.has(id)) n.delete(id); else n.add(id); setzen(n); };
  const schreiben = () => darf('lv_position', 'schreiben');
  return (
    <Show when={istZuschlag(p.pos.werte.art)}><div class="zuschlag-auf">
      <div class="reihe"><strong>Zuschlag auf</strong><span class="still-text klein-text">{auf().size} von {kandidaten().length} Positionen</span>
        <Show when={schreiben()}><button type="button" class="knopf klein still" onClick={() => setzen(new Set(kandidaten().map((q) => q.id)))}>alle</button>
          <button type="button" class="knopf klein still" onClick={() => setzen(new Set())}>keine</button></Show></div>
      <ul><For each={kandidaten()}>{(q) => <li><label><input type="checkbox" disabled={!schreiben()} checked={auf().has(q.id)} onChange={() => umschalten(q.id)} /> {String(q.werte.oz ?? '')} {String(q.werte.kurztext ?? '')}</label></li>}</For></ul>
    </div></Show>
  );
}

/** Karte einer Position: der Gesamtpreis (und warum er nicht zählt), wenn vergeben der EP des Auftrags und das Aufmaß bisher (wie bisher). */
export function PositionSumme(p: { pos: Zeile }): JSX.Element {
  const lvId = () => String(p.pos.werte.lv ?? '');
  const epAuftrag = createMemo(() => (lvZahlen(lvId()).auftrag ? epVon(lvId())(p.pos) : null));
  const aufmass = createMemo(() => aufmassStand(lvId()).get(p.pos.id) ?? 0);
  const einheit = () => String(p.pos.werte.einheit ?? '');
  return <Show when={!istText(p.pos.werte.art)}>
    <p class="ava-gp">Gesamtpreis geschätzt: <b>{eur(gpMit(p.pos))} €</b>{!zaehlt(p.pos) ? ' – zählt nicht zur Summe des LV' : ''}</p>
    <Show when={epAuftrag() != null}><p class="ava-gp">EP Auftrag: <b>{eur(epAuftrag()!)} €</b></p></Show>
    <Show when={aufmass()}><p class="ava-gp">Aufmaß bisher: <b>{zahlText(aufmass())} {einheit()}</b>{zahl(p.pos.werte.menge) ? ` · ${Math.round(aufmass() / zahl(p.pos.werte.menge) * 100)} % der LV-Menge` : ''}</p></Show>
  </Show>;
}

/** Unter dem Langtext einer Position (wie bisher Reiter „Grafik“): Fotos und Skizzen – im LV-Ausdruck stehen sie unter dem Langtext. */
export function PositionBilder(p: { pos: Zeile }): JSX.Element {
  const bilder = () => lebende('dokument').filter((d) => d.werte.bezug === p.pos.id);
  let wahl!: HTMLInputElement;
  const titel = () => `Position ${String(p.pos.werte.oz ?? '')} ${String(p.pos.werte.kurztext ?? '')}`.trim();
  return <Show when={!istText(p.pos.werte.art) || bilder().length}><div class="pos-bilder">
    <Show when={bilder().length}><DokumentListe dokumente={bilder()} /></Show>
    <Show when={darf('dokument', 'schreiben')}>
      <button type="button" class="knopf klein" title="Fotos oder Skizzen zur Position – sie stehen im Ausdruck unter dem Langtext" onClick={() => wahl.click()}><Zeichen name="foto" groesse={16} /> Foto oder Skizze …</button>
      <input ref={wahl} type="file" accept="image/*,.pdf" multiple hidden onChange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length) dokumenteAblegen(f, { zu: { objekt: 'lv_position', id: p.pos.id, titel: titel(), art: 'lvbild' } }); }} />
    </Show>
  </div></Show>;
}

/** Unter dem Rechenweg der Menge: was er ergibt – „= übernehmen“ setzt die Menge (wie bisher). */
export function MengeAusRechenweg(p: { pos: Zeile }): JSX.Element {
  const r = () => rechenweg(p.pos.werte.mengen_rechenweg);
  const text = () => String(p.pos.werte.mengen_rechenweg ?? '').trim();
  const gleich = () => r().summe != null && r().summe === zahl(p.pos.werte.menge);
  return <Show when={text()}>
    <p class="ava-gp">{r().summe == null ? <span class="feld-fehler">Rechenweg nicht lesbar</span> : <>= <b>{zahlText(r().summe!)} {String(p.pos.werte.einheit ?? '')}</b></>}
      <Show when={r().summe != null && !gleich() && darf('lv_position', 'schreiben')}> <button type="button" class="knopf klein" onClick={() => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: p.pos.id, werte: { menge: r().summe } }, 'Menge aus dem Rechenweg')}>= übernehmen</button></Show>
    </p>
  </Show>;
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
  const w = () => wirksameWerte(modell('lv'), p.lv.werte), b = () => bedingungenAus(w());
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
// Kostenkontrolle als Tabelle (Baustein): je LV eine Zeile – sortieren, Spalten wählen und ordnen wie überall
const KK_GELD = ['schaetzung', 'bestes', 'auftrag', 'nachtraege', 'abgerechnet', 'offen', 'abweichung'];
const KOSTENKONTROLLE: ObjektModell = {
  name: 'ava_kostenkontrolle', titel: 'LV', titelMehrzahl: 'LVs', anzeigeFeld: 'lv', sortierFeld: 'nummer', rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'nummer', titel: 'Nr.', art: 'text', inListe: true, breite: 60 }, { name: 'lv', titel: 'LV', art: 'text', inListe: true, breite: 220 },
    { name: 'stand', titel: 'Stand', art: 'text', inListe: true, breite: 110 },
    { name: 'schaetzung', titel: 'Schätzung', art: 'zahl', inListe: true, breite: 110 }, { name: 'bestes', titel: 'bestes Angebot', art: 'zahl', inListe: true, breite: 120 },
    { name: 'auftrag', titel: 'Auftrag', art: 'zahl', inListe: true, breite: 110 }, { name: 'nachtraege', titel: 'Nachträge', art: 'zahl', inListe: true, breite: 110 },
    { name: 'abgerechnet', titel: 'abgerechnet', art: 'zahl', inListe: true, breite: 110 }, { name: 'offen', titel: 'noch offen', art: 'zahl', inListe: true, breite: 110 },
    { name: 'abweichung', titel: 'Abweichung zur Schätzung', art: 'zahl', inListe: true, breite: 130 },
  ],
};
export function Kostenkontrolle(p: Mitte): JSX.Element {
  const STAND: Record<string, string> = Object.fromEntries(LV_STATUS.map((x) => [x.wert, x.titel]));
  const zeilen = createMemo((): Zeile[] => p.zeilen().filter((l) => !l.werte.archiviert).map((l) => {
    const z = lvZahlen(l.id), vergeben = z.auftrag ? z.stand.aktuell : null, v = vergeben ?? z.bestes;
    return { id: l.id, geloescht: false, werte: { nummer: String(l.werte.nummer ?? ''), lv: String(l.werte.name ?? ''), stand: STAND[String(l.werte.status ?? '')] ?? '',
      schaetzung: z.schaetzung || null, bestes: z.bestes, auftrag: z.auftrag ? z.haupt : null, nachtraege: z.auftrag && z.stand.beauftragt ? z.stand.beauftragt : null,
      abgerechnet: z.rechnungen ? z.abgerechnet : null, offen: z.auftrag ? Math.round((z.stand.aktuell - z.abgerechnet) * 100) / 100 : null,
      // Abweichung zur Schätzung: mit Auftrag der aktuelle Auftrag, sonst das beste Angebot (in % in der Zelle)
      abweichung: v == null || !z.schaetzung ? null : Math.round((v - z.schaetzung) * 100) / 100, prozent: v == null || !z.schaetzung ? null : (v - z.schaetzung) / z.schaetzung * 100 } };
  }));
  const zelle = (f: Feld, z: Zeile): JSX.Element | undefined => {
    if (!KK_GELD.includes(f.name)) return undefined;
    const n = z.werte[f.name] as number | null;
    if (f.name !== 'abweichung') return <span class="zahl">{n == null ? '–' : eur(n)}</span>;
    return n == null ? <span /> : <span class="zahl" classList={{ 'gefahr-text': n > 0, 'gut-text': n < 0 }}>{`${n > 0 ? '+' : ''}${eur(n)}`} <small>{`${n > 0 ? '+' : ''}${(z.werte.prozent as number).toFixed(1).replace('.', ',')} %`}</small></span>;
  };
  return (
    <div class="preisspiegel-flaeche">
      <p class="still-text klein-text">Alle Vergabeeinheiten des Projekts: Schätzung im LV, bestes Angebot, Auftrag und beauftragte Nachträge (nach Nachlass), anerkannte Abrechnung. Klick öffnet das LV.</p>
      <Tabelle modell={KOSTENKONTROLLE} zeilen={zeilen()} gewaehlt={p.gewaehlt()} onWahl={(id) => { if (id) { p.onWahl(id); p.onOeffnen(); } }} leer="Noch kein LV im Projekt." zelle={zelle}
        summeTitel="Summe netto in €" summe={(f, l) => (KK_GELD.includes(f.name) && f.name !== 'abweichung' ? eur(Math.round(l.reduce((s, z) => s + ((z.werte[f.name] as number | null) ?? 0), 0) * 100) / 100) : undefined)} />
    </div>
  );
}

/** Bieterliste als Excel (wie bisher): Firma, Ansprechperson, Telefon, E-Mail, angeschrieben, Rückmeldung, nächster Anruf, Angebot. */
function bieterlisteExcel(lvText: string, bieter: Zeile[]): void {
  const k = (a: Zeile) => sicht.kontakt?.[String(a.werte.bieter ?? '')]?.werte ?? {};
  const tag = (w: unknown) => (w ? new Date(`${String(w).slice(0, 10)}T12:00:00`) : null);
  const zeilen = [['Bieter:in', 'Ansprechperson', 'Telefon', 'E-Mail', 'angeschrieben', 'Rückmeldung', 'nächster Anruf', 'Angebot eingegangen'],
    ...bieter.map((a) => [name(a.werte.bieter), String(a.werte.ansprechpartner || k(a).ansprechpartner || ''), String(k(a).telefon || k(a).mobil || ''), adresseVon(a), tag(a.werte.angeschrieben),
      RUECKMELDUNGEN.find((r) => r.wert === (a.werte.rueckmeldung || 'offen'))?.titel ?? '', tag(a.werte.nachfassen), tag(a.werte.eingang)])];
  herunterladen(new Blob([xlsxSchreiben(zeilen, 'Bieterliste')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Bieterliste ${lvText} ${heute()}.xlsx`);
}

/** Unterlagen für die Bieter:innen (wie bisher): die Dokumente, die beim LV liegen – Pläne, Dateien aus dem Projektordner, vom Rechner. */
const unterlagenVon = (l: Zeile) => lebende('dokument').filter((d) => d.werte.bezug === l.id).sort((a, b) => String(a.werte.name ?? '').localeCompare(String(b.werte.name ?? ''), 'de'));
/** Was davon nicht mitgeht (je LV gemerkt, Kennungen „a,b“). */
const ohneUnterlage = (l: Zeile) => new Set(String(l.werte.versand_ohne ?? '').split(',').filter(Boolean));

/** Was mit einem LV an die Bieter:innen geht: LV als PDF, GAEB X83 (abschaltbar) und die Unterlagen, die mitgehen sollen. */
function lvAnhaenge(l: Zeile): { titel: string; anhang: Anhang }[] {
  const dateiname = [l.werte.nummer, l.werte.name].filter(Boolean).join(' ');
  return [{ titel: `LV ${dateiname}.pdf`, anhang: { art: 'druck', ausdruck: 'ava.lv', id: l.id } },
    ...(l.werte.versand_ohne_x83 === true ? [] : [{ titel: `LV ${dateiname}.X83`, anhang: { art: 'x83' as const, id: l.id } }]),
    ...unterlagenVon(l).filter((d) => !ohneUnterlage(l).has(d.id)).map((d) => ({ titel: String(d.werte.name ?? 'Dokument'), anhang: { art: 'dokument' as const, id: d.id } }))];
}

/** Mail-Dialog für einen Lauf (Versand, Erinnern, Nachversand) – nur: diese Firmen (einzeln, z. B. aus dem Nachverfolgen). */
export function versandOeffnen(l: Zeile, lauf: Lauf, nur?: Zeile[]): void {
  const b = angeboteVon(l.id), pw = sicht.projekt?.[String(l.werte.projekt)]?.werte, bw = sicht.buero?.[BUERO_ID]?.werte;
  const t = laufText(lauf, l.werte, pw, bw);
  const von = (k: string) => b.find((a) => a.werte.bieter === k);
  mailSchreiben({ titel: nur?.length === 1 ? `${LAEUFE[lauf].titel}: ${name(nur[0]!.werte.bieter)}` : LAEUFE[lauf].titel, projekt: String(l.werte.projekt ?? '') || undefined, betreff: t.betreff, text: t.text,
    ids: (nur ?? b).map((a) => String(a.werte.bieter)), vorab: (nur ?? vorab(lauf, b)).map((a) => String(a.werte.bieter)),
    an: (k) => { const a = von(k); return a ? adresseVon(a) : undefined; }, anrede: (k) => { const a = von(k); return a ? anredeVonAngebot(a) : undefined; },
    vorlage: laufText(lauf, l.werte, pw, bw, true),
    merken: darf('lv', 'schreiben') ? { titel: 'Text für dieses LV merken', tun: (bt, tx) => [{ objekt: 'lv', art: 'aendern', objektId: l.id, werte: { versand_texte: textMerken(lauf, l.werte, pw, bw, bt, tx) } }] } : undefined,
    anhaenge: LAEUFE[lauf].unterlagen ? lvAnhaenge(l) : undefined,
    quelle: (k) => `angebot|${von(k)?.id ?? ''}`,
    dazu: lauf === 'versand' ? (ks) => b.filter((a) => ks.includes(String(a.werte.bieter)) && !a.werte.angeschrieben)
      .map((a) => ({ objekt: 'angebot', art: 'aendern' as const, objektId: a.id, werte: { angeschrieben: heute() } })) : undefined });
}

/** Wie bisher beim Entfernen einer schon angeschriebenen Firma: „Bitte nicht beachten“ über den Mail-Dialog (nichts automatisch). */
function bitteNichtBeachten(l: Zeile, a: Zeile): void {
  const lvName = [l.werte.nummer, l.werte.name].filter(Boolean).join(' ');
  mailSchreiben({ titel: `Bitte nicht beachten: ${name(a.werte.bieter)}`, projekt: String(l.werte.projekt ?? '') || undefined, ids: [String(a.werte.bieter)],
    an: () => adresseVon(a), anrede: () => anredeVonAngebot(a), betreff: `Bitte nicht beachten – ${lvName}`,
    text: `{anrede}\n\nunsere Anfrage zu „${lvName}“ hat Sie versehentlich erreicht. Bitte betrachten Sie sie als gegenstandslos – ein Angebot ist nicht nötig.\n\nMit freundlichen Grüßen\n\n${String(sicht.buero?.[BUERO_ID]?.werte.name ?? '')}` });
}

/** Unterlagen für die Bieter:innen (wie bisher): LV als PDF (immer), GAEB X83 (an/aus) und die Dokumente beim LV – je mit „mitschicken“,
 *  dazu „Vom Rechner …“ und „Aus dem Projektordner …“. Neu seit dem letzten Versand steht dabei. */
function Unterlagen(p: { lv: Zeile; stand: string }): JSX.Element {
  const l = () => p.lv, name = () => [l().werte.nummer, l().werte.name].filter(Boolean).join(' ');
  const schreiben = () => darf('lv', 'schreiben');
  const docs = () => unterlagenVon(l()), ohne = () => ohneUnterlage(l());
  const zuletzt = () => lebende('nachricht').filter((x) => String(x.werte.anhaenge ?? '').includes(`x83|${l().id}`) || String(x.werte.anhaenge ?? '').includes(`druck|ava.lv|${l().id}`))
    .map((x) => String(x.werte.verschickt_am ?? '').slice(0, 10)).filter(Boolean).sort().at(-1) ?? '';
  const setzen = (werte: Werte, titel: string) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: l().id, werte }, titel);
  const umschalten = (id: string) => { const n = new Set(ohne()); if (n.has(id)) n.delete(id); else n.add(id); setzen({ versand_ohne: [...n].join(',') }, 'Unterlage mitschicken'); };
  const [ordner, setOrdner] = createSignal(false);
  let wahl!: HTMLInputElement;
  const zu = () => ({ objekt: 'lv', id: l().id, titel: `LV ${name()}`, art: 'unterlage' });
  const ausOrdner = async (pfad: string, bytes: number) => {
    setOrdner(false);
    try { await ruf('/api/dokument/verweis', { id: neueKennung(), projekt: String(l().werte.projekt ?? ''), pfad, groesse: bytes, art: 'Unterlage für die Bieter:innen', bezug_objekt: 'lv', bezug: l().id }); hinweis(`„${pfad.split('/').pop()}“ liegt jetzt bei den Unterlagen.`); }
    catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
  };
  const mitZahl = () => 1 + (l().werte.versand_ohne_x83 === true ? 0 : 1) + docs().filter((d) => !ohne().has(d.id)).length;
  // wie bisher: hineingezogene Dateien werden Unterlagen dieses LV
  createEffect(() => setAblageZiel(darf('dokument', 'schreiben') ? { titel: `Unterlage für die Bieter:innen · ${zu().titel}`, dateien: (f) => dokumenteAblegen(f, { zu: zu() }) } : undefined)); onCleanup(() => setAblageZiel(undefined));
  return (
    <section class="vr-unterlagen" aria-label="Unterlagen für die Bieter:innen">
      <h3>Unterlagen für die Bieter:innen · {mitZahl()} {mitZahl() === 1 ? 'Datei' : 'Dateien'}</h3>
      <div class="vr-datei"><Zeichen name="pdf" groesse={16} /><span><b>LV {name()}.pdf</b><small>LV ohne Preise – entsteht beim Senden aus dem aktuellen Stand</small></span>
        <span class="pille">immer dabei</span><span class="vr-stand">{p.stand}</span><button type="button" class="knopf klein" onClick={() => druckOeffnen('ava.lv', l().id)}>Ansehen</button></div>
      <div class="vr-datei"><Zeichen name="datei_runter" groesse={16} /><span><b>LV {name()}.x83</b><small>LV als GAEB-Datei – für die Kalkulation der Bieter:innen</small></span>
        <label class="vr-mit"><input type="checkbox" disabled={!schreiben()} checked={l().werte.versand_ohne_x83 !== true} onChange={(e) => setzen({ versand_ohne_x83: !e.currentTarget.checked }, 'GAEB-Datei mitschicken')} /> mitschicken</label>
        <span class="vr-stand">{p.stand}</span><button type="button" class="knopf klein" disabled={!positionenVon(l().id).length} onClick={() => gaebAusgeben(l())}>Herunterladen</button></div>
      <For each={docs()}>{(d) => (
        <div class="vr-datei"><Zeichen name="dateien" groesse={16} /><span><b>{String(d.werte.name ?? '')}</b><small>{d.werte.ort === 'ablage' ? 'im Projektordner' : 'im Bauportal'}{d.werte.groesse ? ` · ${groesse(Number(d.werte.groesse))}` : ''} · {String(d.werte.art ?? '')}</small></span>
          <label class="vr-mit"><input type="checkbox" disabled={!schreiben()} checked={!ohne().has(d.id)} onChange={() => umschalten(d.id)} /> mitschicken</label>
          <span class="vr-stand">{zuletzt() && String(d.werte.eingang ?? '') > zuletzt() ? 'neu seit dem letzten Versand' : zuletzt() ? `verschickt am ${datum(zuletzt())}` : 'noch nicht verschickt'}</span>
          <a class="knopf klein" href={`/api/dokument/original/${d.id}`} target="_blank" rel="noopener">Ansehen</a></div>)}</For>
      <Show when={darf('dokument', 'schreiben')}>
        <div class="reihe vr-dazu">
          <button type="button" class="knopf klein" title="Dateien vom Rechner (oder hierher ziehen) – sie werden im Ordner der Ausschreibung abgelegt" onClick={() => wahl.click()}>Vom Rechner …</button>
          <input ref={wahl} type="file" multiple hidden onChange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length) dokumenteAblegen(f, { zu: zu() }); }} />
          <Show when={sicht.projekt?.[String(l().werte.projekt ?? '')]?.werte.ordner}><button type="button" class="knopf klein" title="Eine Datei aus dem Projektordner – sie bleibt, wo sie ist" onClick={() => setOrdner(true)}>Aus dem Projektordner …</button></Show>
        </div>
      </Show>
      <p class="still-text klein-text">„An Bieter:innen senden“ legt je Firma eine Mail in den Postausgang; PDF und X83 entstehen beim Verschicken aus dem dann aktuellen Stand, die übrigen Unterlagen gehen im Original mit.</p>
      <Show when={ordner()}><OrdnerFenster start="" datei={{ projekt: String(l().werte.projekt ?? ''), onDatei: (x, n) => void ausOrdner(x, n) }} onWahl={() => setOrdner(false)} onZu={() => setOrdner(false)} /></Show>
    </section>
  );
}

/** Bisher verschickt (wie bisher): je Lauf Betreff, Tag, wer, Anzahl Mails und Fehler – aus den Nachrichten an die Bieter:innen. */
function BisherVerschickt(p: { bieter: Zeile[] }): JSX.Element {
  const laeufe = createMemo(() => {
    const ids = new Set(p.bieter.map((a) => `angebot|${a.id}`)), je = new Map<string, Zeile[]>();
    for (const n of lebende('nachricht').filter((x) => ids.has(String(x.werte.quelle ?? '')))) { const k = `${String(n.werte.betreff ?? '')}|${String(n.werte.verschickt_am || '').slice(0, 10)}`; je.set(k, [...(je.get(k) ?? []), n]); }
    return [...je.values()].map((l) => ({ betreff: String(l[0]!.werte.betreff ?? ''), am: String(l[0]!.werte.verschickt_am ?? '').slice(0, 10), n: l.length,
      wartet: l.filter((x) => x.werte.stand === 'wartet' || x.werte.stand === 'zurueckgehalten').length, fehler: l.filter((x) => x.werte.stand === 'fehler').length })).sort((a, b) => b.am.localeCompare(a.am));
  });
  return <Show when={laeufe().length}><section class="vr-bisher" aria-label="Bisher verschickt"><h3 class="vr-titel">Bisher verschickt</h3>
    <ul><For each={laeufe()}>{(l) => <li><b>{l.betreff}</b> · {l.am ? datum(l.am) : 'noch im Postausgang'} · {l.n} {l.n === 1 ? 'Mail' : 'Mails'}{l.wartet ? ` · ${l.wartet} warten` : ''}<Show when={l.fehler}><span class="gefahr-text"> · {l.fehler} Fehler</span></Show></li>}</For></ul>
  </section></Show>;
}

/** Versand & Rücklauf (wie im bisherigen Bauportal): je LV die angeschriebenen Bieter:innen – Rückmeldung, Nachfassen, Eingang –
 *  mit Fristen und Zählern; Unterlagen als PDF und GAEB X83 – verschickt über die zentrale Versandstelle (Postausgang). */
export function Versand(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const bieter = createMemo(() => (lv() ? angeboteVon(lv()!.id) : []));
  const z = createMemo(() => ruecklaufZaehlen(bieter()));
  const [dazu, setDazu] = createSignal(false);
  /** Häkchen an den LVs im Baum (wie bisher): ab zwei die Bieter:innen aller zusammen – eine Mail je Firma. Das erste Häkchen nimmt das offene LV mit. */
  const [mehr, setMehr] = createSignal<string[]>([]);
  const haken = { an: (id: string) => mehr().includes(id), onHaken: (id: string, an: boolean) => setMehr((m) => {
    const n = m.filter((x) => x !== id); if (!an) return n;
    return [...(n.length === 0 && lv() && lv()!.id !== id ? [lv()!.id] : n), id].slice(0, 12);
  }) };
  const feld = (n: string) => modell('lv').felder.find((f) => f.name === n)!;
  /** Wie bisher je Datei: noch nicht verschickt · wartet im Postausgang · verschickt am … (aus den Nachrichten mit diesen Unterlagen) */
  const unterlagenStand = createMemo(() => {
    const l = lv(); if (!l) return '';
    const n = lebende('nachricht').filter((x) => String(x.werte.anhaenge ?? '').includes(`x83|${l.id}`));
    const am = n.map((x) => String(x.werte.verschickt_am ?? '')).filter(Boolean).sort().at(-1);
    if (am) return `verschickt am ${am.slice(8, 10)}.${am.slice(5, 7)}.${am.slice(0, 4)}`;
    return n.some((x) => x.werte.stand === 'wartet') ? 'wartet im Postausgang' : n.some((x) => x.werte.stand === 'zurueckgehalten') ? 'zurückgehalten (Testserver)' : 'noch nicht verschickt';
  });
  /** Ein Lauf über den einen Mail-Dialog: Unterlagen entstehen beim Versand, „angeschrieben am“ hält derselbe Schritt fest. nur: diese Firmen
   *  (einzeln senden, „bitte nicht beachten“) – sonst alle, vorab angehakt wie der Lauf es will. */
  const anBieter = (lauf: Lauf, nur?: Zeile[]) => versandOeffnen(lv()!, lauf, nur);
  const nochNicht = () => bieter().filter((a) => !a.werte.angeschrieben && adresseVon(a).includes('@') && a.werte.rueckmeldung !== 'gibt_nicht_ab');
  createEffect(() => p.setKnoepfe([
    ...(lv() && darf('angebot', 'schreiben') ? [{ titel: 'Bieter:in', zeichen: 'person_neu', gruppe: 'Neu', tun: () => setDazu(true) }] : []),
    ...(lv() && bieter().length ? (['versand', 'erinnerung', 'nachversand'] as Lauf[]).map((l) => ({ titel: LAEUFE[l].knopf, zeichen: l === 'erinnerung' ? 'glocke' : 'senden', gruppe: 'Versand',
      gesperrt: !darf('nachricht', 'schreiben') || (l !== 'versand' && !bieter().some((a) => a.werte.angeschrieben)), tun: () => anBieter(l) })) : []),
    { titel: 'Nachverfolgen', zeichen: 'telefon', gruppe: 'Nachverfolgen', tun: () => springeZu('lv', lv()?.id ?? '', { modul: 'ava', ansicht: 'nachverfolgen' }) },
    ...(lv() && bieter().length ? [{ titel: 'Bieterliste', zeichen: 'drucken', gruppe: 'Datei', rechts: true, tun: (e: MouseEvent) => {
      const l = lv()!, lvText = `LV ${String(l.werte.nummer ?? '')} ${String(l.werte.name ?? '')}`.trim();
      zeigeMenue(e, [{ titel: 'Drucken (PDF) …', tun: () => verzeichnisDrucken('ava.bieterliste', [{ titel: 'Die Bieter:innen dieses LV', ids: bieter().map((a) => a.id), filter: lvText }]) },
        { titel: 'Excel', tun: () => bieterlisteExcel(lvText, bieter()) }]);
    } }] : []),
  ]));
  return (
    <LvListe m={p} haken={darf('nachricht', 'schreiben') ? haken : undefined} zusatz={(l) => { const n = angeboteVon(l.id).length; return n ? `${n} ${n === 1 ? 'Bieter:in' : 'Bieter:innen'}` : ''; }}>
      <Show when={mehr().length < 2} fallback={<MehrereVersand ids={mehr()} onAufheben={() => setMehr([])} />}>
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
        <Unterlagen lv={lv()!} stand={unterlagenStand()} />
        <Show when={nochNicht().length && darf('nachricht', 'schreiben')}>
          <div class="hinweis-kasten vr-jetzt"><span><b>{nochNicht().length} {nochNicht().length === 1 ? 'Bieter:in' : 'Bieter:innen'} noch nicht angeschrieben</b>
            <small> {nochNicht().slice(0, 4).map((a) => name(a.werte.bieter)).join(', ')}{nochNicht().length > 4 ? ' …' : ''}</small></span>
            <button type="button" class="knopf haupt" title="Mail-Dialog öffnen – gesendet wird erst dort" onClick={() => anBieter('versand')}>✉ An {nochNicht().length} senden …</button></div>
        </Show>
        <h3 class="vr-titel">Bieter:innen</h3>
        <Show when={bieter().length} fallback={<Show when={!dazu()}><p class="hinweis-kasten">Noch keine Bieter:innen – oben „Bieter:in“: Firmen aus den Adressen wählen (mit passendem Gewerk zuerst). Wer im Preisspiegel ein Angebot hat, steht hier von selbst.</p></Show>}>
          <BieterTabelle bieter={bieter()} onEinzeln={(a) => anBieter('versand', [a])} onBitteNichtBeachten={(a) => bitteNichtBeachten(lv()!, a)} />
          <BisherVerschickt bieter={bieter()} />
        </Show>
        {/* wie bisher die Adressen mit ihren Filtern, darunter wählen – nach dem Übernehmen wieder weg */}
        <Show when={dazu()}><BieterWahl lv={lv()!} onZu={() => setDazu(false)} /></Show>
      </Show>
      </Show>
    </LvListe>
  );
}

/** Mehrere LVs in einem Versand (wie bisher): Firma je Zeile, je LV eine Spalte (☑ steht drin · ＋ auch dafür anfragen). Gesendet wird über
 *  den einen Mail-Dialog – je Firma eine Mail mit allen ihren LVs und deren Unterlagen; „angeschrieben am“ setzt derselbe Schritt je LV. */
function MehrereVersand(p: { ids: string[]; onAufheben: () => void }): JSX.Element {
  const lvs = createMemo(() => p.ids.map((id) => sicht.lv?.[id]).filter((l): l is Zeile => !!l && !l.geloescht).sort(lvFolge));
  const lvName = (l: Zeile) => [l.werte.nummer, l.werte.name].filter(Boolean).join(' ');
  /** je Firma: ihr Angebot je LV */
  const firmen = createMemo(() => {
    const f = new Map<string, Map<string, Zeile>>();
    for (const l of lvs()) for (const a of angeboteVon(l.id)) { const k = String(a.werte.bieter); if (!f.has(k)) f.set(k, new Map()); f.get(k)!.set(l.id, a); }
    return [...f.entries()].map(([k, je]) => ({ k, je })).sort((a, b) => name(a.k).localeCompare(name(b.k), 'de'));
  });
  const erstes = (je: Map<string, Zeile>) => [...je.values()][0]!;
  const MODELL = createMemo((): ObjektModell => ({ name: 'ava_versand_mehrere', titel: 'Firma', titelMehrzahl: 'Firmen', anzeigeFeld: 'firma', sortierFeld: 'firma', rechte: { lesen: [], schreiben: [], loeschen: [] },
    felder: [{ name: 'firma', titel: 'Firma', art: 'text', inListe: true, breite: 220 }, { name: 'email', titel: 'E-Mail', art: 'text', inListe: true, breite: 190 },
      ...lvs().map((l) => ({ name: `lv_${l.id}`, titel: lvName(l).slice(0, 18), art: 'text' as const, inListe: true, breite: 90 }))] }));
  const zeilen = createMemo((): Zeile[] => firmen().map((x) => ({ id: x.k, geloescht: false, werte: { firma: name(x.k), email: adresseVon(erstes(x.je)) } })));
  const auswahl = auswahlAnlegen();
  // vorgewählt (wie bisher): mit E-Mail und einem LV, das noch nicht raus ist
  createEffect(() => { if (auswahl.anzahl()) return; auswahl.alle(firmen().filter((x) => adresseVon(erstes(x.je)).includes('@')
    && [...x.je.values()].some((a) => !a.werte.angeschrieben && a.werte.rueckmeldung !== 'gibt_nicht_ab')).map((x) => x.k), true); });
  const anfragen = (l: Zeile, k: string) => ausfuehren({ objekt: 'angebot', art: 'anlegen', objektId: neueKennung(), werte: { projekt: l.werte.projekt ?? null, lv: l.id, bieter: k } }, `${name(k)} auch für ${lvName(l)} anfragen`);
  const zelle = (f: Feld, z: Zeile): JSX.Element | undefined => {
    if (!f.name.startsWith('lv_')) return undefined;
    const l = lvs().find((x) => `lv_${x.id}` === f.name)!, a = firmen().find((x) => x.k === z.id)?.je.get(l.id);
    return a ? <span class="vm-drin" title={`steht in ${lvName(l)}`}>☑{a.werte.angeschrieben ? <small> ✉ {datum(a.werte.angeschrieben)}</small> : null}</span>
      : <button type="button" class="knopf klein" title={`Firma auch für ${lvName(l)} anfragen`} disabled={!darf('angebot', 'schreiben')} onClick={(e) => { e.stopPropagation(); anfragen(l, z.id); }}>＋</button>;
  };
  const senden = () => {
    const ks = firmen().filter((x) => auswahl.hat(x.k)), pw = sicht.projekt?.[String(lvs()[0]!.werte.projekt)]?.werte, bw = sicht.buero?.[BUERO_ID]?.werte;
    const je = (k: string) => lvs().filter((l) => firmen().find((x) => x.k === k)?.je.has(l.id));
    const t = sammelText(pw, bw);
    mailSchreiben({ titel: `Angebotsanfrage an Bieter:innen – ${lvs().length} LVs`, projekt: String(lvs()[0]!.werte.projekt ?? '') || undefined, betreff: t.betreff, text: t.text,
      ids: ks.map((x) => x.k), vorab: ks.map((x) => x.k),
      an: (k) => { const x = firmen().find((y) => y.k === k); return x ? adresseVon(erstes(x.je)) : undefined; },
      anrede: (k) => { const x = firmen().find((y) => y.k === k); return x ? anredeVonAngebot(erstes(x.je)) : undefined; },
      anhaengeJe: (k) => je(k).flatMap(lvAnhaenge), platzhalter: (k) => sammelWerte(je(k).map((l) => l.werte)),
      quelle: (k) => `angebot|${firmen().find((y) => y.k === k)?.je.get(je(k)[0]?.id ?? '')?.id ?? ''}`,
      dazu: (gesendet) => firmen().filter((x) => gesendet.includes(x.k)).flatMap((x) => [...x.je.values()].filter((a) => !a.werte.angeschrieben))
        .map((a) => ({ objekt: 'angebot', art: 'aendern' as const, objektId: a.id, werte: { angeschrieben: heute() } })) });
  };
  return (
    <div class="vm">
      <div class="hinweis-kasten vm-kopf"><span><b>Gemeinsamer Versand · {lvs().length} LVs</b><small> Eine Firma, die in mehreren LVs steht, bekommt <b>eine</b> Mail mit allen ihren LVs und Unterlagen.</small></span>
        <button type="button" class="knopf" onClick={p.onAufheben}>Auswahl aufheben</button></div>
      <div class="vm-lvs"><For each={lvs()}>{(l) => <span><b>LV {lvName(l)}</b><small>Abgabe {l.werte.abgabe ? datum(l.werte.abgabe) : 'kein Termin'} · {unterlagenVon(l).filter((d) => !ohneUnterlage(l).has(d.id)).length} Unterlagen</small></span>}</For></div>
      <Tabelle modell={MODELL()} zeilen={zeilen()} gewaehlt={null} onWahl={() => undefined} auswahl={auswahl} zelle={zelle}
        leer="Die gewählten LVs haben noch keine Bieter:innen – erst je LV Firmen hinzufügen (Häkchen nur an einem LV lassen)." />
      <div class="hinweis-kasten vr-jetzt"><span><b>{auswahl.anzahl()} {auswahl.anzahl() === 1 ? 'Firma' : 'Firmen'} gewählt</b><small> ＋ = Firma auch für dieses LV anfragen. Fristen bleiben je LV und stehen so im Text.</small></span>
        <button type="button" class="knopf haupt" disabled={!auswahl.anzahl()} onClick={senden}>✉ An {auswahl.anzahl()} {auswahl.anzahl() === 1 ? 'Bieter:in' : 'Bieter:innen'} senden ({lvs().length} LVs) …</button></div>
    </div>
  );
}

/** Bieter:innen wählen: die Adressen mit den bekannten Filtern (Art, Gewerk, Beteiligte …), Firmen mit passendem Gewerk zuerst. */
function BieterWahl(p: { lv: Zeile; onZu: () => void }): JSX.Element {
  const ansicht = () => zustand()!.module.flatMap((x) => x.ansichten).find((a) => a.id === 'kontakte' && a.objekt === 'kontakt');
  const da = new Set(angeboteVon(p.lv.id).map((a) => String(a.werte.bieter)));
  // Gewerk des LV (VOB/C) als Filter zu Beginn: die Gewerke der Firmen, die dazu passen (Wortstämme, module/ava/gewerkpasst)
  const gewerk = String(p.lv.werte.gewerk ?? ''), gewerkName = gewerk ? String(sicht.gewerk?.[gewerk]?.werte.name ?? '') : '';
  const passt = (z: Zeile) => !!gewerkName && gewerkPasst(String(z.werte.gewerk ?? ''), gewerkName);
  const gewerke = [...new Set(lebende('kontakt').filter((z) => z.werte.art !== 'person' && passt(z)).map((z) => String(z.werte.gewerk)))];
  const uebernehmen = (ids: string[]) => {
    ausfuehrenMehrere(ids.map((id) => ({ objekt: 'angebot', art: 'anlegen' as const, objektId: neueKennung(), werte: { projekt: p.lv.werte.projekt ?? null, lv: p.lv.id, bieter: id } })),
      ids.length === 1 ? 'Bieter:in hinzufügen' : `${ids.length} Bieter:innen hinzufügen`);
    p.onZu();
  };
  return <Wahltabelle schluessel="ava.bieterwahl" modell={modell('kontakt')} projektId={() => String(p.lv.werte.projekt ?? '')} start={[{ feld: 'art', werte: ['firma'] }, ...(gewerke.length ? [{ feld: 'gewerk', werte: gewerke }] : [])]} linksFilter={ansicht()?.linksFilter} suchArten={ansicht()?.suchArten} titel="Bieter:innen aus den Adressen wählen"
    nur={(z) => !da.has(z.id) && z.werte.art !== 'person'} knopf={(n) => (n ? `${n} ${n === 1 ? 'Bieter:in' : 'Bieter:innen'} übernehmen` : 'Übernehmen')}
    hinweis={gewerke.length ? `Gefiltert auf das Gewerk des LV (${gewerkName}) – den Filter entfernen für alle Firmen.` : gewerkName ? `Keine Firma mit passendem Gewerk zu „${gewerkName}“ – alle Firmen.` : undefined} onUebernehmen={uebernehmen} onAbbrechen={p.onZu} />;
}

/** Nachverfolgen (wie im bisherigen Bauportal, ava-nachverfolgen.js): alle verschickten LVs über die Projekte („meine Projekte“ oder alle),
 *  gefiltert nach Stand (laufend · Frist vorbei · erledigt · alle) und Suche; je LV eine aufklappbare Zeile, darunter die Bieter:innen
 *  mit Stand, zuletzt, nächstem Anruf, „📞 angerufen“ und „✉ erinnern“. Klick auf ein LV öffnet seinen Versand. */
type NvStand = 'laufend' | 'frist' | 'erledigt' | 'alle';
const NV_STAND: Record<NvStand, string> = { laufend: 'laufend', frist: 'Frist vorbei', erledigt: 'erledigt', alle: 'alle' };
const [nvAlle, setNvAlle] = createSignal(holen<boolean>('nv:alle', false));
const [nvStand, setNvStand] = createSignal<NvStand>(holen<NvStand>('nv:stand', 'laufend'));
const [nvZu, setNvZu] = createSignal<Set<string>>(new Set(holen<string[]>('nv:zu', [])));
export function Nachverfolgen(_p: Mitte): JSX.Element {
  const [nurFaellig, setNurFaellig] = createSignal(false), [such, setSuch] = createSignal('');
  const meine = createMemo(() => new Set(lebende('projekt_mitglied').filter((m) => m.werte.benutzer === ich().id).map((m) => String(m.werte.projekt))));
  const tage = (iso: string) => Math.round((new Date(`${iso.slice(0, 10)}T12:00`).getTime() - new Date(`${heute()}T12:00`).getTime()) / 864e5);
  // verschickt = mindestens eine Bieter:in angeschrieben; erledigt = vergeben, nicht vergeben oder alle haben geantwortet
  const lvs = createMemo(() => lebende('lv').filter((l) => !l.werte.archiviert && (nvAlle() || meine().has(String(l.werte.projekt)))).map((l) => {
    const b = angeboteVon(l.id), z = ruecklaufZaehlen(b), ab = String(l.werte.abgabe ?? '');
    const fertig = ['vergeben', 'aufgehoben'].includes(String(l.werte.status ?? '')) || (b.length > 0 && z.offen === 0 && z.will_abgeben === 0);
    const stand: NvStand = fertig ? 'erledigt' : ab && tage(ab) < 0 ? 'frist' : 'laufend';
    const verschickt = b.map((a) => String(a.werte.angeschrieben ?? '')).filter(Boolean).sort()[0] ?? '';
    return { l, b, z, ab, stand, verschickt, projekt: sicht.projekt?.[String(l.werte.projekt)]?.werte };
  }).filter((x) => x.verschickt).sort((x, y) => (x.ab || '9').localeCompare(y.ab || '9')));
  const passt = (x: ReturnType<typeof lvs>[number]) => {
    const q = such().trim().toLowerCase();
    return (nvStand() === 'alle' || x.stand === nvStand()) && (!nurFaellig() || x.b.some((a) => nachfassenFaellig(a, heute())))
      && (!q || [x.projekt?.nummer, x.projekt?.name, x.l.werte.nummer, x.l.werte.name, sicht.gewerk?.[String(x.l.werte.gewerk ?? '')]?.werte.name, ...x.b.map((a) => name(a.werte.bieter))].join(' ').toLowerCase().includes(q));
  };
  const lauf = () => lvs().filter((x) => x.stand !== 'erledigt');
  const k = createMemo(() => ({ anrufe: lauf().reduce((s, x) => s + x.b.filter((a) => nachfassenFaellig(a, heute())).length, 0), bald: lauf().filter((x) => x.ab && tage(x.ab) >= 0 && tage(x.ab) <= 3).length,
    unterwegs: lauf().length, da: lauf().reduce((s, x) => s + x.z.abgegeben, 0), von: lauf().reduce((s, x) => s + x.b.length, 0) }));
  const umschalten = (id: string) => { const n = new Set(nvZu()); if (n.has(id)) n.delete(id); else n.add(id); setNvZu(n); merken('nv:zu', [...n].slice(-200)); };
  const zeigen = (l: Zeile, ansicht: string) => springeZu('lv', l.id, { modul: 'ava', ansicht, projekt: String(l.werte.projekt ?? '') });
  return (
    <div class="preisspiegel-flaeche nachverfolgen">
      <div class="nv-kopf">
        <div class="auswahl klein" role="radiogroup" aria-label="Projekte">
          <button type="button" role="radio" aria-checked={!nvAlle()} classList={{ aktiv: !nvAlle() }} onClick={() => { setNvAlle(false); merken('nv:alle', false); }}>meine Projekte</button>
          <button type="button" role="radio" aria-checked={nvAlle()} classList={{ aktiv: nvAlle() }} onClick={() => { setNvAlle(true); merken('nv:alle', true); }}>alle</button></div>
        <div class="auswahl klein" role="radiogroup" aria-label="Stand">
          <For each={Object.keys(NV_STAND) as NvStand[]}>{(s) => <button type="button" role="radio" aria-checked={nvStand() === s} classList={{ aktiv: nvStand() === s }} onClick={() => { setNvStand(s); merken('nv:stand', s); }}>
            {NV_STAND[s]} {lvs().filter((x) => s === 'alle' || x.stand === s).length}</button>}</For></div>
        <label class="vr-nur"><input type="checkbox" checked={nurFaellig()} onChange={(e) => setNurFaellig(e.currentTarget.checked)} /> nur fällige Anrufe</label>
        <input type="search" class="nv-such" placeholder="Firma, LV, Gewerk …" aria-label="Suchen" value={such()} onInput={(e) => setSuch(e.currentTarget.value)} />
      </div>
      <div class="vr-zahlen">
        <span classList={{ 'gefahr-text': k().anrufe > 0 }}><b>{k().anrufe}</b> {k().anrufe === 1 ? 'Anruf' : 'Anrufe'} fällig</span>
        <span><b>{k().bald}</b> Abgabe in ≤ 3 Tagen</span><span><b>{k().unterwegs}</b> {k().unterwegs === 1 ? 'LV' : 'LVs'} unterwegs</span>
        <span class="vr-abgegeben"><b>{k().da}</b> / {k().von} Angebote da</span>
      </div>
      <Show when={lvs().filter(passt).length} fallback={<p class="still-text">{lvs().length ? 'Nichts in dieser Auswahl.' : nvAlle() ? 'Noch kein LV an Bieter:innen verschickt.' : 'In deinen Projekten ist kein LV unterwegs – „alle“ zeigt die übrigen.'}</p>}>
        <For each={lvs().filter(passt)}>{(x) => { const offen = () => !nvZu().has(x.l.id), t = () => (x.ab ? tage(x.ab) : null);
          return <section class="nv-lv" classList={{ [`nv-${x.stand}`]: true }}>
            <div class="nv-lv-zeile">
              <button type="button" class="vr-auf" aria-expanded={offen()} onClick={() => umschalten(x.l.id)}>{offen() ? '▾' : '▸'}</button>
              <span class="nv-lv-name"><b>{[x.projekt?.nummer, x.projekt?.name].filter(Boolean).join(' · ')}</b> · <button type="button" class="link-knopf" title="Versand dieses LV öffnen" onClick={() => zeigen(x.l, 'versand')}>LV {[x.l.werte.nummer, x.l.werte.name].filter(Boolean).join(' ')}</button></span>
              <span>verschickt {datum(x.verschickt)}</span>
              <span>Abgabe {x.ab ? datum(x.ab) : '–'} <Show when={t() != null}><small classList={{ 'gefahr-text': t()! < 0 }}>{t()! < 0 ? 'vorbei' : `(${t()} T.)`}</small></Show></span>
              <span>Rücklauf {x.z.abgegeben}/{x.b.length}</span>
              <span class="still-text">{[x.z.abgegeben && `${x.z.abgegeben} abgegeben`, x.z.will_abgeben && `${x.z.will_abgeben} will abgeben`, x.z.gibt_nicht_ab && `${x.z.gibt_nicht_ab} gibt nicht ab`, x.z.offen && `${x.z.offen} offen`].filter(Boolean).join(' · ')}</span>
              <Show when={x.stand !== 'laufend'}><button type="button" class="knopf klein" onClick={() => zeigen(x.l, 'preisspiegel')}>→ Preisspiegel</button></Show>
            </div>
            <Show when={offen()}><BieterTabelle speicher="bp_spalten_nachverfolgen3" bieter={nurFaellig() ? x.b.filter((a) => nachfassenFaellig(a, heute())) : x.b} onErinnern={(a) => versandOeffnen(x.l, 'erinnerung', [a])} /></Show>
          </section>; }}</For>
      </Show>
      <p class="still-text klein-text">Dieselben Daten wie im Versand – nur über alle LVs. Klick auf ein LV öffnet seinen Versand.</p>
    </div>
  );
}
