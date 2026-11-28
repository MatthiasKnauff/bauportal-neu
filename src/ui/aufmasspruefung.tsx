// Aufmaßprüfung je Rechnung (wie im bisherigen Bauportal, Rechnung aus module/ava/aufmass.ts): oben die Rechnungen des Auftrags in
// ihrer Reihenfolge, darunter der LV-Baum (Baustein in lvbearbeiten.tsx) mit Menge LV · EP Auftrag · „bis …“ (Stand der vorigen
// geprüften Rechnung) · lt. Firma · aufgemessen (Stand) · Zuwachs · ✓/✗/○ · GP. „aufgemessen“ und „Zuwachs“ sind direkt eintippbar,
// solange die Position höchstens eine Zeile in dieser Rechnung hat; mehr Zeilen (Datum, Ort, Rechenweg) rechts in der Karte.
// Prüfung abschließen hält das Aufmaß fest (die laufenden Zeilen bekommen die Rechnung) und trägt den geprüften Leistungsstand ein.
import { Kartenrahmen } from './baukasten/kartenrahmen';
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { beitrag, geprueft as istGeprueft, ketteVon, mehrmenge, nachAufmass, pruefung, rechnungTitel, vorige, zeileAus } from '../module/ava/aufmass';
import { abschliessen, aufmassVon, setRechnungWahl, zuruecknehmbar, zuruecknehmen } from './rechnungpruefen';
import { gp, istZuschlag, lvMenge, zaehlt, zahl } from '../module/ava/rechnung';
import { gpMit } from './avadaten';
import { AufmassEinlesen } from './aufmasseinlesen';
import { lvVon } from './avakopf';
import type { Mitte } from './baukasten/anpassung';
import { LV_SPALTEN, LvBaum, eur, lvSpalteLesen, zahlAus, zahlText, type BaumSpalte, type FussZeile } from './lvbearbeiten';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { nachtragAnlegen } from './avadaten';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { istText } from '../kern/lvarten';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';

const buero = () => sicht.buero?.[BUERO_ID]?.werte;

