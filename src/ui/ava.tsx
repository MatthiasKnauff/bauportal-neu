// Ausschreibung in der Oberfläche: Summen in den Karten (LV, Position) und der Preisspiegel – Positionen mit den Preisen
// aller Bieter:innen nebeneinander, das günstigste je Position markiert, unten Summe, Nachlass, Rang und „Vergeben an …“.
import { AufmassEinlesen } from './aufmasseinlesen';
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { auftragsstand, ausgeschrieben, nachfassenFaellig, ruecklaufVon, ruecklaufZaehlen, type Auftragsstand, type Ruecklauf, gp, guenstigster, nachtragNetto, naechsterNachtrag, ozVergleich, leiter, nachOz, pruefstand, summeGeschaetzt, wertung, zaehlt, zahl, type Pruefstand } from '../module/ava/rechnung';
import type { Werte } from '../kern/modell';
import { rechenweg } from '../kern/rechenweg';
import { LV_STATUS, NACHTRAGSSTAENDE, RUECKMELDUNGEN } from '../module/ava/beipackzettel';
import { gaebSchreiben, type GaebPosten } from '../module/ava/gaeb';
import { gaebEinlesen } from './uebernahme';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Seitenliste } from './baukasten/seitenliste';
import { lvVon, lvWaehlen } from './avakopf';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const name = (kontakt: unknown) => String(sicht.kontakt?.[String(kontakt ?? '')]?.werte.name ?? 'Bieter:in');
/** Positionen der Ausschreibung (ohne Nachträge) – Preisspiegel, Summen, GAEB. */
const positionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv && ausgeschrieben(p)));
/** Alle Positionen eines Auftrags, mit Nachträgen – Aufmaß und Abrechnung. */
const allePositionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv));
const angeboteVon = (lv: string) => lebende('angebot').filter((a) => a.werte.lv === lv).sort((a, b) => name(a.werte.bieter).localeCompare(name(b.werte.bieter), 'de'));
/** Preise eines LV: „angebot:position“ → Eintrag. */
const preiseVon = (angebote: Zeile[]) => { const ids = new Set(angebote.map((a) => a.id)); return new Map(lebende('angebot_preis').filter((x) => ids.has(String(x.werte.angebot))).map((x) => [`${x.werte.angebot}:${x.werte.position}`, x])); };

/** Die Zahlen eines LV an einer Stelle (Karte, Aufträge, Kostenkontrolle): Schätzung, bestes Angebot, Auftrag, Nachträge, abgerechnet. */
export interface LvZahlen { schaetzung: number; bestes: number | null; besterBieter: string; auftrag: Zeile | undefined; haupt: number; nachlass: number; stand: Auftragsstand; abgerechnet: number; rechnungen: number }
export function lvZahlen(lvId: string): LvZahlen {
  const pos = positionenVon(lvId), ang = angeboteVon(lvId), pr = preiseVon(ang);
  const w = wertung(pos, ang, (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null));
  const erster = w.find((x) => x.rang === 1), auftrag = ang.find((x) => x.werte.beauftragt === true);
  const nachlass = zahl(auftrag?.werte.nachlass), haupt = auftrag ? w.find((x) => x.angebot === auftrag.id)?.nachLass ?? 0 : 0;
  const nachtraege = lebende('nachtrag').filter((n) => n.werte.lv === lvId);
  const rechnungen = lebende('rechnung').filter((r) => r.werte.lv === lvId).sort((a, b) => String(a.werte.datum ?? '').localeCompare(String(b.werte.datum ?? '')));
  const letzte = rechnungen.at(-1);
  return {
    schaetzung: summeGeschaetzt(pos), bestes: erster?.nachLass ?? null, besterBieter: name(ang.find((a) => a.id === erster?.angebot)?.werte.bieter),
    auftrag, haupt, nachlass, stand: auftragsstand(haupt, auftrag ? nachtraege : [], allePositionenVon(lvId), nachlass),
    abgerechnet: letzte ? Math.round(zahl(letzte.werte.geprueft ?? letzte.werte.betrag) * (1 - nachlass / 100) * 100) / 100 : 0, rechnungen: rechnungen.length,
  };
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
function gaebAusgeben(lv: Zeile, dp: '83'): void {
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
  return <Seitenliste name="Leistungsverzeichnisse" aktiv={lvVon(p)?.id ?? ''} onWahl={(id) => lvWaehlen(p, id)}
    abschnitte={[{ titel: 'Leistungsverzeichnisse', eintraege: [...p.alle()].sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true })).map((l) => ({ id: l.id, titel: [l.werte.nummer, l.werte.name].filter(Boolean).join(' · '), zeichen: 'ausschreibung', anzahl: angeboteVon(l.id).length })) }]} />;
}

