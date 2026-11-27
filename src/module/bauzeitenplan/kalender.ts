// Arbeitskalender des Bauzeitenplans: Arbeitswoche (5, 6 oder 7 Tage), gesetzliche Feiertage bundesweit oder je
// Bundesland, eigene freie Tage (auch jährlich wiederkehrend). Gerechnet wird in Arbeitstagen; ein Datum ist eine
// Tagnummer (Tage seit 1.1.1970, UTC), damit Sommerzeit und Uhrzeit nie eine Rolle spielen.

export const BUNDESLAENDER: { wert: string; titel: string }[] = [
  { wert: 'KEINE', titel: 'keine Feiertage' }, { wert: 'DE', titel: 'nur bundesweite Feiertage' },
  { wert: 'BW', titel: 'Baden-Württemberg' }, { wert: 'BY', titel: 'Bayern' }, { wert: 'BE', titel: 'Berlin' }, { wert: 'BB', titel: 'Brandenburg' },
  { wert: 'HB', titel: 'Bremen' }, { wert: 'HH', titel: 'Hamburg' }, { wert: 'HE', titel: 'Hessen' }, { wert: 'MV', titel: 'Mecklenburg-Vorpommern' },
  { wert: 'NI', titel: 'Niedersachsen' }, { wert: 'NW', titel: 'Nordrhein-Westfalen' }, { wert: 'RP', titel: 'Rheinland-Pfalz' }, { wert: 'SL', titel: 'Saarland' },
  { wert: 'SN', titel: 'Sachsen' }, { wert: 'ST', titel: 'Sachsen-Anhalt' }, { wert: 'SH', titel: 'Schleswig-Holstein' }, { wert: 'TH', titel: 'Thüringen' },
];

const TAG = 86400000;
export const tagAus = (iso: string): number => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / TAG);
export const isoAus = (tag: number): string => new Date(tag * TAG).toISOString().slice(0, 10);
export const wochentag = (tag: number): number => (new Date(tag * TAG).getUTCDay() + 6) % 7;   // 0 = Montag … 6 = Sonntag
const tagVon = (j: number, m: number, t: number) => Math.floor(Date.UTC(j, m - 1, t) / TAG);

/** Ostersonntag (gregorianisch, Rechnung nach Gauß in der Fassung von Meeus/Jones/Butcher). */
export function ostern(j: number): number {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return tagVon(j, monat, tag);
}