const RART: Record<string, string> = { abschlag: 'AR', schluss: 'SR', nachtrag: 'NT-Rg.', stundenlohn: 'Stundenlohn' };
const heute = () => new Date().toLocaleDateString('de-DE');
export function Aufmasspruefung(m: Mitte): JSX.Element {
  const lv = () => lvVon(m);
  const a = aufmassVon(() => lv()?.id);
  const schreiben = () => darf('aufmass', 'schreiben') && !a.fest();
  const kum = () => !a.r() || ketteVon(a.r()!) !== null;
  const lvId = () => lv()!.id, projekt = () => lv()!.werte.projekt ?? null;
  /** Stand oder Zuwachs direkt in der Zelle: keine oder genau eine Zeile dieser Rechnung – sie wird angelegt bzw. ersetzt. */
  const direkt = (q: Zeile, eingabe: string): string | void => {
    if (!schreiben()) return a.fest() ? 'Diese Rechnung ist geprüft – das Aufmaß steht fest.' : 'Keine Berechtigung.';
    const Z = a.eigene(q.id);
    if (Z.length > 1) return 'Diese Position hat mehrere Aufmaßzeilen – rechts in der Karte ändern.';
    const ohne = (a.stand().get(q.id) ?? 0) - (Z[0] ? beitrag(Z[0]) ?? 0 : 0);
    if (!eingabe.trim()) { if (Z[0]) ausfuehren({ objekt: 'aufmass', art: 'loeschen', objektId: Z[0].id }, 'Aufmaß entfernen'); return; }
    const neu = zeileAus(eingabe, ohne); if (!neu) return 'Den Rechenweg verstehe ich nicht – z. B. „4,5*5 + 2*16,25“ (Stand) oder „+ 2*2,5“ (Zuwachs).';
    const werte = { rechenweg: neu.rechenweg, basis: neu.basis };
    if (Z[0]) ausfuehren({ objekt: 'aufmass', art: 'aendern', objektId: Z[0].id, werte }, 'Aufmaß');
    else ausfuehren({ objekt: 'aufmass', art: 'anlegen', objektId: neueKennung(), werte: { projekt: projekt(), lv: lvId(), position: q.id, rechnung: a.r() && ketteVon(a.r()!) === null ? a.r()!.id : null, datum: heute(), quelle: 'eigen', ...werte } }, 'Aufmaß');
  };
  const vorTitel = () => { const v = vorige(a.rechnungen(), a.r()); return v ? `bis ${RART[String(v.werte.art)] ?? ''} ${String(v.werte.nummer ?? '')}`.trim() : 'bisher'; };
  const geprueft = (y: Zeile) => a.stand().get(y.id) ?? 0;
  const spalten = (): BaumSpalte[] => [
    { ...LV_SPALTEN.find((s) => s.id === 'menge')!, titel: 'Menge LV', setzen: undefined }, { ...LV_SPALTEN.find((s) => s.id === 'einheit')!, setzen: undefined },
    { id: 'ep', titel: 'EP Auftrag', aus: true, breite: 80, rechts: true, wert: (q) => { const e = a.ep(q); return e == null ? '' : eur(e); } },
    ...(kum() ? [{ id: 'vor', titel: vorTitel(), aus: true, breite: 84, rechts: true, hilfe: 'Stand der vorigen geprüften Rechnung', wert: (q: Zeile) => zahlText(a.vor().get(q.id) || null) }] : []),
    { id: 'firma', titel: 'lt. Firma', breite: 78, rechts: true, hilfe: 'Menge (Stand) laut Rechnung der Firma',
      klasse: (q) => { const f = a.firma().get(q.id)?.werte.menge; if (f == null || f === '') return undefined; return pruefung(zahl(f), a.stand().get(q.id)) === 'stimmt' ? 'gut' : 'warn'; },
      wert: (q) => zahlText(a.firma().get(q.id)?.werte.menge),
      ...(a.r() && darf('rechnungsmenge', 'schreiben') && !a.fest() ? { setzen: (q: Zeile, t: string) => {
        const n = zahlAus(t); if (typeof n === 'string') return n; const alt = a.firma().get(q.id);
        if (alt) ausfuehren(n == null ? { objekt: 'rechnungsmenge', art: 'loeschen', objektId: alt.id } : { objekt: 'rechnungsmenge', art: 'aendern', objektId: alt.id, werte: { menge: n } }, 'Menge laut Firma');
        else if (n != null) ausfuehren({ objekt: 'rechnungsmenge', art: 'anlegen', objektId: neueKennung(), werte: { projekt: projekt(), rechnung: a.r()!.id, position: q.id, menge: n } }, 'Menge laut Firma');
      } } : {}) },
    { id: 'stand', titel: kum() ? 'aufgemessen' : 'Aufmaß', breite: 92, rechts: true, hilfe: 'Stand bis einschließlich dieser Rechnung – eintippen: Rechenweg (z. B. 4,5*5 + 2*16,25), mit „+“ davor ein Zuwachs',
      wert: (q) => { const s = a.stand().get(q.id); const pct = zahl(q.werte.menge) ? Math.round((s ?? 0) / zahl(q.werte.menge) * 100) : null; return s == null ? '' : `${zahlText(s)}${pct != null && pct > 100 ? ` (${pct} %)` : ''}`; },
      klasse: (q) => { const m = mehrmenge(a.stand().get(q.id) ?? 0, zahl(q.werte.menge), buero()); return m ? `ueber-${m}` : undefined; },
      roh: (q) => { const Z = a.eigene(q.id); return Z.length === 1 ? String(Z[0]!.werte.rechenweg ?? '') : zahlText(a.stand().get(q.id)); }, setzen: direkt },
    ...(kum() ? [{ id: 'zuwachs', titel: 'Zuwachs', aus: true, breite: 80, rechts: true, hilfe: 'seit der vorigen geprüften Rechnung – eintippen fügt hinzu',
      wert: (q: Zeile) => { const d = (a.stand().get(q.id) ?? 0) - (a.vor().get(q.id) ?? 0); return Math.abs(d) < 1e-9 ? '' : `${d > 0 ? '+' : ''}${zahlText(d)}`; },
      roh: () => '+ ', setzen: (q: Zeile, t: string) => direkt(q, t.trim().startsWith('+') ? t : `+ ${t}`) }] : []),
    { id: 'pruef', titel: '', breite: 34, hilfe: '✓ stimmt mit der Firma · ✗ weicht ab · ○ noch nichts aufgemessen', wert: (q) => {
      const f = a.firma().get(q.id)?.werte.menge; if ((f == null || f === '') && a.stand().get(q.id) == null) return '';
      return { stimmt: '✓', abweichend: '✗', offen: '○' }[pruefung(f == null || f === '' ? null : zahl(f), a.stand().get(q.id))]; },
      klasse: (q) => { const f = a.firma().get(q.id)?.werte.menge; const p = pruefung(f == null || f === '' ? null : zahl(f), a.stand().get(q.id)); return `am-${p}`; } },
    { id: 'gp_gepr', titel: 'GP geprüft', breite: 96, rechts: true, wert: (q) => { const s = a.stand().get(q.id), e = a.ep(q); return (s == null && !istZuschlag(q.werte.art)) || e == null || !zaehlt(q) ? '' : eur(gpMit(q, geprueft, a.ep)); },
      summe: (pos) => pos.filter(zaehlt).reduce((x, q) => x + gpMit(q, geprueft, a.ep), 0) },
    // wie bisher in der Spaltenwahl einschaltbar: GP Auftrag, EP/GP Schätzung, Mehr-/Mindermenge, %, Prognose, KG, Art
    { id: 'gp_auftrag', titel: 'GP Auftrag', aus: true, breite: 96, rechts: true, wert: (q) => (a.ep(q) == null || !zaehlt(q) ? '' : eur(gpMit(q, lvMenge, a.ep))),
      summe: (pos) => pos.filter(zaehlt).reduce((x, q) => x + gpMit(q, lvMenge, a.ep), 0) },
    { id: 'ep_schaetz', titel: 'EP Schätzung', aus: true, breite: 90, rechts: true, wert: (q) => (q.werte.ep == null || q.werte.ep === '' ? '' : eur(zahl(q.werte.ep))) },
    { id: 'gp_schaetz', titel: 'GP Schätzung', aus: true, breite: 96, rechts: true, wert: (q) => (q.werte.ep == null || q.werte.ep === '' || !zaehlt(q) ? '' : eur(gpMit(q))),
      summe: (pos) => pos.filter(zaehlt).reduce((x, q) => x + gpMit(q), 0) },
    { id: 'mehr', titel: 'Mehr/Minder', aus: true, breite: 86, rechts: true, hilfe: 'aufgemessen minus LV-Menge', klasse: (q) => (geprueft(q) - zahl(q.werte.menge) > 1e-9 ? 'warn' : undefined),
      wert: (q) => { if (istZuschlag(q.werte.art) || a.stand().get(q.id) == null) return ''; const d = geprueft(q) - zahl(q.werte.menge); return Math.abs(d) < 1e-9 ? '0' : `${d > 0 ? '+' : ''}${zahlText(d)}`; } },
    { id: 'prozent', titel: '%', aus: true, breite: 54, rechts: true, hilfe: 'aufgemessen in % der LV-Menge',
      wert: (q) => (istZuschlag(q.werte.art) || !zahl(q.werte.menge) || a.stand().get(q.id) == null ? '' : `${Math.round(geprueft(q) / zahl(q.werte.menge) * 100)} %`) },
    { id: 'prognose', titel: 'Prognose', aus: true, breite: 96, rechts: true, hilfe: 'größere von LV-Menge und Aufmaß × EP Auftrag',
      wert: (q) => (a.ep(q) == null || !zaehlt(q) ? '' : eur(gpMit(q, (y) => Math.max(zahl(y.werte.menge), geprueft(y)), a.ep))),
      summe: (pos) => pos.filter(zaehlt).reduce((x, q) => x + gpMit(q, (y) => Math.max(zahl(y.werte.menge), geprueft(y)), a.ep), 0) },
    lvSpalteLesen('kg', true), lvSpalteLesen('art', true),
  ];
  const laut = (y: Zeile) => { const f = a.firma().get(y.id)?.werte.menge; return f == null || f === '' ? 0 : zahl(f); };
  const summeFirma = (pos: Zeile[]) => pos.filter(zaehlt).reduce((x, q) => x + gpMit(q, laut, a.ep), 0);
  const fuss = (): FussZeile[] => [
    { titel: 'Leistungsstand netto geprüft', wert: (s, pos) => (s.id === 'gp_gepr' ? eur(s.summe!(pos) ?? 0) : '') },
    { titel: 'Leistungsstand netto laut Firma (Menge Firma × EP Auftrag)', wert: (s, pos) => (s.id === 'gp_gepr' ? eur(summeFirma(pos)) : '') },
  ];
  // ---------- Befehle ----------
  const uebernehmen = () => {
    const pos = lebende('lv_position').filter((q) => q.werte.lv === lvId() && !istText(q.werte.art));
    const b: Vorlage[] = [];
    for (const q of pos) {
      const f = a.firma().get(q.id)?.werte.menge; if (f == null || f === '') continue;
      const d = Math.round((zahl(f) - (a.stand().get(q.id) ?? 0)) * 10000) / 10000; if (d <= 0) continue;
      b.push({ objekt: 'aufmass', art: 'anlegen', objektId: neueKennung(), werte: { projekt: projekt(), lv: lvId(), position: q.id, rechnung: a.r() && ketteVon(a.r()!) === null ? a.r()!.id : null, datum: heute(), ort: 'lt. Firma', rechenweg: `+ ${zahlText(d)}`, quelle: 'firma' } });
    }
    if (!b.length) { hinweis('Nirgends fordert die Firma mehr als aufgemessen.'); return; }
    ausfuehrenMehrere(b, 'Mengen der Firma übernommen'); hinweis(`${b.length} ${b.length === 1 ? 'Position' : 'Positionen'}: Mehrmenge der Firma als Zeile „lt. Firma“ eingetragen – rückgängig mit Strg+Z.`);
  };
  const knoepfe = () => [
    ...(a.r() && darf('rechnung', 'schreiben') ? [a.fest() ? { titel: 'Prüfung zurücknehmen', zeichen: 'zurueck', gruppe: 'Prüfen', gesperrt: !zuruecknehmbar(a.r()!), tun: () => zuruecknehmen(a.r()!) }
      : { titel: 'Prüfung abschließen', zeichen: 'haken', gruppe: 'Prüfen', tun: () => abschliessen(a.r()!) }] : []),
    ...(a.r() && schreiben() ? [{ titel: 'Mengen der Firma', zeichen: 'datei_runter', gruppe: 'Übernehmen', tun: uebernehmen }] : []),
  ];
  const positionen = () => lebende('lv_position').filter((q) => q.werte.lv === lv()?.id);
  return (
    <LvBaum m={m} spalten={spalten} speicher={`bp_spalten_aufmass_${kum() ? 'k' : 'e'}`} ansicht="aufmass" mitNachtraegen ohneHinweise knoepfe={knoepfe} fuss={fuss()}
      oben={() => (<>
        <RechnungsLeiste rechnungen={a.rechnungen()} gewaehlt={a.r()} onWahl={setRechnungWahl} leer="Noch keine Rechnung – unter „Rechnungen“ anlegen. Das Aufmaß lässt sich schon „laufend“ erfassen.">
          <Show when={a.r() && lv()}><span class="am-einlesen"><AufmassEinlesen lv={lv()!} rechnung={a.r()!} positionen={positionen()} mengen={a.firma()} /></span></Show>
        </RechnungsLeiste>
        <Show when={a.fest()}><p class="hinweis-kasten lvt-hinweis-oben">🔒 {String(a.r()!.werte.nummer ?? 'Diese Rechnung')} ist geprüft – das Aufmaß steht fest. Ändern erst nach „Prüfung zurücknehmen“ (nur bei der letzten).</p></Show>
        <Show when={a.r() && !nachAufmass(a.r()!)}><p class="hinweis-kasten lvt-hinweis-oben">{rechnungTitel(a.r()!, a.rechnungen())} wird ohne Aufmaß geprüft ({a.r()!.werte.art === 'stundenlohn' ? 'Stundenzettel' : 'Betrag oder Positionen von Hand'}) – unter „Rechnungen“.</p></Show>
        <Show when={!a.auftrag()}><p class="hinweis-kasten lvt-hinweis-oben">Dieses LV ist noch nicht vergeben – ohne Auftrag gibt es keine EP für den Leistungsstand.</p></Show>
      </>)} />
  );
}