export function Preisspiegel(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const pos = createMemo(() => (lv() ? positionenVon(lv()!.id) : []));
  const ang = createMemo(() => (lv() ? angeboteVon(lv()!.id) : []));
  const preise = createMemo(() => preiseVon(ang()));
  const preis = (a: string, q: string) => { const x = preise().get(`${a}:${q}`); return x && x.werte.ep != null && x.werte.ep !== '' ? zahl(x.werte.ep) : null; };
  const w = createMemo(() => wertung(pos(), ang(), preis));
  const min = createMemo(() => guenstigster(pos(), ang(), preis));
  const schreiben = () => darf('angebot_preis', 'schreiben');
  const setzen = (a: Zeile, q: Zeile, text: string) => {
    const ep = text.trim() === '' ? null : zahl(text), alt = preise().get(`${a.id}:${q.id}`);
    if (alt) { if (zahl(alt.werte.ep) !== ep) ausfuehren({ objekt: 'angebot_preis', art: 'aendern', objektId: alt.id, werte: { ep } }, 'Preis ändern'); }
    else if (ep != null) ausfuehren({ objekt: 'angebot_preis', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv()!.werte.projekt ?? null, angebot: a.id, position: q.id, ep } }, 'Preis eintragen');
  };
  // Enter wie in Excel: eine Zeile tiefer in derselben Spalte (übernommen wird beim Verlassen)
  const naechste = (el: HTMLInputElement) => {
    const td = el.closest('td')!, i = [...td.parentElement!.children].indexOf(td);
    let tr = td.parentElement!.nextElementSibling;
    while (tr && !tr.children[i]?.querySelector('input')) tr = tr.nextElementSibling;
    (tr?.children[i]?.querySelector('input') as HTMLInputElement | null)?.focus() ?? el.blur();
  };
  const bieterDazu = (kontakt: string) => { if (kontakt && lv()) ausfuehren({ objekt: 'angebot', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, bieter: kontakt, eingang: new Date().toLocaleDateString('sv') } }, 'Bieter:in eintragen'); };
  const vergeben = (a: Zeile) => ausfuehrenMehrere([
    ...ang().filter((x) => x.werte.beauftragt === true && x.id !== a.id).map((x) => ({ objekt: 'angebot', art: 'aendern' as const, objektId: x.id, werte: { beauftragt: false } })),
    { objekt: 'angebot', art: 'aendern', objektId: a.id, werte: { beauftragt: true, auftragsdatum: new Date().toLocaleDateString('sv') } },
    { objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { status: 'vergeben' } },
  ], `Vergeben an ${name(a.werte.bieter)}`);
  const firmen = () => lebende('kontakt').filter((k) => !ang().some((a) => a.werte.bieter === k.id)).map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – ') })).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  // Titelsummen je Angebot: alle Positionen, deren OZ mit der des Titels beginnt
  const unter = (t: Zeile) => pos().filter((x) => x.id !== t.id && zaehlt(x) && String(x.werte.oz ?? '').startsWith(`${String(t.werte.oz ?? '')}.`));
  return (
    <div class="preisspiegel-flaeche">
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – unter „Leistungsverzeichnisse“ anlegen.</p>}>
        <div class="ps-kopf">
          <h2>{[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' · ')}</h2>
          <Show when={darf('angebot', 'schreiben')}><div class="ps-dazu"><Auswahlliste titel="Bieter:in hinzufügen" platzhalter="＋ Bieter:in hinzufügen …" wert={null} optionen={firmen()} onWert={bieterDazu} /></div></Show>
        </div>
        <Show when={pos().length} fallback={<p class="still-text">Dieses LV hat noch keine Positionen.</p>}>
          <div class="ps-rollen">
            <table class="preisspiegel">
              <thead>
                <tr><th rowSpan={2}>OZ</th><th rowSpan={2}>Kurztext</th><th rowSpan={2} class="zahl">Menge</th><th rowSpan={2}>Einh.</th><th colSpan={2} class="ps-schaetzung">Schätzung</th>
                  <For each={ang()}>{(a) => <th colSpan={2} classList={{ 'ps-bieter': true, aus: a.werte.ausgeschlossen === true, auftrag: a.werte.beauftragt === true }}>{name(a.werte.bieter)}{a.werte.beauftragt === true ? ' ✓' : ''}</th>}</For></tr>
                <tr><th class="zahl ps-schaetzung">EP</th><th class="zahl ps-schaetzung">GP</th><For each={ang()}>{() => <><th class="zahl">EP</th><th class="zahl">GP</th></>}</For></tr>
              </thead>
              <tbody>
                <For each={pos()}>{(q) => (
                  <Show when={q.werte.art !== 'titel'} fallback={
                    <tr class="ps-titel"><td>{String(q.werte.oz ?? '')}</td><td colSpan={3}>{String(q.werte.kurztext ?? '')}</td>
                      <td /><td class="zahl">{eur(summeGeschaetzt(unter(q)))}</td>
                      <For each={ang()}>{(a) => <><td /><td class="zahl">{eur(unter(q).reduce((s, x) => s + gp(x.werte.menge, preis(a.id, x.id) ?? 0), 0))}</td></>}</For></tr>}>
                    <tr classList={{ 'ps-ohne': !zaehlt(q) }}>
                      <td>{String(q.werte.oz ?? '')}</td><td class="ps-text" title={String(q.werte.langtext ?? '')}>{String(q.werte.kurztext ?? '')}{!zaehlt(q) && q.werte.art !== 'hinweis' ? <small> ({q.werte.art === 'bedarf' ? 'Bedarf' : 'Alternativ'})</small> : ''}</td>
                      <td class="zahl">{q.werte.menge != null ? String(q.werte.menge).replace('.', ',') : ''}</td><td>{String(q.werte.einheit ?? '')}</td>
                      <td class="zahl ps-schaetzung">{q.werte.ep != null ? eur(zahl(q.werte.ep)) : ''}</td><td class="zahl ps-schaetzung">{q.werte.ep != null ? eur(gp(q.werte.menge, q.werte.ep)) : ''}</td>
                      {/* je Zelle ein eigenes Memo: das Eingabefeld hängt nur an seinem Preis. Sonst setzt jede Änderung anderswo
                          „value“ neu (Solid schreibt es bei jedem Lauf) und löscht, was hier gerade getippt wird. */}
                      <For each={ang()}>{(a) => { const ep = createMemo(() => preis(a.id, q.id)); return <>
                        <td class="zahl ps-ep" classList={{ guenstig: ep() != null && ep() === min().get(q.id) }}>
                          <Show when={schreiben()} fallback={ep() != null ? eur(ep()!) : ''}>
                            <input inputmode="decimal" aria-label={`EP ${name(a.werte.bieter)} ${String(q.werte.oz ?? '')}`} value={ep() != null ? eur(ep()!) : ''} onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setzen(a, q, e.currentTarget.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); naechste(e.currentTarget); } }} />
                          </Show>
                        </td>
                        <td class="zahl">{ep() != null ? eur(gp(q.werte.menge, ep())) : ''}</td></>; }}</For>
                    </tr>
                  </Show>
                )}</For>
              </tbody>
              <tfoot>
                <tr><td colSpan={5}>Summe netto</td><td class="zahl">{eur(summeGeschaetzt(pos()))}</td><For each={ang()}>{(a) => { const x = () => w().find((y) => y.angebot === a.id)!; return <><td /><td class="zahl">{eur(x().netto)}</td></>; }}</For></tr>
                <tr><td colSpan={6}>Nachlass</td><For each={ang()}>{(a) => <><td /><td class="zahl">{zahl(a.werte.nachlass) ? `${String(a.werte.nachlass).replace('.', ',')} %` : '–'}</td></>}</For></tr>
                <tr class="ps-summe"><td colSpan={6}>Summe nach Nachlass</td><For each={ang()}>{(a) => { const x = () => w().find((y) => y.angebot === a.id)!; return <><td /><td class="zahl">{eur(x().nachLass)}</td></>; }}</For></tr>
                <tr><td colSpan={6}>Rang · Abstand zum günstigsten</td><For each={ang()}>{(a) => { const x = () => w().find((y) => y.angebot === a.id)!; const erst = () => w().find((y) => y.rang === 1); return <><td /><td class="zahl">{a.werte.ausgeschlossen === true ? 'ausgeschlossen' : x().rang ? `${x().rang}.${x().rang! > 1 && erst() ? ` · +${((x().nachLass / erst()!.nachLass - 1) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` : ''}` : '–'}{x().fehlend ? <small class="ps-fehlt"> · {x().fehlend} ohne Preis</small> : ''}</td></>; }}</For></tr>
                <Show when={darf('angebot', 'schreiben')}>
                  <tr><td colSpan={6} /><For each={ang()}>{(a) => <><td /><td class="zahl">
                    <Show when={a.werte.beauftragt !== true} fallback={<b class="gut-text">beauftragt</b>}>
                      <button type="button" class="knopf klein" disabled={a.werte.ausgeschlossen === true || !w().find((y) => y.angebot === a.id)?.netto} onClick={() => vergeben(a)}>Vergeben an …</button>
                    </Show></td></>}</For></tr>
                </Show>
              </tfoot>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}

/** Für die Karte eines Angebots: seine Summe und sein Rang im Preisspiegel. */
export function AngebotSumme(p: { angebot: Zeile }): JSX.Element {
  const lvId = () => String(p.angebot.werte.lv ?? '');
  const w = createMemo(() => { const ang = angeboteVon(lvId()), pr = preiseVon(ang); return wertung(positionenVon(lvId()), ang, (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null)).find((x) => x.angebot === p.angebot.id); });
  return <Show when={w()}>{(x) => <p class="ava-gp">Summe netto <b>{eur(x().netto)} €</b>, nach Nachlass <b>{eur(x().nachLass)} €</b>{x().rang ? ` · Rang ${x().rang}` : ''}{x().fehlend ? ` · ${x().fehlend} Positionen ohne Preis` : ''}</p>}</Show>;
}

/** Karte einer Rechnung: die Rechenleiter bis zum Zahlbetrag (Nachlass aus dem beauftragten Angebot des LV). */
export function RechnungLeiter(p: { rechnung: Zeile }): JSX.Element {
  const lvId = () => String(p.rechnung.werte.lv ?? '');
  const zeilen = createMemo(() => {
    if (!lvId()) return [];
    const auftrag = angeboteVon(lvId()).find((a) => a.werte.beauftragt === true);
    return leiter(lebende('rechnung').filter((r) => r.werte.lv === lvId()), p.rechnung.id, zahl(auftrag?.werte.nachlass));
  });
  return (
    <Show when={zeilen().length} fallback={<p class="still-text klein-text">Mit dem Auftrag (LV) rechnet die Karte den Zahlbetrag: Nachlass, Umsatzsteuer, Einbehalt, bisherige Zahlungen.</p>}>
      <h3 class="ava-leiter-titel">Rechenleiter</h3>
      <table class="ava-leiter"><tbody><For each={zeilen()}>{(z) => <tr classList={{ summe: !!z.summe }}><td>{z.titel}</td><td class="zahl">{eur(z.betrag)} €</td></tr>}</For></tbody></table>
    </Show>
  );
}

/** Aufmaßprüfung (wie im bisherigen Bauportal): je Position Menge laut Firma ↔ eigener Rechenweg, mal EP des Auftrags. */
export function Aufmasspruefung(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const pos = createMemo(() => (lv() ? allePositionenVon(lv()!.id) : []));
  const auftrag = createMemo(() => (lv() ? angeboteVon(lv()!.id).find((a) => a.werte.beauftragt === true) : undefined));
  const preise = createMemo(() => (auftrag() ? preiseVon([auftrag()!]) : new Map<string, Zeile>()));
  // EP des Auftrags: bei Positionen der Ausschreibung der Preis aus dem beauftragten Angebot, bei Nachtragspositionen ihr eigener EP
  const epAuftrag = (q: Zeile): number | null => {
    if (q.werte.nachtrag) return q.werte.ep != null && q.werte.ep !== '' ? zahl(q.werte.ep) : null;
    const x = preise().get(`${auftrag()?.id}:${q.id}`); return x && x.werte.ep != null && x.werte.ep !== '' ? zahl(x.werte.ep) : null;
  };
  const aufmasse = createMemo(() => new Map(lebende('aufmass').filter((a) => a.werte.lv === lv()?.id).map((a) => [String(a.werte.position), a])));
  const schreiben = () => darf('aufmass', 'schreiben');
  const setzen = (q: Zeile, werte: Werte, titel: string) => {
    const alt = aufmasse().get(q.id);
    if (alt) { if (Object.entries(werte).some(([k, v]) => (alt.werte[k] ?? null) !== v)) ausfuehren({ objekt: 'aufmass', art: 'aendern', objektId: alt.id, werte }, titel); }
    else if (Object.values(werte).some((v) => v != null && v !== '')) ausfuehren({ objekt: 'aufmass', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, position: q.id, ...werte } }, titel);
  };
  const naechste = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const td = el.closest('td')!, i = [...td.parentElement!.children].indexOf(td);
    let tr = td.parentElement!.nextElementSibling;
    while (tr && !tr.children[i]?.querySelector('input, textarea')) tr = tr.nextElementSibling;
    (tr?.children[i]?.querySelector('input, textarea') as HTMLElement | null)?.focus() ?? el.blur();
  };
  const geprueft = (q: Zeile) => rechenweg(aufmasse().get(q.id)?.werte.rechenweg);
  const summe = createMemo(() => {
    let firma = 0, pruef = 0, offen = 0;
    for (const q of pos()) {
      if (!zaehlt(q)) continue;
      const a = aufmasse().get(q.id), ep = epAuftrag(q) ?? 0, g = rechenweg(a?.werte.rechenweg).summe;
      firma += gp(a?.werte.menge_firma, ep); pruef += g == null ? 0 : gp(g, ep);
      if (a?.werte.menge_firma != null && a.werte.menge_firma !== '' && g == null) offen++;
    }
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return { firma: r2(firma), pruef: r2(pruef), offen };
  });
  const ZEICHEN: Record<Pruefstand, string> = { stimmt: '✓', abweichend: '✗', offen: '○' };
  const TITEL: Record<Pruefstand, string> = { stimmt: 'stimmt', abweichend: 'weicht ab', offen: 'noch offen' };
  return (
    <div class="preisspiegel-flaeche">
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – unter „Leistungsverzeichnisse“ anlegen.</p>}>
        <div class="ps-kopf">
          <h2>Aufmaß · {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' · ')}</h2>
          <span class="still-text">{auftrag() ? `Auftrag: ${name(auftrag()!.werte.bieter)}` : 'noch nicht vergeben – Beträge erst mit Auftrag'}</span>
          <Show when={schreiben() && pos().length}><AufmassEinlesen lv={lv()!} positionen={pos()} aufmasse={aufmasse()} /></Show>
        </div>
        <Show when={pos().length} fallback={<p class="still-text">Dieses LV hat noch keine Positionen.</p>}>
          <div class="ps-rollen">
            <table class="preisspiegel aufmass">
              <thead><tr><th>OZ</th><th>Kurztext</th><th class="zahl">Menge LV</th><th>Einh.</th><th class="zahl">EP Auftrag</th>
                <th class="zahl">Menge Firma</th><th class="am-weg">Rechenweg</th><th class="zahl">geprüft</th><th class="am-stand" /><th class="zahl">GP geprüft</th></tr></thead>
              <tbody>
                <For each={pos()}>{(q) => (
                  <Show when={zaehlt(q)} fallback={<tr class={q.werte.art === 'titel' ? 'ps-titel' : 'ps-ohne'}><td>{String(q.werte.oz ?? '')}</td><td colSpan={9}>{String(q.werte.kurztext ?? '')}</td></tr>}>
                    {(() => {
                      // je Zeile eigene Memos: die Eingabefelder hängen nur an ihrem Aufmaß (sonst löscht Solid beim Tippen den Wert)
                      const a = createMemo(() => aufmasse().get(q.id));
                      const firma = createMemo(() => a()?.werte.menge_firma as number | null | undefined);
                      const weg = createMemo(() => String(a()?.werte.rechenweg ?? ''));
                      const r = createMemo(() => geprueft(q));
                      const stand = () => pruefstand(firma(), r().summe);
                      return (
                        <tr>
                          <td>{String(q.werte.oz ?? '')}</td><td class="ps-text" title={String(q.werte.langtext ?? '')}>{String(q.werte.kurztext ?? '')}</td>
                          <td class="zahl">{q.werte.menge != null ? String(q.werte.menge).replace('.', ',') : ''}</td><td>{String(q.werte.einheit ?? '')}</td>
                          <td class="zahl">{epAuftrag(q) != null ? eur(epAuftrag(q)!) : '–'}</td>
                          <td class="zahl ps-ep"><Show when={schreiben()} fallback={firma() != null ? String(firma()).replace('.', ',') : ''}>
                            <input inputmode="decimal" aria-label={`Menge Firma ${String(q.werte.oz ?? '')}`} value={firma() != null ? String(firma()).replace('.', ',') : ''} onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setzen(q, { menge_firma: e.currentTarget.value.trim() === '' ? null : zahl(e.currentTarget.value) }, 'Menge laut Firma')}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); naechste(e.currentTarget); } }} /></Show></td>
                          <td class="am-weg"><Show when={schreiben()} fallback={weg()}>
                            <textarea rows={Math.max(1, weg().split('\n').length)} aria-label={`Rechenweg ${String(q.werte.oz ?? '')}`} value={weg()} classList={{ fehler: r().fehler }}
                              title={r().fehler ? 'Nicht lesbar: ' + r().zeilen.filter((z) => z.wert == null).map((z) => z.text).join(' · ') : 'Je Zeile ein Ansatz, z. B. „Wand Nord: 2,5*3,1 - 0,8*2“ (Umschalt+Enter: neue Zeile)'}
                              onChange={(e) => setzen(q, { rechenweg: e.currentTarget.value.trim() || null }, 'Rechenweg')}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); naechste(e.currentTarget); } }} />
                            <Show when={firma() != null && !weg()}><button type="button" class="knopf klein" title="Menge der Firma als Rechenweg übernehmen" onClick={() => setzen(q, { rechenweg: String(firma()).replace('.', ',') }, 'Menge der Firma übernehmen')}>Übernehmen</button></Show>
                          </Show></td>
                          <td class="zahl">{r().summe != null ? r().summe!.toLocaleString('de-DE', { maximumFractionDigits: 3 }) : ''}</td>
                          <td class={`am-stand am-${stand()}`} title={TITEL[stand()]} aria-label={TITEL[stand()]}>{firma() != null || r().summe != null ? ZEICHEN[stand()] : ''}</td>
                          <td class="zahl">{r().summe != null && epAuftrag(q) != null ? eur(gp(r().summe, epAuftrag(q))) : ''}</td>
                        </tr>
                      );
                    })()}
                  </Show>
                )}</For>
              </tbody>
              <tfoot>
                <tr><td colSpan={9}>Leistungsstand netto laut Firma (Menge Firma × EP Auftrag)</td><td class="zahl">{eur(summe().firma)}</td></tr>
                <tr class="ps-summe"><td colSpan={9}>Leistungsstand netto geprüft{summe().offen ? ` · ${summe().offen} ${summe().offen === 1 ? 'Position' : 'Positionen'} noch offen` : ''}</td><td class="zahl">{eur(summe().pruef)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}

