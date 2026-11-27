// Abrechnung eines Auftrags aus seinen Daten – EINE Rechnung für Oberfläche und Ausdruck (Rechnungsfreigabe, Prüfblatt,
// Massenermittlung): EP des Auftrags, Leistungsstand einer Rechnung, wie die Prüfung ihn gerade ergibt, und die Tabellen der Freigabe.
// Reine Rechnung: im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { BUERO_ID } from '../verwaltung/beipackzettel';
import type { Druckquelle, DruckTabelle, Hole } from '../../kern/druck';
import { beitrag, geprueft, ketteVon, nachAufmass, rechnungTitel, reihe, standAus, vorige, zeilenBis, zeilenSumme } from './aufmass';
import { bedingungenAus, gp, gpVon, istZuschlag, leiter, mengeVon, nachKennung, nachOz, zaehlt, zahl } from './rechnung';
import { istHinweis } from '../../kern/lvarten';
import { wirksam } from '../../kern/erben';
import { lv as lvModell } from './beipackzettel';

type E = { id: string; werte: Werte };
/** Was zur Abrechnung eines LV gehört. */
export interface Abrechnung { lv?: E; rechnungen: E[]; positionen: E[]; angebote: E[]; preise: E[]; aufmass: E[]; zeilen: E[] }

/** Welche Positionen als Leistung zählen (wie bisher, Einstellung des Büros): Nachtragspositionen nur, wenn ihr Nachtrag
 *  angemeldet bis beauftragt ist – abgelehnte nie; mit „nur beauftragte“ erst, wenn er beauftragt ist. */
export function abrechenbar(positionen: E[], nachtraege: E[], nurBeauftragte: boolean): E[] {
  const stand = new Map(nachtraege.map((n) => [n.id, String(n.werte.stand ?? '')]));
  return positionen.filter((q) => { const n = q.werte.nachtrag; if (!n) return true; const s = stand.get(String(n)) ?? '';
    return nurBeauftragte ? s === 'beauftragt' : s !== 'abgelehnt'; });
}
export const NUR_BEAUFTRAGTE = (buero: Werte | undefined) => buero?.nachtraege_leistung === 'beauftragt';

/** EP des Auftrags je Position (Nachtragspositionen: ihr eigener EP) – null: kein Preis. */
export function epAus(angebote: E[], preise: E[]): (q: E) => number | null {
  const auftrag = angebote.find((a) => a.werte.beauftragt === true);
  const ep = new Map(preise.filter((x) => auftrag && x.werte.angebot === auftrag.id).map((x) => [String(x.werte.position), x.werte.ep]));
  return (q) => {
    const w = q.werte.nachtrag ? q.werte.ep : ep.get(q.id);
    return w != null && w !== '' ? zahl(w) : null;
  };
}
/** Leistungsstand netto einer Rechnung, wie die Prüfung ihn gerade ergibt: nach Aufmaß Stand je Position × EP, ohne Aufmaß die
 *  Zeilen von Hand, sonst der eingetragene geprüfte (bzw. angeforderte) Betrag. */
export function leistungAus(d: Pick<Abrechnung, 'rechnungen' | 'positionen' | 'aufmass' | 'zeilen'>, r: E, ep: (q: E) => number | null): number {
  if (!nachAufmass(r)) { const Z = d.zeilen.filter((z) => z.werte.rechnung === r.id); return Z.length ? zeilenSumme(Z) : zahl(r.werte.geprueft ?? r.werte.betrag); }
  const stand = standAus(zeilenBis(d.aufmass, d.rechnungen, r));
  const alle = nachKennung(d.positionen), menge = (y: E) => stand.get(y.id) ?? 0;
  return Math.round(d.positionen.filter(zaehlt).reduce((x, q) => x + gpVon(q, alle, menge, ep), 0) * 100) / 100;
}

