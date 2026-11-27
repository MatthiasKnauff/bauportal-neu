// Angebote & Preisspiegel (wie im bisherigen Bauportal): der LV-Baum (Baustein in lvbearbeiten.tsx) mit einer Spalte je Bieter:in –
// EP direkt eintragen, je Titel und LV die Summe je Bieter:in, der günstigste Preis grün, mehr als 30 % vom Mittel orange, dazu das
// Mittel. Unten Summe, Nachlass (% und/oder €), Skonto, Wertung mit Rang und „Vergeben …“. Oben: Bieter:in hinzufügen,
// Vergabe aufheben, Nicht vergeben. Hinweistexte und Nachträge stehen nicht im Preisspiegel.
import { Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { gp, wertung, zaehlt, zahl } from '../module/ava/rechnung';
import { angeboteVon, name, preiseVon } from './ava';
import { lvVon } from './avakopf';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { LV_SPALTEN, LvBaum, eur, setLvZeiger, zahlAus, zahlText, type BaumSpalte, type FussZeile } from './lvbearbeiten';
import { besprechungOeffnen } from './besprechung';
import { gaebEinlesen } from './uebernahme';
import { ausfuehren, ausfuehrenMehrere, lebende } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const heute = () => new Date().toLocaleDateString('sv');
/** Gewählte Bieter:in im Preisspiegel (Klick auf den Spaltenkopf, wie bisher) – rechts steht ihre Karte. */
export const [psAngebot, setPsAngebot] = createSignal<string | null>(null);
const nurLesen = (id: string) => { const s = LV_SPALTEN.find((x) => x.id === id)!; return { ...s, setzen: undefined }; };

export function Preisspiegel(m: Mitte): JSX.Element {
  const lv = () => lvVon(m);
  const vergeben = () => ['vergeben', 'abgerechnet'].includes(String(lv()?.werte.status ?? ''));
  const ang = createMemo(() => (lv() ? angeboteVon(lv()!.id) : []));
  const preise = createMemo(() => preiseVon(ang()));
  const preis = (a: string, q: string) => { const x = preise().get(`${a}:${q}`); return x && x.werte.ep != null && x.werte.ep !== '' ? zahl(x.werte.ep) : null; };
  const gewertet = () => ang().filter((a) => a.werte.ausgeschlossen !== true);
  /** Günstigster Preis und Mittel je Position (nur gewertete Angebote). */
  const vergleich = (q: Zeile) => { const v = gewertet().map((a) => preis(a.id, q.id)).filter((x): x is number => x != null); return { min: v.length > 1 ? Math.min(...v) : null, mittel: v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }; };
  const positionen = () => (lv() ? lebende('lv_position').filter((q) => q.werte.lv === lv()!.id && !q.werte.nachtrag) : []);
  const w = createMemo(() => wertung(positionen(), ang(), preis));
  const darfPreise = () => darf('angebot_preis', 'schreiben') && !vergeben();
  const setzen = (a: Zeile, q: Zeile, text: string): string | void => {
    const n = zahlAus(text); if (typeof n === 'string') return n;
    const alt = preise().get(`${a.id}:${q.id}`);
    if (alt) ausfuehren({ objekt: 'angebot_preis', art: 'aendern', objektId: alt.id, werte: { ep: n } }, `Preis ${name(a.werte.bieter)}`);
    else if (n != null) ausfuehren({ objekt: 'angebot_preis', art: 'anlegen', objektId: neueKennung(), werte: { projekt: lv()!.werte.projekt ?? null, angebot: a.id, position: q.id, ep: n } }, `Preis ${name(a.werte.bieter)}`);
  };
  const bieterSpalte = (a: Zeile): BaumSpalte => ({
    id: `a:${a.id}`, titel: name(a.werte.bieter), breite: 108, rechts: true, frei: true,
    kopf: () => <span class="ps-kopf-bieter" classList={{ aus: a.werte.ausgeschlossen === true, gewaehlt: psAngebot() === a.id }} role="button" tabIndex={0} title={a.werte.ausgeschlossen === true ? 'ausgeschlossen – nicht gewertet' : 'Klick: Angaben zum Angebot rechts'}
      onClick={(e) => { e.stopPropagation(); setLvZeiger(null); setPsAngebot(psAngebot() === a.id ? null : a.id); }}>{name(a.werte.bieter)}{a.werte.beauftragt === true ? ' ✓' : ''}</span>,
    wert: (q) => { const e = preis(a.id, q.id); return e == null ? '' : eur(e); }, roh: (q) => zahlText(preis(a.id, q.id)),
    klasse: (q) => { const e = preis(a.id, q.id); if (e == null || a.werte.ausgeschlossen === true) return undefined; const v = vergleich(q); return v.min != null && e === v.min ? 'guenstig' : v.mittel && Math.abs(e / v.mittel - 1) > 0.3 ? 'abweichend' : undefined; },
    summe: (pos) => pos.filter(zaehlt).reduce((s, q) => s + gp(q.werte.menge, preis(a.id, q.id) ?? 0), 0),
    ...(darfPreise() ? { setzen: (q: Zeile, t: string) => setzen(a, q, t) } : {}),
  });
  const spalten = (): BaumSpalte[] => [nurLesen('menge'), nurLesen('einheit'), nurLesen('art'),
    { ...nurLesen('ep'), id: 'schaetzung', titel: 'Schätzung', summe: (pos) => pos.filter(zaehlt).reduce((s, q) => s + gp(q.werte.menge, q.werte.ep), 0) },
    ...ang().map(bieterSpalte),
    ...(ang().length ? [{ id: 'mittel', titel: 'Mittel', breite: 96, rechts: true, frei: true, hilfe: 'Mittel der gewerteten Angebote', wert: (q: Zeile) => { const x = vergleich(q).mittel; return x == null ? '' : eur(x); } }] : []),
  ];
  // ---------- unter der Tabelle ----------
  const angebotVon = (s: BaumSpalte) => (s.id.startsWith('a:') ? ang().find((a) => a.id === s.id.slice(2)) : undefined);
  const wVon = (a: Zeile) => w().find((x) => x.angebot === a.id);
  const feld = (a: Zeile, f: 'nachlass' | 'nachlass_eur' | 'skonto' | 'skonto_tage', platz: string, titel: string) => (
    <input class="ps-feld" inputmode="decimal" placeholder={platz} aria-label={`${titel} ${name(a.werte.bieter)}`} value={zahlText(a.werte[f])} disabled={!darf('angebot', 'schreiben') || vergeben()}
      onChange={(e) => { const n = zahlAus(e.currentTarget.value); if (typeof n === 'string') { hinweis(n, { art: 'fehler' }); return; } ausfuehren({ objekt: 'angebot', art: 'aendern', objektId: a.id, werte: { [f]: n } }, `${titel} ${name(a.werte.bieter)}`); }} />
  );
  const fuss = (): FussZeile[] => !ang().length ? [] : [
    { titel: 'Summe netto', wert: (s, pos) => { const a = angebotVon(s); if (s.id === 'schaetzung') return eur(s.summe!(pos) ?? 0); if (!a) return ''; const x = wVon(a); return <>{eur(x?.netto ?? 0)}<Show when={x?.fehlend}><br /><small class="still-text">{x!.fehlend} {x!.fehlend === 1 ? 'Preis fehlt' : 'Preise fehlen'}</small></Show></>; } },
    { titel: 'Nachlass in % und/oder €', wert: (s) => { const a = angebotVon(s); return a ? <span class="ps-felder">{feld(a, 'nachlass', '%', 'Nachlass in %')}{feld(a, 'nachlass_eur', '€', 'Nachlass in €')}</span> : ''; } },
    { titel: 'Skonto % innerhalb von … Tagen', wert: (s) => { const a = angebotVon(s); return a ? <span class="ps-felder">{feld(a, 'skonto', '%', 'Skonto in %')}{feld(a, 'skonto_tage', 'Tage', 'Skonto Tage')}</span> : ''; } },
    { titel: 'Wertung netto', klasse: 'stark', wert: (s) => { const a = angebotVon(s); if (!a) return ''; const x = wVon(a); return <>{a.werte.ausgeschlossen === true ? <small class="still-text">ausgeschlossen</small> : eur(x?.nachLass ?? 0)}<Show when={x?.rang}><br /><span class="pille" classList={{ gut: x!.rang === 1 }}>Rang {x!.rang}</span></Show></>; } },
    { titel: '', wert: (s) => { const a = angebotVon(s); if (!a) return ''; return a.werte.beauftragt === true ? <span class="pille gut">beauftragt</span>
      : <Show when={darf('angebot', 'schreiben') && !vergeben()}><button type="button" class="knopf klein" disabled={a.werte.ausgeschlossen === true || !wVon(a)?.netto} onClick={() => setVergabe(a)}>Vergeben …</button></Show>; } },
  ];
  // ---------- Vergabe ----------
  const [vergabe, setVergabe] = createSignal<Zeile | null>(null);
  const [bieterOffen, setBieterOffen] = createSignal(false);
  const rechnungen = () => (lv() ? lebende('rechnung').filter((r) => r.werte.lv === lv()!.id).length : 0);
  const aufheben = () => {
    const a = ang().find((x) => x.werte.beauftragt === true); if (!a || !lv()) return;
    if (rechnungen()) { hinweis(`Zu diesem Auftrag gibt es schon ${rechnungen()} ${rechnungen() === 1 ? 'Rechnung' : 'Rechnungen'} – erst dort löschen, dann die Vergabe aufheben.`, { art: 'fehler' }); return; }
    ausfuehrenMehrere([{ objekt: 'angebot', art: 'aendern', objektId: a.id, werte: { beauftragt: false, auftragsdatum: null } }, { objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { status: 'versendet' } }], `Vergabe an ${name(a.werte.bieter)} aufheben`);
    hinweis(`Die Beauftragung von ${name(a.werte.bieter)} ist aufgehoben – das LV steht wieder in der Ausschreibung, die Angebote sind wieder änderbar.`);
  };
  const nichtVergeben = () => { if (lv()) ausfuehren({ objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { status: 'aufgehoben' } }, 'Nicht vergeben'); hinweis('Das LV wird nicht vergeben – es zählt nicht mehr für Budget, Prognose und To-dos.'); };
  const knoepfe = () => [
    ...(darf('angebot', 'schreiben') && lv() && !vergeben() ? [{ titel: 'Bieter:in', zeichen: 'person_neu', gruppe: 'Neu', tun: () => setBieterOffen(true) }] : []),
    ...(lv() ? [{ titel: 'Besprechung', zeichen: 'vertrag', gruppe: 'Vergabe', gesperrt: !ang().length, tun: () => { const a = ang().find((x) => x.id === psAngebot()) ?? ang().find((x) => x.werte.beauftragt === true) ?? ang().find((x) => wVon(x)?.rang === 1); if (a) besprechungOeffnen(a); } }] : []),
    ...(lv() && darf('lv', 'schreiben') && vergeben() ? [{ titel: 'Vergabe aufheben', zeichen: 'zurueck', gruppe: 'Vergabe', tun: aufheben }] : []),
    ...(lv() && darf('lv', 'schreiben') && !vergeben() ? [{ titel: 'Nicht vergeben', zeichen: 'schliessen', gruppe: 'Vergabe', gesperrt: lv()!.werte.status === 'aufgehoben', tun: nichtVergeben }] : []),
    ...(lv() && darf('angebot', 'schreiben') ? [{ titel: 'Import', zeichen: 'import', gruppe: 'Datei', rechts: true, tun: () => gaebEinlesen(String(lv()!.werte.projekt), lv()!.id) }] : []),
  ];
  return (<>
    <LvBaum m={m} spalten={spalten} speicher="bp_spalten_ps" ohneHinweise knoepfe={knoepfe} fuss={fuss()}
      oben={() => <Show when={!ang().length}><p class="hinweis-kasten lvt-hinweis-oben">Noch keine Angebote. Mit „Bieter:in“ eine Firma hinzufügen und Preise eintragen – oder die GAEB-Datei (X84) einer Firma unter „Import“ einlesen.</p></Show>} />
    <Show when={bieterOffen() && lv()}><BieterDazu lv={lv()!} onZu={() => setBieterOffen(false)} /></Show>
    <Show when={vergabe()} keyed>{(a) => <VergabeFenster lv={lv()!} angebot={a} summe={wVon(a)?.nachLass ?? 0} onZu={() => setVergabe(null)} />}</Show>
  </>);
}

/** Bieter:in aus den Adressen ins LV (Preisspiegel, Versand) – passendes Gewerk zuerst; vorgabe: z. B. heute angeschrieben. */
export function BieterDazu(p: { lv: Zeile; onZu: () => void; vorgabe?: Record<string, string> }) {
  const da = new Set(angeboteVon(p.lv.id).map((a) => String(a.werte.bieter)));
  const gewerk = String(p.lv.werte.gewerk ?? '');
  const firmen = () => lebende('kontakt').filter((k) => !da.has(k.id) && k.werte.art !== 'person').map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – '), passt: !!gewerk && String(k.werte.gewerk ?? '').includes(String(lebende('gewerk').find((g) => g.id === gewerk)?.werte.name ?? '\u0000')) }))
    .sort((a, b) => Number(b.passt) - Number(a.passt) || a.titel.localeCompare(b.titel, 'de'));
  const [wahl, setWahl] = createSignal<string | null>(null);
  const ok = () => { if (!wahl()) return; ausfuehren({ objekt: 'angebot', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.lv.werte.projekt ?? null, lv: p.lv.id, bieter: wahl(), ...(p.vorgabe ?? { eingang: heute() }) } }, `Bieter:in ${name(wahl())}`); p.onZu(); };
  return (
    <Dialog titel="Bieter:in hinzufügen" onAbbrechen={p.onZu} knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!wahl()} onClick={ok}>Hinzufügen</button></>}>
      <div class="formular"><Auswahlliste titel="Firma" platzhalter="Firma suchen …" wert={wahl()} optionen={firmen()} onWert={setWahl} />
        <p class="still-text">Firmen mit passendem Gewerk stehen oben. Neue Firmen unter Adressen anlegen.</p></div>
    </Dialog>
  );
}

