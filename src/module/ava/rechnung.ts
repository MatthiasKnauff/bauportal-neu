// Ausschreibung: Summen und Wertung – reine Rechnung, im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { nachOz } from '../../kern/oz';
export { nachOz, ozVergleich } from '../../kern/oz';

type E = { id: string; werte: Werte };
/** Positionen, die in die Summe eingehen: Bedarfs- und Alternativpositionen nicht (sie stehen nur mit EP im LV), Titel und Hinweise ohnehin nicht. */
export const zaehlt = (p: E) => ['normal', 'pauschal', 'stundenlohn', ''].includes(String(p.werte.art ?? ''));
export const zahl = (w: unknown): number => (typeof w === 'number' ? w : Number(String(w ?? '').replace(/\./g, '').replace(',', '.')) || 0);
export const gp = (menge: unknown, ep: unknown) => Math.round(zahl(menge) * zahl(ep) * 100) / 100;

/** OZ für eine neue Position: hinter der letzten Position des LV, in Zehnerschritten mit gleicher Stellenzahl (01.0030 → 01.0040). */
export function naechsteOz(positionen: E[]): string {
  const letzte = nachOz(positionen.filter((p) => p.werte.oz)).at(-1);
  if (!letzte) return '01.0010';
  const teile = String(letzte.werte.oz).split('.');
  if (letzte.werte.art === 'titel') return `${teile.join('.')}.${'0010'}`;
  const ende = teile.pop()!, n = Number(ende);
  return Number.isNaN(n) ? '' : [...teile, String(n + 10).padStart(ende.length, '0')].join('.');
}

/** Summe eines LV mit den geschätzten Preisen. */
export const summeGeschaetzt = (positionen: E[]) => Math.round(positionen.filter(zaehlt).reduce((s, p) => s + gp(p.werte.menge, p.werte.ep), 0) * 100) / 100;

export interface Wertung { angebot: string; netto: number; nachLass: number; fehlend: number; rang: number | null }
/**
 * Preisspiegel: je Angebot die Summe (Menge × EP der Bieter:in), nach Nachlass, wie viele Preise fehlen – und der Rang
 * (nur gewertete Angebote, die günstigste Summe nach Nachlass zuerst).
 */
export function wertung(positionen: E[], angebote: E[], preis: (angebot: string, position: string) => number | null): Wertung[] {
  const zaehlende = positionen.filter(zaehlt);
  const w = angebote.map((a) => {
    let netto = 0, fehlend = 0;
    for (const p of zaehlende) { const ep = preis(a.id, p.id); if (ep == null) fehlend++; else netto += gp(p.werte.menge, ep); }
    netto = Math.round(netto * 100) / 100;
    // Nachlass in % und/oder als fester Betrag € (wie bisher) – erst %, dann €
    return { angebot: a.id, netto, nachLass: Math.round((netto * (1 - zahl(a.werte.nachlass) / 100) - zahl(a.werte.nachlass_eur)) * 100) / 100, fehlend, rang: null as number | null, aus: a.werte.ausgeschlossen === true };
  });
  [...w].filter((x) => !x.aus && x.netto > 0).sort((a, b) => a.nachLass - b.nachLass).forEach((x, i) => { x.rang = i + 1; });
  return w.map(({ aus: _aus, ...x }) => x);
}

/** Je Position der günstigste Preis unter den gewerteten Angeboten (für die Markierung im Preisspiegel). */
export function guenstigster(positionen: E[], angebote: E[], preis: (angebot: string, position: string) => number | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of positionen) for (const a of angebote.filter((x) => x.werte.ausgeschlossen !== true)) {
    const ep = preis(a.id, p.id);
    if (ep != null && ep > 0 && (!m.has(p.id) || ep < m.get(p.id)!)) m.set(p.id, ep);
  }
  return m;
}

