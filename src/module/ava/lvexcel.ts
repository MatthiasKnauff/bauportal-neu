// LV als Excel-Tabelle (wie im bisherigen Bauportal: Export und Einlesen neben GAEB). Eine Zeile je Titel bzw. Position mit
// OZ, Art, Kurztext, Langtext, Menge, Einheit, EP; Titel erkennt das Einlesen an der Art „Titel“ oder an fehlender Menge und Einheit.
// Reine Rechnung – im Browser und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { mengeLesen, ozSchluessel } from './aufmasslesen';
import { gp, nachOz, zaehlt, zahl } from './rechnung';
import { istHinweis, istText } from '../../kern/lvarten';

type E = { id: string; werte: Werte };
const ART: Record<string, string> = { titel: 'Titel', normal: 'Normal', bedarf: 'Bedarf', alternativ: 'Wahl', pauschal: 'Pauschal', stundenlohn: 'Stundenlohn', hinweis: 'Hinweis', vorbemerkung: 'Vorbemerkung' };
const ART_AUS = Object.fromEntries(Object.entries(ART).map(([k, t]) => [t.toLowerCase(), k])) as Record<string, string>;
export const EXCEL_KOPF = ['OZ', 'Art', 'Kurztext', 'Langtext', 'Menge', 'EH', 'EP', 'GP'];

/** Zeilen für die Excel-Datei (Kopf, dann die Zeilen nach OZ). */
export function lvAlsTabelle(positionen: E[]): (string | number | null)[][] {
  return [EXCEL_KOPF, ...nachOz(positionen).map((q) => {
    const art = String(q.werte.art ?? 'normal'), ep = q.werte.ep == null || q.werte.ep === '' ? null : zahl(q.werte.ep);
    return istText(art)
      ? [String(q.werte.oz ?? ''), ART[art]!, String(q.werte.kurztext ?? ''), String(q.werte.langtext ?? ''), null, null, null, null]
      : [String(q.werte.oz ?? ''), ART[art] ?? 'Normal', String(q.werte.kurztext ?? ''), String(q.werte.langtext ?? ''), q.werte.menge == null || q.werte.menge === '' ? null : zahl(q.werte.menge),
        String(q.werte.einheit ?? ''), ep, ep != null && zaehlt(q) ? gp(q.werte.menge, ep) : null];
  })];
}

export interface LvEinlesung { zeilen: { oz: string; art: string; kurztext: string; langtext: string; menge: number | null; einheit: string; ep: number | null }[]; titel: number; positionen: number; doppelt: string[] }
const K = { oz: /^(oz|pos\.?|position|pos\.?-?nr\.?|ordnungszahl)$/i, art: /^art$/i, kurz: /^(kurztext|bezeichnung|text|leistung|kurzbeschreibung)$/i, lang: /^(langtext|beschreibung|langbeschreibung)$/i,
  menge: /^(menge|lv-?menge)$/i, eh: /^(eh|einheit|me|mengeneinheit)$/i, ep: /^(ep|einheitspreis|ep \(€\)|ep €)$/i };

/** Tabelle lesen: Kopfzeile in den ersten Zeilen suchen (OZ und Kurztext nötig), dann je Zeile Titel oder Position. */
export function lvAusTabelle(zeilen: string[][], vorhanden: E[] = []): LvEinlesung {
  let kopf = -1; const sp: Partial<Record<keyof typeof K, number>> = {};
  for (let i = 0; i < Math.min(zeilen.length, 25) && kopf < 0; i++) {
    const z = zeilen[i]!.map((x) => x.trim());
    const f = (k: keyof typeof K) => z.findIndex((x) => K[k].test(x));
    if (f('oz') < 0 || f('kurz') < 0) continue;
    kopf = i; for (const k of Object.keys(K) as (keyof typeof K)[]) { const j = f(k); if (j >= 0) sp[k] = j; }
  }
  if (kopf < 0) throw new Error('Keine Kopfzeile mit „OZ“ und „Kurztext“ (oder „Bezeichnung“) gefunden.');
  const zelle = (z: string[], k: keyof typeof K) => (sp[k] == null ? '' : (z[sp[k]!] ?? '').trim());
  const da = new Set(vorhanden.map((q) => ozSchluessel(q.werte.oz)));
  const erg: LvEinlesung = { zeilen: [], titel: 0, positionen: 0, doppelt: [] };
  for (const z of zeilen.slice(kopf + 1)) {
    const oz = zelle(z, 'oz'), kurz = zelle(z, 'kurz');
    if (!oz && !kurz) continue;
    const menge = mengeLesen(zelle(z, 'menge')), eh = zelle(z, 'eh'), artText = zelle(z, 'art').toLowerCase();
    const art = ART_AUS[artText] ?? (menge == null && !eh ? 'titel' : 'normal');
    if (oz && da.has(ozSchluessel(oz))) { erg.doppelt.push(oz); continue; }
    erg.zeilen.push({ oz, art, kurztext: kurz, langtext: zelle(z, 'lang'), menge: istText(art) ? null : menge, einheit: art === 'titel' ? '' : eh, ep: art === 'titel' ? null : mengeLesen(zelle(z, 'ep')) });
    if (art === 'titel') erg.titel++; else if (!istHinweis(art)) erg.positionen++;
  }
  return erg;
}