/** Aufträge (wie im bisherigen Bauportal): Hauptauftrag und Nachträge mit Stand und Betrag, Prognose und abgerechnet. */
export function Auftraege(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const z = createMemo(() => (lv() ? lvZahlen(lv()!.id) : undefined));
  const auftrag = () => z()?.auftrag, nachlass = () => z()?.nachlass ?? 0, haupt = () => z()?.haupt ?? 0;
  const stand = () => z()!.stand, abgerechnet = () => z()?.abgerechnet ?? 0;
  const nachtraege = createMemo(() => (lv() ? lebende('nachtrag').filter((n) => n.werte.lv === lv()!.id).sort((a, b) => ozVergleich(a.werte.nummer, b.werte.nummer)) : []));
  const alle = createMemo(() => (lv() ? allePositionenVon(lv()!.id) : []));
  const STAND: Record<string, string> = Object.fromEntries(NACHTRAGSSTAENDE.map((x) => [x.wert, x.titel]));
  const neu = () => ausfuehren({ objekt: 'nachtrag', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, nummer: naechsterNachtrag(nachtraege()), name: 'Neuer Nachtrag', stand: 'angemeldet', angemeldet: new Date().toLocaleDateString('sv') } }, 'Neuer Nachtrag');
  const setzeStand = (n: Zeile, st: string) => ausfuehren({ objekt: 'nachtrag', art: 'aendern', objektId: n.id, werte: { stand: st, ...(st === 'beauftragt' && !n.werte.beauftragt_am ? { beauftragt_am: new Date().toLocaleDateString('sv') } : {}) } }, `Nachtrag ${String(n.werte.nummer ?? '')}: ${STAND[st] ?? st}`);
  const posVon = (n: Zeile) => alle().filter((q) => q.werte.nachtrag === n.id && q.werte.art !== 'titel');
  return (
    <div class="preisspiegel-flaeche">
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – unter „Leistungsverzeichnisse“ anlegen.</p>}>
        <div class="ps-kopf">
          <h2>Auftrag · {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' · ')}</h2>
          <Show when={auftrag() && darf('nachtrag', 'schreiben')}><button type="button" class="knopf" onClick={neu}>＋ Nachtrag</button></Show>
        </div>
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
          <p class="still-text klein-text">Nachtragspositionen unter „Positionen“ anlegen: links den Nachtrag wählen, dann „＋ Position“ – ihr EP ist der Nachtragspreis.</p>
        </Show>
      </Show>
    </div>
  );
}