// ---------- Rechnungen: die Rechenleiter (wie im bisherigen Bauportal, Variante B – so rechnet die VOB/B) ----------
export const UST = 0.19;
export const BAUABZUG = 0.15;
export interface Leiterzeile { titel: string; betrag: number; summe?: boolean; hinweis?: boolean }
/** Was im LV (Vertragsbedingungen) und im Auftrag (Nachlass, Skonto) für die Rechnungen gilt. */
export interface Bedingungen {
  nachlass: number; skonto?: number; skontoTage?: number;
  ve?: number; veForm?: string; ma?: number; maForm?: string;   // Sicherheiten in % (ohne Angabe: 5 % bzw. wie Vertragserfüllung)
  veAbgeloest?: boolean; maAbgeloest?: boolean;                  // Bürgschaft eingegangen: kein Einbehalt (vorher schon)
  abnahme?: string; gewaehrleistungJahre?: number;
  bauabzug?: boolean; freistellungBis?: string;
  strafe?: number; strafeMax?: number; strafeTagart?: string; fertigstellung?: string;
}
/** Die Bedingungen aus den Werten von LV und beauftragtem Angebot. */
export const bedingungenAus = (lv: Werte = {}, auftrag: Werte = {}): Bedingungen => ({
  nachlass: zahl(auftrag.nachlass), skonto: zahl(auftrag.skonto), skontoTage: zahl(auftrag.skonto_tage),
  ve: lv.ve_prozent == null || lv.ve_prozent === '' ? undefined : zahl(lv.ve_prozent), veForm: String(lv.ve_form ?? 'einbehalt'),
  ma: lv.ma_prozent == null || lv.ma_prozent === '' ? undefined : zahl(lv.ma_prozent), maForm: String(lv.ma_form ?? 'einbehalt'),
  veAbgeloest: lv.ve_form === 'buergschaft' && !!lv.ve_eingang, maAbgeloest: lv.ma_form === 'buergschaft' && !!lv.ma_eingang,
  abnahme: String(lv.abnahme ?? ''), gewaehrleistungJahre: lv.gewaehrleistung_jahre == null || lv.gewaehrleistung_jahre === '' ? 4 : zahl(lv.gewaehrleistung_jahre),
  bauabzug: lv.bauabzug === true, freistellungBis: String(lv.freistellung_bis ?? ''),
  strafe: zahl(lv.strafe_prozent), strafeMax: zahl(lv.strafe_max), strafeTagart: String(lv.strafe_tagart ?? 'wt'), fertigstellung: String(lv.ausfuehrung_ende ?? ''),
});
const prozent = (x: number) => String(x).replace('.', ',');
/** Satz der Sicherheit für diese Rechnung: in der Schlussrechnung Mängelansprüche, sonst Vertragserfüllung; ist die Bürgschaft
 *  eingegangen, kein Einbehalt (bis dahin wird einbehalten); von Hand eingetragen geht vor. */
function sicherheit(r: E, b: Bedingungen): { satz: number; titel: string } {
  const schluss = r.werte.art === 'schluss', ve = b.ve ?? 5, ma = b.ma ?? ve;
  const titel = schluss ? 'Sicherheit Mängelansprüche' : 'Sicherheit Vertragserfüllung';
  if (r.werte.einbehalt != null && r.werte.einbehalt !== '') return { satz: zahl(r.werte.einbehalt), titel };
  if (r.werte.art === 'stundenlohn') return { satz: 0, titel };
  return { satz: schluss ? (b.maAbgeloest ? 0 : ma) : (b.veAbgeloest ? 0 : ve), titel };
}
const tageNach = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Netto: Leistungsstand (kumuliert, geprüft sonst angefordert) − Nachlass − Sicherheitseinbehalt − bisherige Zahlungen = Zahlbetrag netto;
 * dann die Umsatzsteuer; brutto danach: Vertragsstrafe (Schlussrechnung), Bauabzugsteuer 15 % (ans Finanzamt, ohne gültige
 * Freistellungsbescheinigung) = Auszahlung. Bisherige Zahlungen: die Zahlbeträge der früheren Rechnungen derselben Folge
 * (Abschlags- und Schlussrechnungen bzw. Nachträge; Stundenlohnrechnungen einzeln). Skonto steht als Hinweis darunter.
 */
/** Rechenleiter einer Rechnung. stand: Leistungsstand netto einer offenen Rechnung, wie ihn die Prüfung gerade ergibt (Aufmaß ×
 *  EP, Zeilen von Hand) – ohne: geprüft, sonst angefordert. Ein frei festgesetzter Zahlbetrag (mit Begründung) ersetzt den
 *  rechnerischen und zählt so auch als „bisher“ für die nächste Rechnung. */