const zt = (n: number | null | undefined, stellen = 3) => (n == null ? '' : n.toLocaleString('de-DE', { maximumFractionDigits: stellen }));
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Die Tabellen der Rechnungsfreigabe: Zahlbetrag (Rechenleiter), Prüfblatt (je Position), Massenermittlung (Aufmaßzeilen). */
export function freigabeTabellen(d: Abrechnung, r: E, mengen: E[]): { zahlbetrag: DruckTabelle[]; pruefblatt: DruckTabelle[]; massen: DruckTabelle[] } {
  const ep = epAus(d.angebote, d.preise), stand = (x: E) => leistungAus(d, x, ep);
  const b = bedingungenAus(d.lv?.werte, d.angebote.find((a) => a.werte.beauftragt === true)?.werte);
  const L = leiter(d.rechnungen, r.id, b, stand);
  const gefordert = zahl(r.werte.betrag), jetzt = stand(r);
  const zahlbetrag: DruckTabelle[] = [{ spalten: [{ titel: '' }, { titel: 'Betrag €', rechts: true }],
    zeilen: [...L.map((z) => ({ zellen: [z.titel, eur(z.betrag)], art: z.summe ? 'summe' as const : z.hinweis ? 'hinweis' as const : undefined })),
      ...(gefordert ? [{ zellen: [`gefordert netto ${eur(gefordert)} € – ${jetzt < gefordert - 0.5 ? 'Kürzung' : 'Differenz'}`, eur(Math.round((jetzt - gefordert) * 100) / 100)], art: 'hinweis' as const }] : [])] }];
  let pruefblatt: DruckTabelle[] = [], massen: DruckTabelle[] = [];
  if (nachAufmass(r)) {
    const st = standAus(zeilenBis(d.aufmass, d.rechnungen, r)), v = vorige(d.rechnungen, r), vor = v ? standAus(zeilenBis(d.aufmass, d.rechnungen, v)) : new Map<string, number>();
    const firma = new Map(mengen.map((m) => [String(m.werte.position), zahl(m.werte.menge)]));
    const kum = ketteVon(r) !== null, alle = nachKennung(d.positionen);
    const zeilen: DruckTabelle['zeilen'] = [];
    let summe = 0;
    for (const q of nachOz(d.positionen)) {
      const art = String(q.werte.art ?? 'normal');
      if (art === 'titel') { zeilen.push({ zellen: [String(q.werte.oz ?? ''), String(q.werte.kurztext ?? ''), '', '', '', '', '', '', ''], art: 'titel' }); continue; }
      if (istHinweis(art)) continue;
      // Zuschlagsposition: ihre „Menge“ ist die Summe der geprüften GP ihrer Positionen / 100
      const s = istZuschlag(art) ? mengeVon(q, alle, (y) => st.get(y.id) ?? 0, ep) : st.get(q.id), f = firma.get(q.id), e = ep(q);
      if ((s == null || (istZuschlag(art) && !s)) && f == null) continue;
      const g = zaehlt(q) && s != null && e != null ? gp(s, e) : null; if (g) summe += g;
      zeilen.push({ zellen: [String(q.werte.oz ?? ''), String(q.werte.kurztext ?? ''), String(q.werte.einheit ?? ''), zt(zahl(q.werte.menge)), kum ? zt(vor.get(q.id) ?? null) : '', zt(f ?? null), zt(s ?? null), e == null ? '' : eur(e), g == null ? '' : eur(g)],
        art: f != null && s != null && Math.abs(f - s) > 0.0005 ? 'hinweis' : undefined });
    }
    zeilen.push({ zellen: ['', 'Leistungsstand netto geprüft', '', '', '', '', '', '', eur(Math.round(summe * 100) / 100)], art: 'summe' });
    pruefblatt = [{ spalten: [{ titel: 'OZ' }, { titel: 'Kurztext' }, { titel: 'EH' }, { titel: 'Menge LV', rechts: true }, { titel: kum && v ? `bis ${rechnungTitel(v, d.rechnungen)}` : '', rechts: true },
      { titel: 'lt. Firma', rechts: true }, { titel: 'geprüft', rechts: true }, { titel: 'EP €', rechts: true }, { titel: 'GP €', rechts: true }], zeilen }];
    // Massenermittlung: die Aufmaßzeilen dieser Rechnung (laufende, solange sie offen ist)
    const eigen = d.aufmass.filter((z) => (ketteVon(r) === null ? z.werte.rechnung === r.id : geprueft(r) ? z.werte.rechnung === r.id : !z.werte.rechnung));
    const pos = new Map(d.positionen.map((q) => [q.id, q]));
    const M = [...eigen].sort((x, y) => String(pos.get(String(x.werte.position))?.werte.oz ?? '').localeCompare(String(pos.get(String(y.werte.position))?.werte.oz ?? ''), 'de', { numeric: true }) || String(x.werte.datum ?? '').localeCompare(String(y.werte.datum ?? '')));
    if (M.length) massen = [{ spalten: [{ titel: 'OZ' }, { titel: 'Datum' }, { titel: 'Ort / Bauteil' }, { titel: 'Rechenweg' }, { titel: 'Menge', rechts: true }, { titel: 'EH' }],
      zeilen: M.map((z) => { const q = pos.get(String(z.werte.position)); const bt = beitrag(z);
        return { zellen: [String(q?.werte.oz ?? ''), String(z.werte.datum ?? ''), String(z.werte.ort ?? ''), String(z.werte.rechenweg ?? ''), bt == null ? '?' : `${bt >= 0 && String(z.werte.rechenweg ?? '').trim().startsWith('+') ? '+' : ''}${zt(bt)}`, String(q?.werte.einheit ?? '')] }; }) }];
  } else {
    const Z = d.zeilen.filter((z) => z.werte.rechnung === r.id);
    if (Z.length) pruefblatt = [{ spalten: [{ titel: r.werte.art === 'stundenlohn' ? 'Stundenlohnarbeiten' : 'Leistung' }, { titel: 'Menge', rechts: true }, { titel: 'EH' }, { titel: 'EP €', rechts: true }, { titel: 'Betrag €', rechts: true }],
      zeilen: [...Z.map((z) => ({ zellen: [String(z.werte.text ?? ''), zt(zahl(z.werte.menge)), String(z.werte.einheit ?? ''), eur(zahl(z.werte.ep)), eur(gp(z.werte.menge, z.werte.ep))] })),
        { zellen: ['Summe netto', '', '', '', eur(zeilenSumme(Z))], art: 'summe' as const }] }];
  }
  return { zahlbetrag, pruefblatt, massen };
}