/** Kostenkontrolle (wie im bisherigen Bauportal): alle Vergabeeinheiten des Projekts – Schätzung, bestes Angebot, Auftrag,
 *  beauftragte Nachträge, abgerechnet, noch offen und die Abweichung zur Schätzung. Klick öffnet das LV. */
export function Kostenkontrolle(p: Mitte): JSX.Element {
  const zeilen = createMemo(() => [...p.zeilen()].sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true })).map((l) => ({ l, z: lvZahlen(l.id) })));
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
        <thead><tr><Show when={p.mitLv}><th>LV</th><th>Abgabe</th></Show><th>Bieter:in</th><th>Telefon</th><th>angeschrieben</th><th>Stand</th><th>Nachfassen</th><th>Angebot</th></tr></thead>
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
                  <input type="date" aria-label={`Nachfassen ${name(a.werte.bieter)}`} value={String(a.werte.nachfassen ?? '')} onChange={(e) => aendern(a, { nachfassen: e.currentTarget.value || null }, 'Nachfassen')} />
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
 *  mit Fristen und Zählern; Unterlagen als GAEB X83. Das Verschicken per E-Mail kommt über die zentrale Versandstelle. */
export function Versand(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const bieter = createMemo(() => (lv() ? angeboteVon(lv()!.id) : []));
  const z = createMemo(() => ruecklaufZaehlen(bieter()));
  // Firmen zum Anschreiben: die mit passendem Gewerk zuerst (★)
  const gewerk = () => String(sicht.gewerk?.[String(lv()?.werte.gewerk ?? '')]?.werte.name ?? '').toLowerCase().split(/[\s,]/)[0] ?? '';
  const firmen = () => lebende('kontakt').filter((k) => !bieter().some((a) => a.werte.bieter === k.id))
    .map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – '), passt: !!gewerk() && String(k.werte.gewerk ?? '').toLowerCase().includes(gewerk()) }))
    .sort((a, b) => Number(b.passt) - Number(a.passt) || a.titel.localeCompare(b.titel, 'de')).map(({ wert, titel, passt }) => ({ wert, titel: passt ? `★ ${titel}` : titel }));
  const dazu = (kontakt: string) => { if (kontakt && lv()) ausfuehren({ objekt: 'angebot', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, bieter: kontakt, angeschrieben: heute() } }, `${name(kontakt)} angeschrieben`); };
  return (
    <div class="preisspiegel-flaeche">
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – unter „Leistungsverzeichnisse“ anlegen.</p>}>
        <div class="ps-kopf">
          <h2>Versand & Rücklauf · {[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' · ')}</h2>
          <Show when={darf('angebot', 'schreiben')}><div class="ps-dazu"><Auswahlliste titel="Bieter:in anschreiben" platzhalter="＋ Bieter:in anschreiben …" wert={null} optionen={firmen()} onWert={dazu} /></div></Show>
        </div>
        <div class="vr-zahlen">
          <span>Abgabe bis <b>{datum(lv()!.werte.abgabe)}</b></span><span>Rückmeldung bis <b>{datum(lv()!.werte.rueckmeldung_bis)}</b></span>
          <span>angeschrieben <b>{z().angeschrieben}</b> von {bieter().length}</span><span class="vr-abgegeben">abgegeben <b>{z().abgegeben}</b></span>
          <span>wollen abgeben <b>{z().will_abgeben}</b></span><span>geben nicht ab <b>{z().gibt_nicht_ab}</b></span><span>offen <b>{z().offen}</b></span>
        </div>
        <div class="reihe vr-unterlagen">
          <span class="still-text">Unterlagen für die Bieter:innen:</span>
          <button type="button" class="knopf klein" disabled={!positionenVon(lv()!.id).length} onClick={() => gaebAusgeben(lv()!, '83')}>LV als GAEB X83</button>
        </div>
        <Show when={bieter().length} fallback={<p class="still-text">Noch keine Bieter:innen – oben „＋ Bieter:in anschreiben“ (Firmen mit passendem Gewerk stehen mit ★ zuerst). Wer im Preisspiegel ein Angebot hat, steht hier von selbst.</p>}>
          <BieterTabelle bieter={bieter()} />
        </Show>
        <p class="still-text klein-text">Verschicken per E-Mail kommt über die zentrale Versandstelle des Bauportals.</p>
      </Show>
    </div>
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