export function leiter(rechnungen: E[], id: string, bedingungen: Bedingungen | number, stand?: (r: E) => number | null): Leiterzeile[] {
  const b: Bedingungen = typeof bedingungen === 'number' ? { nachlass: bedingungen } : bedingungen;
  const reihe = [...rechnungen].sort((x, y) => String(x.werte.datum ?? '').localeCompare(String(y.werte.datum ?? '')) || (x.id < y.id ? -1 : 1));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const vorher: Record<string, number> = {};
  for (const r of reihe) {
    const folge = r.werte.art === 'nachtrag' ? 'n' : r.werte.art === 'stundenlohn' ? '' : 'h';
    const live = stand && r.werte.status !== 'geprueft' && r.werte.status !== 'bezahlt' ? stand(r) : null;
    const st = live ?? zahl(r.werte.geprueft ?? r.werte.betrag);
    const nachlass = r2(st * b.nachlass / 100), netto = r2(st - nachlass);
    const si = sicherheit(r, b), einbehalt = r2(netto * si.satz / 100), anerkannt = r2(netto - einbehalt);
    const bisher = folge ? (vorher[folge] ?? 0) : 0, rechnerisch = r2(anerkannt - bisher);
    const hand = r.werte.zahlbetrag_hand != null && r.werte.zahlbetrag_hand !== '' ? r2(zahl(r.werte.zahlbetrag_hand)) : null;
    const zahlNetto = hand ?? rechnerisch, ust = r2(zahlNetto * UST), brutto = r2(zahlNetto + ust);
    const strafe = r.werte.art === 'schluss' ? zahl(r.werte.strafe) : 0;
    const nachStrafe = r2(brutto - strafe);
    const datum = String(r.werte.datum ?? r.werte.eingang ?? '');
    const bau = b.bauabzug && !(b.freistellungBis && b.freistellungBis >= (datum || '0000')) && nachStrafe > 0 ? r2(nachStrafe * BAUABZUG) : 0;
    const auszahlung = r2(nachStrafe - bau);
    const skontoBetrag = b.skonto && auszahlung > 0 ? r2(auszahlung * b.skonto / 100) : 0;
    if (r.id !== id) {
      // gezahlt (brutto) weniger als freigegeben (Skonto gilt als bezahlt): der Rest zählt nicht als „bisher“ – die nächste Rechnung holt ihn nach
      const gz = r.werte.gezahlt == null || r.werte.gezahlt === '' ? null : zahl(r.werte.gezahlt);
      const fehlt = gz == null ? 0 : Math.max(0, auszahlung - skontoBetrag - gz);
      const fehltNetto = fehlt > 0.005 ? r2(fehlt / ((1 + UST) * (bau ? 1 - BAUABZUG : 1))) : 0;
      if (folge) vorher[folge] = r2(bisher + zahlNetto - fehltNetto);
      continue;
    }
    const z: Leiterzeile[] = [
      { titel: `Leistungsstand netto${live != null ? ' (Prüfung)' : r.werte.geprueft != null && r.werte.geprueft !== '' ? ' (geprüft)' : ' (angefordert)'}`, betrag: st },
      ...(nachlass ? [{ titel: `− Nachlass ${prozent(b.nachlass)} %`, betrag: -nachlass }, { titel: 'netto nach Nachlass', betrag: netto, summe: true }] : []),
      ...(einbehalt ? [{ titel: `− ${si.titel} ${prozent(si.satz)} % (Einbehalt)`, betrag: -einbehalt }, { titel: 'anerkannt netto', betrag: anerkannt, summe: true }] : []),
      ...(bisher ? [{ titel: '− bisherige Zahlungen netto', betrag: -bisher }] : []),
      ...(hand != null ? [{ titel: 'Zahlbetrag netto rechnerisch', betrag: rechnerisch, hinweis: true },
        { titel: `Zahlbetrag netto frei festgesetzt${r.werte.hand_grund ? ` – ${String(r.werte.hand_grund)}` : ' (Begründung fehlt)'}`, betrag: hand, summe: true }]
        : [{ titel: 'Zahlbetrag netto', betrag: zahlNetto, summe: true }]),
      { titel: `+ Umsatzsteuer ${UST * 100} %`, betrag: ust }, { titel: 'Zahlbetrag', betrag: brutto, summe: true },
      ...(strafe ? [{ titel: '− Vertragsstrafe', betrag: -strafe }] : []),
      ...(bau ? [{ titel: '− Bauabzugsteuer 15 % (ans Finanzamt)', betrag: -bau }] : []),
      ...(strafe || bau ? [{ titel: 'Auszahlung an die Firma', betrag: auszahlung, summe: true }] : []),
    ];
    if (skontoBetrag) {
      const sk = skontoBetrag, eingang = String(r.werte.eingang ?? '');
      z.push({ titel: `bei Zahlung ${b.skontoTage ? (eingang ? `bis ${tageNach(eingang, b.skontoTage).split('-').reverse().join('.')}` : `binnen ${b.skontoTage} Tagen`) : 'mit Skonto'}: − ${prozent(b.skonto ?? 0)} % Skonto`, betrag: -sk, hinweis: true },
        { titel: 'Auszahlung mit Skonto', betrag: r2(auszahlung - sk), summe: true, hinweis: true });
    }
    if (r.werte.gezahlt != null && r.werte.gezahlt !== '') z.push({ titel: `gezahlt${r.werte.bezahlt_am ? ` am ${String(r.werte.bezahlt_am).split('-').reverse().join('.')}` : ''}`, betrag: zahl(r.werte.gezahlt), hinweis: true });
    return z;
  }
  return [];
}