/** Die Daten aus dem, was der Ausdruck geholt hat (Browser: die Sicht, Server: die Datenbank). */
function abrechnungAus(hole: Hole, r: E): Abrechnung {
  const lv = String(r.werte.lv ?? ''), angebote = hole('angebot', 'lv', lv), ids = new Set(angebote.map((a) => a.id));
  const positionen = abrechenbar(hole('lv_position', 'lv', lv), hole('nachtrag', 'lv', lv), NUR_BEAUFTRAGTE(hole('buero', 'id', BUERO_ID)[0]?.werte));
  const l = hole('lv', 'id', lv)[0], ebenen = [hole('projekt', 'id', String(r.werte.projekt ?? ''))[0]?.werte, hole('buero', 'id', BUERO_ID)[0]?.werte];
  return { lv: l && { ...l, werte: wirksam(lvModell, l.werte, ebenen).werte }, rechnungen: reihe(hole('rechnung', 'lv', lv)), positionen, angebote,
    preise: hole('angebot_preis', 'projekt', String(r.werte.projekt ?? '')).filter((x) => ids.has(String(x.werte.angebot))), aufmass: hole('aufmass', 'lv', lv), zeilen: hole('rechnungszeile', 'projekt', String(r.werte.projekt ?? '')) };
}
const BRAUCHT: Druckquelle['braucht'] = [{ objekt: 'lv', feld: 'id', wert: 'lv' }, { objekt: 'rechnung', feld: 'lv', wert: 'lv' }, { objekt: 'lv_position', feld: 'lv', wert: 'lv' },
  { objekt: 'angebot', feld: 'lv', wert: 'lv' }, { objekt: 'angebot_preis', feld: 'projekt', wert: 'projekt' }, { objekt: 'aufmass', feld: 'lv', wert: 'lv' },
  { objekt: 'rechnungszeile', feld: 'projekt', wert: 'projekt' }, { objekt: 'rechnungsmenge', feld: 'rechnung', wert: 'id' },
  { objekt: 'nachtrag', feld: 'lv', wert: 'lv' }, { objekt: 'buero', feld: 'id', fest: BUERO_ID }, { objekt: 'projekt', feld: 'id', wert: 'projekt' }];
const quelle = (teil: 'zahlbetrag' | 'pruefblatt' | 'massen'): Druckquelle => ({ braucht: BRAUCHT,
  tabellen: (hole, r) => freigabeTabellen(abrechnungAus(hole, r), r, hole('rechnungsmenge', 'rechnung', r.id))[teil] });
export const DRUCKQUELLEN: Record<string, Druckquelle> = { 'ava.zahlbetrag': quelle('zahlbetrag'), 'ava.pruefblatt': quelle('pruefblatt'), 'ava.massen': quelle('massen') };