/** Leiste der Rechnungen eines Auftrags (Aufmaßprüfung und Rechnungen). */
export function RechnungsLeiste(p: { rechnungen: Zeile[]; gewaehlt: Zeile | null; onWahl: (id: string) => void; leer: string; children?: JSX.Element }): JSX.Element {
  return (
    <div class="am-leiste" role="tablist" aria-label="Rechnungen">
      <For each={p.rechnungen} fallback={<span class="still-text">{p.leer}</span>}>{(r) => (
        <button type="button" role="tab" class="am-rechnung" classList={{ an: p.gewaehlt?.id === r.id, fest: istGeprueft(r), einzeln: r.werte.art === 'stundenlohn' }} aria-selected={p.gewaehlt?.id === r.id} onClick={() => p.onWahl(r.id)}>
          <b>{rechnungTitel(r, p.rechnungen)}</b><small>{r.werte.nummer ? `Nr. ${String(r.werte.nummer)} · ` : ''}{istGeprueft(r) ? '🔒 geprüft' : 'offen'}</small></button>)}</For>
      {p.children}
    </div>
  );
}

/** Rechts in der Aufmaßprüfung: die Rechenzeilen der markierten Position – Datum, Ort, Rechenweg – mit Stand und Anteil an der LV-Menge. */
export function AufmassKarte(p: { position: Zeile; heftzwecke: JSX.Element }): JSX.Element {
  const a = aufmassVon(() => String(p.position.werte.lv));
  const q = () => p.position;
  const alle = createMemo(() => a.zeilen().filter((z) => z.werte.position === q().id).sort((x, y) => String(x.werte.datum ?? '').localeCompare(String(y.werte.datum ?? ''))));
  const schreiben = () => darf('aufmass', 'schreiben') && !a.fest();
  const stand = () => a.stand().get(q().id) ?? 0, menge = () => zahl(q().werte.menge), pct = () => (menge() ? Math.round(stand() / menge() * 100) : null);
  const mehr = () => mehrmenge(stand(), menge(), buero());
  const R = (id: unknown) => a.rechnungen().find((r) => r.id === id);
  const aendern = (z: Zeile, werte: Record<string, unknown>, titel: string) => ausfuehren({ objekt: 'aufmass', art: 'aendern', objektId: z.id, werte: werte as never }, titel);
  const rechenwegAendern = (z: Zeile, t: string) => {
    const ohne = stand() - (beitrag(z) ?? 0), neu = zeileAus(t, ohne);
    if (!neu) { hinweis('Den Rechenweg verstehe ich nicht – z. B. „4,5*5 + 2*16,25“ (Stand) oder „+ 2*2,5“ (Zuwachs).', { art: 'fehler' }); return; }
    aendern(z, { rechenweg: neu.rechenweg, basis: neu.basis }, 'Rechenweg');
  };
  const [neu, setNeu] = createSignal('');
  const dazu = () => {
    const t = neu().trim(); if (!t) return;
    const z = zeileAus(t, stand()); if (!z) { hinweis('Den Rechenweg verstehe ich nicht.', { art: 'fehler' }); return; }
    ausfuehren({ objekt: 'aufmass', art: 'anlegen', objektId: neueKennung(), werte: { projekt: q().werte.projekt ?? null, lv: q().werte.lv ?? null, position: q().id, rechnung: a.r() && ketteVon(a.r()!) === null ? a.r()!.id : null, datum: heute(), quelle: 'eigen', rechenweg: z.rechenweg, basis: z.basis } }, 'Aufmaßzeile');
    setNeu('');
  };
  return (
    <Kartenrahmen klasse="am-karte" label="Aufmaß der Position" titel={<>{String(q().werte.oz ?? '')} {String(q().werte.kurztext ?? '')}</>} heftzwecke={p.heftzwecke}>
      <p class="still-text">LV-Menge {zahlText(menge())} {String(q().werte.einheit ?? '')} · aufgemessen <b>{zahlText(stand())} {String(q().werte.einheit ?? '')}</b>{pct() != null ? ` (${pct()} %)` : ''}
        {a.ep(q()) != null ? ` · ${eur(gp(stand(), a.ep(q())))} € zum EP ${eur(a.ep(q())!)}` : ''}</p>
      <Show when={mehr()}><div class="am-balken" classList={{ rot: mehr() === 'rot' }} title={mehr() === 'rot' ? 'deutlich mehr als im LV: neuer Preis kann verlangt werden (VOB/B § 2 Abs. 3)' : 'mehr als im LV'}><i style={{ width: `${Math.min(100, pct()! - 100) }%` }} /></div></Show>
      <Show when={!q().werte.nachtrag && stand() > menge() && menge() > 0 && darf('nachtrag', 'schreiben') && sicht.lv?.[String(q().werte.lv)]}>
        <p class="still-text klein-text">Mehrmenge {zahlText(stand() - menge())} {String(q().werte.einheit ?? '')} über der LV-Menge.{' '}
          <button type="button" class="knopf klein" onClick={() => { const n = nachtragAnlegen(sicht.lv![String(q().werte.lv)]!, `Mehrmenge ${String(q().werte.oz ?? '')} ${String(q().werte.kurztext ?? '')}`.trim(), {
            kurztext: String(q().werte.kurztext ?? ''), langtext: q().werte.langtext ?? null, einheit: q().werte.einheit ?? null, menge: Math.round((stand() - menge()) * 1000) / 1000, ep: a.ep(q()), kostengruppe: q().werte.kostengruppe ?? null });
            hinweis(`Nachtrag ${n.nr} für die Mehrmenge angelegt (Stand „angemeldet“) – unter „Aufträge“ weiter bearbeiten.`); }}>Nachtrag für die Mehrmenge</button></p>
      </Show>
      <table class="am-zeilen">
        <thead><tr><th>Datum</th><th>Ort / Bauteil</th><th>Rechenweg</th><th class="zahl">Menge</th><th /></tr></thead>
        <tbody>
          <For each={alle()} fallback={<tr><td colSpan={5} class="still-text">Noch kein Aufmaß für diese Position.</td></tr>}>{(z) => {
            const rz = () => R(z.werte.rechnung);
            const frei = () => schreiben() && (!z.werte.rechnung || (!!rz() && ketteVon(rz()!) === null && !istGeprueft(rz()!)));
            return (
              <tr classList={{ fest: !!rz() && istGeprueft(rz()!) }}>
                <td><input value={String(z.werte.datum ?? '')} disabled={!frei()} aria-label="Datum" onChange={(e) => aendern(z, { datum: e.currentTarget.value }, 'Datum')} /></td>
                <td><input value={String(z.werte.ort ?? '')} disabled={!frei()} aria-label="Ort" onChange={(e) => aendern(z, { ort: e.currentTarget.value }, 'Ort')} /></td>
                <td><input value={String(z.werte.rechenweg ?? '')} disabled={!frei()} aria-label="Rechenweg" onChange={(e) => rechenwegAendern(z, e.currentTarget.value)} /></td>
                <td class="zahl">{beitrag(z) == null ? '?' : `${(beitrag(z) ?? 0) >= 0 ? '+' : ''}${zahlText(beitrag(z))}`}<Show when={z.werte.rechnung}><br /><small class="still-text">{String(R(z.werte.rechnung)?.werte.nummer ?? '')}</small></Show></td>
                <td><Show when={frei()}><button type="button" class="knopf klein still" aria-label="Zeile löschen" onClick={() => ausfuehren({ objekt: 'aufmass', art: 'loeschen', objektId: z.id }, 'Aufmaßzeile löschen')}>✕</button></Show></td>
              </tr>);
          }}</For>
        </tbody>
      </table>
      <Show when={schreiben()}>
        <div class="am-neu"><input value={neu()} placeholder="Stand (z. B. 4,5*5 + 2*16,25) oder + Zuwachs" aria-label="Neue Aufmaßzeile" onInput={(e) => setNeu(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); dazu(); } }} />
          <button type="button" class="knopf" onClick={dazu}>Hinzufügen</button></div>
        <p class="still-text klein-text">Ohne Zeichen getippt ist es der Stand bis einschließlich dieser Rechnung, mit „+“ davor ein Zuwachs. Text vor einem Doppelpunkt ist Beschriftung („Wand Nord: 2,5*3“).</p>
      </Show>
    </Kartenrahmen>
  );
}