/** Ende der Verjährungsfrist für Mängelansprüche: Abnahme + Jahre (leer ohne Abnahme). */
export function gewaehrleistungBis(b: Bedingungen): string {
  if (!b.abnahme) return '';
  const d = new Date(`${b.abnahme}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + (b.gewaehrleistungJahre ?? 4));
  return d.toISOString().slice(0, 10);
}

/** Vertragsstrafe vorschlagen (Schlussrechnung): Tage zwischen vertraglicher Fertigstellung und Abnahme × Satz der Abrechnungssumme netto, höchstens die Obergrenze. */
export function strafeVorschlag(b: Bedingungen, abrechnungNetto: number, abnahme: string): { tage: number; betrag: number } | null {
  if (!b.strafe || !b.fertigstellung || !abnahme || abnahme <= b.fertigstellung) return null;
  const proWoche = b.strafeTagart === 'kt' ? 7 : b.strafeTagart === 'at' ? 5 : 6;
  let tage = 0;
  for (let d = tageNach(b.fertigstellung, 1); d <= abnahme; d = tageNach(d, 1)) { const wt = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; if (wt < proWoche) tage++; }
  let betrag = abrechnungNetto * b.strafe / 100 * tage;
  if (b.strafeMax) betrag = Math.min(betrag, abrechnungNetto * b.strafeMax / 100);
  return { tage, betrag: Math.round(betrag * 100) / 100 };
}

/** Text der Vertragsbedingungen für Protokoll und Bauvertrag – aus denselben Zahlen, kein zweites Textfeld. */
export function vertragsbedingungenText(lv: Werte = {}): Record<string, string> {
  const b = bedingungenAus(lv), aus: Record<string, string> = {};
  const tag = ({ kt: 'Kalendertag', at: 'Arbeitstag' } as Record<string, string>)[b.strafeTagart ?? ''] ?? 'Werktag';
  if (lv.vertragsart) aus.vertragsgrundlage = lv.vertragsart === 'bgb' ? 'BGB-Bauvertrag (§§ 650a ff. BGB)' : 'VOB/B (Fassung 2016)';
  if (lv.strafe_prozent != null && lv.strafe_prozent !== '') aus.vertragsstrafe = b.strafe ? `${prozent(b.strafe)} % der Abrechnungssumme netto je ${tag} Verzug${b.strafeMax ? `, höchstens ${prozent(b.strafeMax)} %` : ''}` : 'keine';
  if (lv.ve_prozent != null && lv.ve_prozent !== '') aus.erfuellung = b.ve ? `${prozent(b.ve)} % ${b.veForm === 'buergschaft' ? 'als Bürgschaft' : 'Einbehalt von jeder Abschlagszahlung'}` : 'entfällt';
  if (lv.gewaehrleistung_jahre != null && lv.gewaehrleistung_jahre !== '') aus.gewaehrleistung = `${String(lv.gewaehrleistung_jahre)} Jahre ab Abnahme`;
  if (lv.ma_prozent != null && lv.ma_prozent !== '') aus.einbehalt = b.ma ? `${prozent(b.ma)} % der Bruttoabrechnungssumme${b.maForm === 'buergschaft' ? ' als Bürgschaft' : ', ablösbar gegen Bürgschaft'}` : 'keiner';
  return aus;
}

// ---------- Aufträge und Nachträge ----------
/** Position der Ausschreibung (nicht Teil eines Nachtrags) – nur sie stehen im Preisspiegel und in der GAEB-Ausgabe. */
export const ausgeschrieben = (p: E) => !p.werte.nachtrag;
/** Stände, die in die Prognose eingehen: beauftragt sicher, angemeldet bis geprüft als offen; abgelehnt nicht. */
export const NACHTRAG_OFFEN = ['angemeldet', 'angeboten', 'geprueft', ''];
/** Betrag eines Nachtrags netto vor Nachlass: Menge × EP seiner Positionen – ohne Positionen der eingetragene Betrag (Pauschale). */
export function nachtragNetto(nachtrag: E, positionen: E[]): number {
  const eigene = positionen.filter((p) => p.werte.nachtrag === nachtrag.id && zaehlt(p));
  return eigene.length ? Math.round(eigene.reduce((s, p) => s + gp(p.werte.menge, p.werte.ep), 0) * 100) / 100 : zahl(nachtrag.werte.betrag);
}
export interface Auftragsstand { auftrag: number; beauftragt: number; offen: number; aktuell: number; prognose: number }
/** Hauptauftrag (nach Nachlass) und Nachträge (Nachlass des Auftrags gilt auch für sie): aktuell = Auftrag + beauftragte, Prognose = dazu die offenen. */
export function auftragsstand(auftragNachLass: number, nachtraege: E[], positionen: E[], nachlassProzent: number): Auftragsstand {
  const r2 = (x: number) => Math.round(x * 100) / 100, f = 1 - nachlassProzent / 100;
  let beauftragt = 0, offen = 0;
  for (const n of nachtraege) {
    const b = nachtragNetto(n, positionen) * f, st = String(n.werte.stand ?? '');
    if (st === 'beauftragt') beauftragt += b; else if (NACHTRAG_OFFEN.includes(st)) offen += b;
  }
  beauftragt = r2(beauftragt); offen = r2(offen);
  return { auftrag: auftragNachLass, beauftragt, offen, aktuell: r2(auftragNachLass + beauftragt), prognose: r2(auftragNachLass + beauftragt + offen) };
}
/** Nächste Nachtrags-Nr.: N1, N2 … */
export const naechsterNachtrag = (nachtraege: E[]) => `N${Math.max(0, ...nachtraege.map((n) => Number(/^N(\d+)$/i.exec(String(n.werte.nummer ?? ''))?.[1] ?? 0))) + 1}`;

// ---------- Versand & Rücklauf ----------
export type Ruecklauf = 'abgegeben' | 'will_abgeben' | 'gibt_nicht_ab' | 'offen';
/** Stand einer Bieter:in: abgegeben, sobald das Angebot eingegangen ist – sonst ihre Rückmeldung, sonst offen. */
export const ruecklaufVon = (a: E): Ruecklauf => (a.werte.eingang ? 'abgegeben' : a.werte.rueckmeldung === 'will_abgeben' || a.werte.rueckmeldung === 'gibt_nicht_ab' ? a.werte.rueckmeldung : 'offen');
export function ruecklaufZaehlen(angebote: E[]): Record<Ruecklauf, number> & { angeschrieben: number } {
  const z = { abgegeben: 0, will_abgeben: 0, gibt_nicht_ab: 0, offen: 0, angeschrieben: angebote.filter((a) => a.werte.angeschrieben).length };
  for (const a of angebote) z[ruecklaufVon(a)]++;
  return z;
}
/** Nachfassen fällig: Anruf geplant bis heute, noch nichts abgegeben und nicht abgesagt. */
export const nachfassenFaellig = (a: E, heute: string) => !!a.werte.nachfassen && String(a.werte.nachfassen) <= heute && ['offen', 'will_abgeben'].includes(ruecklaufVon(a));
