// Änderungssätze im Bauzeitenplan (wie bisher, ohne KI): „Malerarbeiten 5 Tage länger“, „Estrich auf 8 AT“, „Fliesen 1 Woche
// später“, „Maler nach Fliesen“, „Estrich 50 % fertig“. Die Leistung wird über ihren Namen gefunden (jedes Wort muss als
// Wortanfang vorkommen: „Maler“ → Malerarbeiten). Ergebnis: die Schritte als Vorschau (vorher → nachher) und die Befehle;
// ausgeführt wird erst nach Bestätigung, als ein Schritt im Rückgängig.
import type { Wert } from '../../kern/modell';
import type { Vorlage } from './bearbeiten';

export interface SatzV { id: string; name: string; dauer: number; fortschritt: number; gruppe: boolean; anfang: string /* ISO, wie gerechnet */; vorgaenger: string[] }
export interface SatzSchritt { id: string; name: string; vorher: string; nachher: string }
export type SatzErgebnis = { fehler: string } | { schritte: SatzSchritt[]; befehle: Vorlage[] };

const ZAHL: Record<string, number> = { ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, halbe: 0.5 };
const falten = (s: string) => s.toLowerCase().normalize('NFC').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const zahl = (s: string): number | null => { const k = s.toLowerCase(); if (k in ZAHL) return ZAHL[k]!; const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };
const N = '(\\d+(?:[.,]\\d+)?|ein|eine|einen|einem|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)';
const EINH = '(arbeitstage?n?|at|tage?n?|wochen?|wo)';
const AT = (n: number, e: string) => (/^wo/i.test(e) ? n * 5 : n);   // Woche = 5 Arbeitstage

const MUSTER: { re: RegExp; art: 'dauer+' | 'dauer=' | 'schieb' | 'pct' | 'nach'; f: (m: RegExpExecArray) => { wer: string; d?: number | null; p?: number | null; vor?: string } }[] = [
  { re: new RegExp(`^(.+?)\\s+(?:um\\s+)?${N}\\s*${EINH}\\s+(länger|kürzer|laenger|kuerzer)$`, 'i'), art: 'dauer+', f: (m) => ({ wer: m[1]!, d: zahl(m[2]!) === null ? null : AT(zahl(m[2]!)!, m[3]!) * (/^k/i.test(m[4]!) ? -1 : 1) }) },
  { re: new RegExp(`^(.+?)\\s+(?:dauert\\s+|auf\\s+|=\\s*)${N}\\s*${EINH}$`, 'i'), art: 'dauer=', f: (m) => ({ wer: m[1]!, d: zahl(m[2]!) === null ? null : AT(zahl(m[2]!)!, m[3]!) }) },
  { re: new RegExp(`^(.+?)\\s+(?:um\\s+)?${N}\\s*${EINH}\\s+(später|früher|spaeter|frueher)(?:\\s+(?:beginnen|anfangen|starten))?$`, 'i'), art: 'schieb', f: (m) => ({ wer: m[1]!, d: zahl(m[2]!) === null ? null : AT(zahl(m[2]!)!, m[3]!) * (/^f/i.test(m[4]!) ? -1 : 1) }) },
  { re: new RegExp(`^(.+?)\\s+(?:ist\\s+)?${N}\\s*(?:%|prozent)\\s*(?:fertig|erledigt|abgeschlossen)?$`, 'i'), art: 'pct', f: (m) => ({ wer: m[1]!, p: zahl(m[2]!) }) },
  { re: /^(.+?)\s+(?:ist\s+)?(?:fertig|erledigt|abgeschlossen)$/i, art: 'pct', f: (m) => ({ wer: m[1]!, p: 100 }) },
  { re: /^(.+?)\s+(?:erst\s+)?nach\s+(?:dem\s+|der\s+|den\s+)?(.+)$/i, art: 'nach', f: (m) => ({ wer: m[1]!, vor: m[2]! }) },
];