/** Vergeben (wie bisher nach dem Preisspiegel): an wen, Summe nach Nachlass, Auftragsdatum. */
function VergabeFenster(p: { lv: Zeile; angebot: Zeile; summe: number; onZu: () => void }) {
  const [datum, setDatum] = createSignal(heute());
  const ok = () => {
    const bieter = name(p.angebot.werte.bieter), summe = p.summe;
    ausfuehrenMehrere([
      ...angeboteVon(p.lv.id).filter((x) => x.werte.beauftragt === true && x.id !== p.angebot.id).map((x) => ({ objekt: 'angebot', art: 'aendern' as const, objektId: x.id, werte: { beauftragt: false } })),
      { objekt: 'angebot', art: 'aendern', objektId: p.angebot.id, werte: { beauftragt: true, auftragsdatum: datum() } },
      { objekt: 'lv', art: 'aendern', objektId: p.lv.id, werte: { status: 'vergeben' } },
    ], `Vergeben an ${bieter}`);
    p.onZu();
    hinweis(`Vergeben an ${bieter} – ${eur(summe)} € netto. Bauvertrag oder Auftragsschreiben unter „Aufträge“.`);
  };
  return (
    <Dialog titel="Vergeben" onAbbrechen={p.onZu} knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" onClick={ok}>Vergeben</button></>}>
      <div class="formular">
        <p>An <b>{name(p.angebot.werte.bieter)}</b> · Wertung netto <b>{eur(p.summe)} €</b></p>
        <FeldEingabe feld={{ name: 'auftragsdatum', titel: 'Auftrag vom', art: 'datum' }} wert={datum()} onWert={(w) => setDatum(String(w ?? heute()))} />
        <p class="still-text">Danach sind die Positionen Vertragsinhalt (Änderungen als Nachtrag) und die Angebote stehen fest. „Vergabe aufheben“ nimmt das zurück.</p>
      </div>
    </Dialog>
  );
}