/** Gesetzliche Feiertage eines Jahres: Tagnummer → Name. „DE“ = nur die bundesweiten. */
export function feiertage(j: number, land: string): Map<number, string> {
  const o = ostern(j), f = new Map<number, string>();
  if (land === 'KEINE') return f;   // wie bisher wählbar: ohne Feiertage (z. B. Baustelle im Ausland)
  const in_ = (...l: string[]) => l.includes(land);
  f.set(tagVon(j, 1, 1), 'Neujahr');
  if (in_('BW', 'BY', 'ST')) f.set(tagVon(j, 1, 6), 'Heilige Drei Könige');
  if ((in_('BE') && j >= 2019) || (in_('MV') && j >= 2023)) f.set(tagVon(j, 3, 8), 'Internationaler Frauentag');
  f.set(o - 2, 'Karfreitag');
  if (in_('BB')) f.set(o, 'Ostersonntag');
  f.set(o + 1, 'Ostermontag');
  f.set(tagVon(j, 5, 1), 'Tag der Arbeit');
  f.set(o + 39, 'Christi Himmelfahrt');
  if (in_('BB')) f.set(o + 49, 'Pfingstsonntag');
  f.set(o + 50, 'Pfingstmontag');
  if (in_('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) f.set(o + 60, 'Fronleichnam');
  if (in_('SL')) f.set(tagVon(j, 8, 15), 'Mariä Himmelfahrt');   // in Bayern nur in einem Teil der Gemeinden – dort als eigener freier Tag
  if (in_('TH') && j >= 2019) f.set(tagVon(j, 9, 20), 'Weltkindertag');
  f.set(tagVon(j, 10, 3), 'Tag der Deutschen Einheit');
  if (in_('BB', 'MV', 'SN', 'ST', 'TH') || (in_('HB', 'HH', 'NI', 'SH') && j >= 2018)) f.set(tagVon(j, 10, 31), 'Reformationstag');
  if (in_('BW', 'BY', 'NW', 'RP', 'SL')) f.set(tagVon(j, 11, 1), 'Allerheiligen');
  if (in_('SN')) { const t = tagVon(j, 11, 22); f.set(t - ((wochentag(t) - 2 + 7) % 7), 'Buß- und Bettag'); }   // Mittwoch vor dem 23.11.
  f.set(tagVon(j, 12, 25), '1. Weihnachtstag');
  f.set(tagVon(j, 12, 26), '2. Weihnachtstag');
  return f;
}

export interface FreierTag { von: string; bis?: string | null; name?: string; jaehrlich?: boolean }
export interface Kalendervorgabe { anfang: string; arbeitswoche?: number; land?: string; frei?: FreierTag[] }

/**
 * Der Kalender eines Plans: Arbeitstage ab einem Stück vor dem Projektanfang bis weit danach.
 * Arbeitstag 0 ist der erste Arbeitstag am oder nach dem Projektanfang; davor gibt es negative Nummern.
 */
export class Kalender {
  readonly start: number;      // Tagnummer des Arbeitstags 0
  private readonly tage: number[] = [];   // Arbeitstag-Nummer + VOR → Tagnummer
  private readonly index = new Map<number, number>();
  private readonly freiName = new Map<number, string>();
  private static readonly VOR = 400;
  readonly woche: number;

  constructor(v: Kalendervorgabe) {
    this.woche = [5, 6, 7].includes(Number(v.arbeitswoche)) ? Number(v.arbeitswoche) : 5;
    const anfang = tagAus(v.anfang);
    const von = anfang - 800, bis = anfang + 365 * 12;
    const j0 = Number(isoAus(von).slice(0, 4)), j1 = Number(isoAus(bis).slice(0, 4));
    for (let j = j0; j <= j1; j++) for (const [t, n] of feiertage(j, v.land || 'DE')) this.freiName.set(t, n);
    for (const f of v.frei ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(f.von ?? '')) continue;
      const bis = f.bis && /^\d{4}-\d{2}-\d{2}/.test(f.bis) && f.bis >= f.von ? f.bis : f.von;
      const jv = Number(f.von.slice(0, 4)), ueber = Number(bis.slice(0, 4)) - jv;   // z. B. 24.12.–01.01.: über den Jahreswechsel
      for (const j of f.jaehrlich ? [...Array(j1 - j0 + 2).keys()].map((k) => j0 - 1 + k) : [jv]) {
        const a = tagAus(`${j}${f.von.slice(4)}`), e = tagAus(`${j + ueber}${bis.slice(4)}`);
        for (let t = a; t <= e; t++) if (!this.freiName.has(t)) this.freiName.set(t, f.name || 'frei');
      }
    }
    let w = 0;
    for (let t = anfang; t <= bis; t++) if (this.arbeit(t)) { this.index.set(t, w); this.tage.push(t); w++; }
    const davor: number[] = [];
    for (let t = anfang - 1; t >= von && davor.length < Kalender.VOR; t--) if (this.arbeit(t)) davor.unshift(t);
    davor.forEach((t, i) => this.index.set(t, i - davor.length));
    this.tage.unshift(...davor);
    this.vor = davor.length;
    this.start = this.tage[this.vor]!;
  }
  private readonly vor: number;
  /** Ist der Tag ein Arbeitstag? */
  arbeit(t: number): boolean { return wochentag(t) < this.woche && !this.freiName.has(t); }
  /** Warum der Tag frei ist (Feiertag, eigener freier Tag) – leer an Wochenenden und Arbeitstagen. */
  frei(t: number): string { return wochentag(t) < this.woche ? this.freiName.get(t) ?? '' : ''; }
  /** Tagnummer eines Arbeitstags. */
  tag(w: number): number {
    const i = w + this.vor;
    if (i >= 0 && i < this.tage.length) return this.tage[i]!;
    const letzter = this.tage[this.tage.length - 1]!;   // außerhalb: grob mit Wochenrhythmus weiterzählen
    return i < 0 ? this.tage[0]! + Math.floor((i * 7) / this.woche) : letzter + Math.ceil(((i - this.tage.length + 1) * 7) / this.woche);
  }
  /** Arbeitstag am oder nach einer Tagnummer. */
  arbeitstag(t: number): number {
    for (let x = t; x < t + 60; x++) { const w = this.index.get(x); if (w !== undefined) return w; }
    return t < this.tage[0]! ? -this.vor : this.tage.length - this.vor;
  }
  /** Erster Tag eines Vorgangs, der bei Arbeitstag s beginnt; letzter Tag eines Vorgangs, der vor Arbeitstag f endet. */
  anfangsdatum(s: number): string { return isoAus(this.tag(s)); }
  endedatum(s: number, f: number): string { return isoAus(this.tag(f > s ? f - 1 : s)); }
}

/** „16.11.2026“, „16.11.26“, „16.11.“ oder ISO → ISO; null, wenn nicht lesbar. */
export function datumLesen(t: string): string | null {
  const s = t.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(s);
  if (!m) return null;
  const j = !m[3] ? new Date().getFullYear() : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${j}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isoAus(tagAus(iso)) === iso ? iso : null;
}

// ---------- Anzeige (Balkenplan, Gewerke & Firmen – eine Stelle) ----------
export const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
/** „16.11.26“ */
export const kurz = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '');
/** „Mo 16.11.26“ */
export const tagname = (iso: string) => (iso ? `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][wochentag(tagAus(iso))]} ${kurz(iso)}` : '');
