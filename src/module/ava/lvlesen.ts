// LV (oder Angebot) aus einer Datei lesen – wie im bisherigen Bauportal: aus den Wörtern mit ihrer Stelle (Dateidienst „/woerter“:
// PDF-Textebene, Texterkennung für Scans und Fotos, Word) werden Zeilen, aus den Zeilen Positionsblöcke. Ein Block beginnt mit einer
// Ordnungszahl links; darin stehen Kurztext, Langtext, Menge mit Einheit und – im Angebot – Einheits- und Gesamtpreis.
// Ein Block ohne Menge mit kurzem Text ist ein Titel. Kopf- und Fußzeilen, die auf vielen Seiten gleich stehen, Überträge und
// Summen fallen weg. Reine Rechnung (Browser und Server), nichts wird hier gespeichert; was übernommen wird, entscheidet der Mensch.
import { EXCEL_KOPF } from './lvexcel';

export type Wort = [number, number, number, number, string];   // x0, y0, x1, y1 als Anteil der Seite (oben links), Text
export interface Seite { bild: string | null; woerter: Wort[] }
export interface Zeile { seite: number; x0: number; y0: number; x1: number; y1: number; text: string; woerter: Wort[] }
export interface Vorschlag {
  art: 'titel' | 'normal'; oz: string; kurztext: string; langtext: string; menge: number | null; einheit: string; ep: number | null; gp: number | null;
  zeilen: number[];   // Nummern der Zeilen, aus denen er stammt (zum Zeigen im Dokument)
}

const OZ = /^(\d{1,4}(?:\.\d{1,5}){0,5})\.?$/;
const EINHEITEN = new Map(Object.entries({
  m: 'm', lfm: 'm', lfdm: 'm', 'lfd.m': 'm', m2: 'm²', 'm²': 'm²', qm: 'm²', m3: 'm³', 'm³': 'm³', cbm: 'm³', st: 'St', stk: 'St', 'stk.': 'St', stck: 'St', 'stück': 'St',
  psch: 'psch', 'psch.': 'psch', pauschal: 'psch', pa: 'psch', h: 'h', std: 'h', 'std.': 'h', kg: 'kg', t: 't', l: 'l', wo: 'Wo', tag: 'Tag', tage: 'Tag', mon: 'Mon', 'mt': 'Mon',
}));
const WEG = /^(übertrag|zwischensumme|summe|gesamtsumme|seite \d|seite$|uebertrag|gesamt netto|netto|mwst|umsatzsteuer|brutto)/i;

/** Zahl wie im Dokument geschrieben (1.234,56 · 12,5 · 120) – sonst null. */
export function zahlAus(t: string): number | null {
  const s = t.trim().replace(/[€]/g, '');
  if (!/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$|^-?\d+\.\d{1,3}$/.test(s)) return null;
  const n = /,/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}
const einheitAus = (t: string) => EINHEITEN.get(t.toLowerCase().replace(/[,;]$/, '')) ?? null;
const istPreis = (t: string) => /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(t.trim().replace('€', ''));

/** Wörter einer Seite zu Zeilen: was sich senkrecht überlappt, steht in einer Zeile – links nach rechts. */
export function zeilenAus(seiten: Seite[]): Zeile[] {
  const aus: Zeile[] = [];
  seiten.forEach((s, seite) => {
    const w = [...s.woerter].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    let jetzt: Wort[] = [], y0 = 0, y1 = 0;
    const fertig = () => {
      if (!jetzt.length) return;
      jetzt.sort((a, b) => a[0] - b[0]);
      aus.push({ seite, x0: Math.min(...jetzt.map((x) => x[0])), y0, x1: Math.max(...jetzt.map((x) => x[2])), y1, text: jetzt.map((x) => x[4]).join(' '), woerter: jetzt });
      jetzt = [];
    };
    for (const x of w) {
      const mitte = (x[1] + x[3]) / 2;
      if (jetzt.length && mitte >= y0 && mitte <= y1) { jetzt.push(x); y0 = Math.min(y0, x[1]); y1 = Math.max(y1, x[3]); continue; }
      fertig(); jetzt = [x]; y0 = x[1]; y1 = x[3];
    }
    fertig();
  });
  return aus;
}

/** Zeilen, die auf vielen Seiten gleich stehen (Kopf, Fuß), ohne Ziffern verglichen – sie zählen nicht zum Inhalt. */
function wiederholte(zeilen: Zeile[], seiten: number): Set<number> {
  if (seiten < 3) return new Set();
  const schluessel = (z: Zeile) => `${Math.round(z.y0 * 50)}|${z.text.replace(/\d+/g, '#').toLowerCase()}`;
  const je = new Map<string, Set<number>>();
  for (const z of zeilen) { const k = schluessel(z); je.set(k, (je.get(k) ?? new Set()).add(z.seite)); }
  const oft = new Set([...je].filter(([, s]) => s.size >= Math.max(3, seiten * 0.6)).map(([k]) => k));
  return new Set(zeilen.map((z, i) => (oft.has(schluessel(z)) ? i : -1)).filter((i) => i >= 0));
}

/** Wo die Ordnungszahlen stehen: der linke Rand der meisten Zeilen, die mit einer OZ beginnen. */
function ozSpalte(zeilen: Zeile[]): number {
  const x = zeilen.filter((z) => OZ.test(z.woerter[0]![4]) && z.woerter.length > 1).map((z) => z.woerter[0]![0]).sort((a, b) => a - b);
  return x.length ? x[Math.floor(x.length / 4)]! : 0.2;
}