/** Klingt der Text wie ein Änderungssatz (und nicht wie eine Frage)? */
export const istAenderungssatz = (t: string): boolean =>
  new RegExp(`(länger|kürzer|laenger|kuerzer|später|früher|spaeter|frueher|%|prozent|fertig|\\bnach\\b|\\bauf\\s+${N}\\s*${EINH}|dauert)`, 'i').test(t) && !/^\s*(was|wie|wann|wo|wer|warum|welche)\b|\?\s*$/i.test(t);

function finden(v: SatzV[], wer: string): SatzV[] {
  const w0 = falten(wer).replace(/^(die|der|das|den|alle)\s+/, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean), w2 = w0.filter((w) => w.length > 1), w = w2.length ? w2 : w0;
  if (!w.length) return [];
  return v.filter((x) => !x.gruppe && w.every((t) => falten(x.name).split(/[^\p{L}\p{N}]+/u).some((y) => y.startsWith(t))));
}

/** Satz verstehen → Vorschau und Befehle (oder warum nicht). tag: Datum + n Arbeitstage (für „später/früher“). */
export function satzVerstehen(text: string, v: SatzV[], tag: (iso: string, n: number) => string, z: Record<string, Wert>, neu: () => string): SatzErgebnis | null {
  const s = text.trim().replace(/[.!]+$/, '');
  const datum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
  for (const M of MUSTER) {
    const m = M.re.exec(s); if (!m) continue;
    const a = M.f(m), T = finden(v, a.wer);
    if (!T.length) return { fehler: `Keine Leistung „${a.wer.trim()}“ im Plan gefunden.` };
    if (a.d === null || a.p === null) return { fehler: 'Die Zahl habe ich nicht verstanden.' };
    const schritte: SatzSchritt[] = [], befehle: Vorlage[] = [];
    const aendern = (x: SatzV, werte: Record<string, Wert>, vorher: string, nachher: string) => { schritte.push({ id: x.id, name: x.name, vorher, nachher }); befehle.push({ objekt: 'vorgang', art: 'aendern', objektId: x.id, werte }); };
    if (M.art === 'nach') {
      const V = finden(v, a.vor!); if (!V.length) return { fehler: `Keine Leistung „${a.vor!.trim()}“ im Plan gefunden.` };
      for (const t of T) for (const x of V) if (x.id !== t.id && !t.vorgaenger.includes(x.id)) {
        schritte.push({ id: t.id, name: t.name, vorher: '', nachher: `nach „${x.name}“` });
        befehle.push({ objekt: 'verknuepfung', art: 'anlegen', objektId: neu(), werte: { ...z, von: x.id, nach: t.id, art: 'ea', abstand: 0, von_abschnitt: null, nach_abschnitt: null, kennung: '' } });
      }
      if (!schritte.length) return { fehler: 'Diese Reihenfolge steht schon im Plan.' };
    } else for (const t of T) {
      if (M.art === 'dauer+' || M.art === 'dauer=') { const n = Math.max(1, Math.round(M.art === 'dauer+' ? t.dauer + a.d! : a.d!)); if (n !== t.dauer) aendern(t, { dauer: n }, `${t.dauer} AT`, `${n} AT`); }
      if (M.art === 'pct') { const p = Math.max(0, Math.min(100, Math.round(a.p!))); if (p !== t.fortschritt) aendern(t, { fortschritt: p }, `${t.fortschritt} %`, `${p} %`); }
      if (M.art === 'schieb' && t.anfang) { const neuAb = tag(t.anfang, a.d!); aendern(t, { anfang_nicht_vor: neuAb }, datum(t.anfang), `ab ${datum(neuAb)}`); }
    }
    if (!schritte.length) return { fehler: 'Das steht schon so im Plan – nichts zu ändern.' };
    return { schritte, befehle };
  }
  return null;
}
