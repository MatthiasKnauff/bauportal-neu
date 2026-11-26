// Ausschreibung in der Oberfläche: Summen in den Karten (LV, Position) und der Preisspiegel – Positionen mit den Preisen
// aller Bieter:innen nebeneinander, das günstigste je Position markiert, unten Summe, Nachlass, Rang und „Vergeben an …“.
import { For, Show, createMemo, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { gp, guenstigster, nachOz, summeGeschaetzt, wertung, zaehlt, zahl } from '../module/ava/rechnung';
import { gaebSchreiben, type GaebPosten } from '../module/ava/gaeb';
import { gaebEinlesen } from './uebernahme';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Seitenliste } from './baukasten/seitenliste';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const name = (kontakt: unknown) => String(sicht.kontakt?.[String(kontakt ?? '')]?.werte.name ?? 'Bieter:in');
const positionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv));
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