/** Menge, Einheit und Preise aus den Wörtern eines Blocks (rechts von der Ordnungszahl). */
function zahlen(ws: Wort[]): { menge: number | null; einheit: string; ep: number | null; gp: number | null; weg: Set<Wort> } {
  const weg = new Set<Wort>();
  let menge: number | null = null, einheit = '';
  for (let i = 0; i < ws.length && menge === null; i++) {
    const t = ws[i]![4], n = zahlAus(t), e = ws[i + 1] ? einheitAus(ws[i + 1]![4]) : null;
    const zusammen = /^(\d[\d.,]*)([a-zA-Z²³.]+)$/.exec(t);   // „120,00m2“
    if (n !== null && e) { menge = n; einheit = e; weg.add(ws[i]!).add(ws[i + 1]!); }
    else if (zusammen && einheitAus(zusammen[2]!) && zahlAus(zusammen[1]!) !== null) { menge = zahlAus(zusammen[1]!); einheit = einheitAus(zusammen[2]!)!; weg.add(ws[i]!); }
  }
  // Preise: Beträge mit zwei Nachkommastellen rechts im Block – der vorletzte ist der EP, der letzte der GP
  const preise = ws.filter((w) => !weg.has(w) && istPreis(w[4]) && w[0] > 0.45);
  const ep = preise.length >= 2 ? zahlAus(preise[preise.length - 2]![4]) : preise.length === 1 ? zahlAus(preise[0]![4]) : null;
  const gp = preise.length >= 2 ? zahlAus(preise[preise.length - 1]![4]) : null;
  for (const p of preise.slice(-2)) weg.add(p);
  return { menge, einheit, ep, gp, weg };
}

/** Der Vorschlag: Titel und Positionen in der Reihenfolge des Dokuments. */
export function lvAusZeilen(alle: Zeile[], seiten: number): Vorschlag[] {
  const kopf = wiederholte(alle, seiten);
  const zeilen = alle.map((z, i) => ({ z, i })).filter(({ z, i }) => !kopf.has(i) && !WEG.test(z.text.trim()));
  const links = ozSpalte(zeilen.map((x) => x.z));
  const beginnt = (z: Zeile) => OZ.test(z.woerter[0]![4]) && Math.abs(z.woerter[0]![0] - links) < 0.08;
  const bloecke: { kopf: { z: Zeile; i: number }; rest: { z: Zeile; i: number }[] }[] = [];
  for (const x of zeilen) {
    if (beginnt(x.z)) bloecke.push({ kopf: x, rest: [] });
    else if (bloecke.length) bloecke[bloecke.length - 1]!.rest.push(x);
  }
  return bloecke.map(({ kopf, rest }): Vorschlag => {
    const oz = OZ.exec(kopf.z.woerter[0]![4])![1]!;
    const alleWoerter = [kopf.z.woerter.slice(1), ...rest.map((r) => r.z.woerter)].flat();
    const n = zahlen(alleWoerter);
    const text = (ws: Wort[]) => ws.filter((w) => !n.weg.has(w)).map((w) => w[4]).join(' ').replace(/\s+/g, ' ').trim();
    const ersteZeile = text(kopf.z.woerter.slice(1));
    const weitere = rest.map((r) => text(r.z.woerter)).filter(Boolean);
    const kurztext = (ersteZeile || weitere.shift() || '').slice(0, 250);
    const titel = n.menge === null && n.ep === null && weitere.length <= 1 && kurztext.length <= 120;
    return { art: titel ? 'titel' : 'normal', oz, kurztext, langtext: titel ? '' : weitere.join('\n'), menge: n.menge, einheit: n.einheit, ep: n.ep, gp: n.gp,
      zeilen: [kopf.i, ...rest.map((r) => r.i)] };
  }).filter((v) => v.kurztext);
}

/** Ebene eines Vorschlags aus der Ordnungszahl (1 = oberste); Positionen hängen am letzten Titel davor. */
export function gliederung(v: Vorschlag[]): { eltern: number | null; ebene: number }[] {
  const stapel: { i: number; teile: number }[] = [];
  return v.map((x, i) => {
    const teile = x.oz ? x.oz.split('.').length : 1;
    if (x.art === 'titel') {
      while (stapel.length && stapel[stapel.length - 1]!.teile >= teile) stapel.pop();
      const eltern = stapel[stapel.length - 1]?.i ?? null;
      stapel.push({ i, teile });
      return { eltern, ebene: stapel.length - 1 };
    }
    // eine Position gehört zum letzten Titel, dessen OZ der Anfang ihrer ist (sonst zum letzten Titel überhaupt)
    const passt = [...stapel].reverse().find((t) => x.oz.startsWith(`${v[t.i]!.oz}.`)) ?? stapel[stapel.length - 1];
    return { eltern: passt?.i ?? null, ebene: passt ? stapel.indexOf(passt) + 1 : 0 };
  });
}

/** Der Vorschlag als Tabelle wie beim Excel-Einlesen (module/ava/lvexcel.ts) – danach derselbe Weg: Vorschau, doppelte OZ, Übernehmen.
 *  mengen/preise: Menge bzw. EP (im LV als Schätzpreis, im Angebot als Preis der Bieter:in) mitnehmen. */
export function alsTabelle(v: Vorschlag[], o: { mengen: boolean; preise: boolean }): string[][] {
  const zahl = (n: number | null) => (n === null ? '' : n.toLocaleString('de-DE', { maximumFractionDigits: 3 }));
  return [EXCEL_KOPF.slice(0, 7), ...v.map((x) => x.art === 'titel' ? [x.oz, 'Titel', x.kurztext, '', '', '', '']
    : [x.oz, 'Normal', x.kurztext, x.langtext, o.mengen ? zahl(x.menge) : '', x.einheit, o.preise ? zahl(x.ep) : ''])];
}
