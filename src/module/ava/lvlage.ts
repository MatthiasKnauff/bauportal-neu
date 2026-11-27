// Überblick eines LV (wie bisher „Details“ rechts): wie weit es ist (Ausschreibung → Vergabe → Auftrag → Abrechnung),
// was es enthält und was gelb sein muss – nur, wenn etwas fehlt oder eine Frist naht.
import type { Werte } from '../../kern/modell';
import { zaehlt } from './rechnung';

type E = { id: string; werte: Werte };
export const STUFEN = ['Ausschreibung', 'Vergabe', 'Auftrag', 'Abrechnung'] as const;

export interface LvLage {
  stufe: number;                       // 0–3, Index in STUFEN
  positionen: number; bedarf: number; wahl: number; titel: number; vorbemerkungen: number;
  angeschrieben: number; angebote: number;
  warnungen: string[];
}

const tage = (von: string, bis: string) => Math.round((Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10)) - Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10))) / 864e5);
const tag = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function lvLage(lv: Werte, positionen: E[], angebote: E[], o: { vergeben: boolean; abgerechnet: number; heute: string; hatAngebot?: (a: E) => boolean }): LvLage {
  const da = o.hatAngebot ?? ((a: E) => !!a.werte.eingang);
  const P = positionen.filter((q) => q.werte.art !== 'titel' && !q.werte.nachtrag);
  const art = (a: string) => P.filter((q) => q.werte.art === a).length;
  const stufe = o.abgerechnet > 0 || lv.status === 'abgerechnet' ? 3 : o.vergeben ? 2 : angebote.some(da) ? 1 : 0;
  const warnungen: string[] = [];
  const ab = String(lv.abgabe ?? '');
  if (!o.vergeben && /^\d{4}-\d\d-\d\d/.test(ab)) {
    const t = tage(o.heute, ab), ohne = angebote.filter((a) => a.werte.angeschrieben && (a.werte.rueckmeldung ?? 'offen') === 'offen' && !da(a)).length;
    if (t >= 0 && t <= 14) warnungen.push(`Abgabe am ${tag(ab)}${ohne ? ` · ${ohne} ohne Rückmeldung` : ''}`);
  }
  const ohnePreis = P.filter((q) => zaehlt(q) && q.werte.art !== 'zuschlag' && (q.werte.ep == null || q.werte.ep === '')).length;
  if (ohnePreis && !o.vergeben) warnungen.push(`${ohnePreis} ${ohnePreis === 1 ? 'Position' : 'Positionen'} ohne Preis`);
  return {
    stufe, positionen: P.filter((q) => q.werte.art !== 'hinweis' && q.werte.art !== 'vorbemerkung').length, bedarf: art('bedarf'), wahl: art('alternativ'),
    titel: positionen.filter((q) => q.werte.art === 'titel' && !q.werte.nachtrag).length, vorbemerkungen: art('vorbemerkung') + (String(lv.vorbemerkungen ?? '').trim() ? 1 : 0),
    angeschrieben: angebote.filter((a) => a.werte.angeschrieben).length, angebote: angebote.filter(da).length, warnungen,
  };
}
