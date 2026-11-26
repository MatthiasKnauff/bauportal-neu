// Ausschreibung in der Oberfläche: Summen in den Karten (LV, Position) und der Preisspiegel – Positionen mit den Preisen
// aller Bieter:innen nebeneinander, das günstigste je Position markiert, unten Summe, Nachlass, Rang und „Vergeben an …“.
import { For, Show, createMemo, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { auftragsstand, ausgeschrieben, gp, guenstigster, nachtragNetto, naechsterNachtrag, ozVergleich, leiter, nachOz, pruefstand, summeGeschaetzt, wertung, zaehlt, zahl, type Pruefstand } from '../module/ava/rechnung';
import type { Werte } from '../kern/modell';
import { rechenweg } from '../kern/rechenweg';
import { NACHTRAGSSTAENDE } from '../module/ava/beipackzettel';
import { gaebSchreiben, type GaebPosten } from '../module/ava/gaeb';
import { gaebEinlesen } from './uebernahme';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Seitenliste } from './baukasten/seitenliste';
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

/** Karte eines LV: die Summen – geschätzt, Angebote (günstigstes), Auftrag, abgerechnet. */
export function LvSummen(p: { lv: Zeile }): JSX.Element {
  const pos = () => positionenVon(p.lv.id), ang = () => angeboteVon(p.lv.id);
  const w = createMemo(() => { const pr = preiseVon(ang()); return wertung(pos(), ang(), (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null)); });
  const auftrag = () => { const a = ang().find((x) => x.werte.beauftragt === true); return a ? { a, w: w().find((x) => x.angebot === a.id) } : undefined; };
  const rechnungen = () => lebende('rechnung').filter((r) => r.werte.lv === p.lv.id);
  const erster = () => w().find((x) => x.rang === 1);
  return (
    <div class="ava-summen">
      <h3>Summen netto</h3>
      <dl class="angaben">
        <dt>Positionen</dt><dd>{pos().filter((x) => x.werte.art !== 'titel').length}</dd>
        <dt>geschätzt</dt><dd>{eur(summeGeschaetzt(pos()))} €</dd>
        <Show when={zahl(p.lv.werte.budget)}><dt>Kostenansatz</dt><dd>{eur(zahl(p.lv.werte.budget))} €</dd></Show>
        <Show when={ang().length}><dt>Angebote</dt><dd>{ang().length}{erster() ? ` · günstigstes ${eur(erster()!.nachLass)} € (${name(ang().find((a) => a.id === erster()!.angebot)?.werte.bieter)})` : ''}</dd></Show>
        <Show when={auftrag()}>{(x) => <><dt>Auftrag</dt><dd>{name(x().a.werte.bieter)} · {eur(x().w?.nachLass ?? 0)} €</dd></>}</Show>
        <Show when={rechnungen().length}><dt>abgerechnet</dt><dd>{eur(rechnungen().reduce((s, r) => s + zahl(r.werte.geprueft ?? r.werte.betrag), 0))} € in {rechnungen().length} {rechnungen().length === 1 ? 'Rechnung' : 'Rechnungen'}</dd></Show>
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
  return <Seitenliste name="Leistungsverzeichnisse" aktiv={p.gewaehlt() ?? p.alle()[0]?.id ?? ''} onWahl={(id) => p.onWahl(id)}
    abschnitte={[{ titel: 'Leistungsverzeichnisse', eintraege: [...p.alle()].sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true })).map((l) => ({ id: l.id, titel: [l.werte.nummer, l.werte.name].filter(Boolean).join(' · '), zeichen: 'ausschreibung', anzahl: angeboteVon(l.id).length })) }]} />;
}

export function Preisspiegel(p: Mitte): JSX.Element {
  const lv = () => { const id = p.gewaehlt() ?? p.alle()[0]?.id; return id ? sicht.lv?.[id] : undefined; };
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
  const lv = () => { const id = p.gewaehlt() ?? p.alle()[0]?.id; return id ? sicht.lv?.[id] : undefined; };
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
  const lv = () => { const id = p.gewaehlt() ?? p.alle()[0]?.id; return id ? sicht.lv?.[id] : undefined; };
  const auftrag = createMemo(() => (lv() ? angeboteVon(lv()!.id).find((a) => a.werte.beauftragt === true) : undefined));
  const nachlass = () => zahl(auftrag()?.werte.nachlass);
  const haupt = createMemo(() => {
    if (!lv() || !auftrag()) return 0;
    const pr = preiseVon([auftrag()!]);
    return wertung(positionenVon(lv()!.id), [auftrag()!], (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null))[0]?.nachLass ?? 0;
  });
  const nachtraege = createMemo(() => (lv() ? lebende('nachtrag').filter((n) => n.werte.lv === lv()!.id).sort((a, b) => ozVergleich(a.werte.nummer, b.werte.nummer)) : []));
  const alle = createMemo(() => (lv() ? allePositionenVon(lv()!.id) : []));
  const stand = createMemo(() => auftragsstand(haupt(), nachtraege(), alle(), nachlass()));
  const abgerechnet = createMemo(() => {
    const r = lebende('rechnung').filter((x) => x.werte.lv === lv()?.id).sort((a, b) => String(a.werte.datum ?? '').localeCompare(String(b.werte.datum ?? ''))).at(-1);
    return r ? Math.round(zahl(r.werte.geprueft ?? r.werte.betrag) * (1 - nachlass() / 100) * 100) / 100 : 0;
  });
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
