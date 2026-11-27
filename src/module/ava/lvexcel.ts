// LV als Excel-Tabelle (wie im bisherigen Bauportal: Export und Einlesen neben GAEB). Eine Zeile je Titel bzw. Position mit
// OZ, Art, Kurztext, Langtext, Menge, Einheit, EP; Titel erkennt das Einlesen an der Art „Titel“ oder an fehlender Menge und Einheit.
// Reine Rechnung – im Browser und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { mengeLesen, ozSchluessel } from './aufmasslesen';
import { gpVon, lvEp, lvMenge, nachKennung, nachOz, zaehlt, zahl } from './rechnung';
import { istHinweis, istText } from '../../kern/lvarten';

type E = { id: string; werte: Werte };
const ART: Record<string, string> = { titel: 'Titel', normal: 'Normal', bedarf: 'Bedarf', alternativ: 'Wahl', pauschal: 'Pauschal', stundenlohn: 'Stundenlohn', hinweis: 'Hinweis', vorbemerkung: 'Vorbemerkung', zuschlag: 'Zuschlag' };
const ART_AUS = Object.fromEntries(Object.entries(ART).map(([k, t]) => [t.toLowerCase(), k])) as Record<string, string>;
export const EXCEL_KOPF = ['OZ', 'Art', 'Kurztext', 'Langtext', 'Menge', 'EH', 'EP', 'GP'];

/** Zeilen für die Excel-Datei (Kopf, dann die Zeilen nach OZ). */
export function lvAlsTabelle(positionen: E[]): (string | number | null)[][] {
  const alle = nachKennung(positionen);
  return [EXCEL_KOPF, ...nachOz(positionen).map((q) => {
    const art = String(q.werte.art ?? 'normal'), ep = q.werte.ep == null || q.werte.ep === '' ? null : zahl(q.werte.ep);
    return istText(art)
      ? [String(q.werte.oz ?? ''), ART[art]!, String(q.werte.kurztext ?? ''), String(q.werte.langtext ?? ''), null, null, null, null]
      : [String(q.werte.oz ?? ''), ART[art] ?? 'Normal', String(q.werte.kurztext ?? ''), String(q.werte.langtext ?? ''), q.werte.menge == null || q.werte.menge === '' ? null : zahl(q.werte.menge),
        String(q.werte.einheit ?? ''), ep, ep != null && zaehlt(q) ? gpVon(q, alle, lvMenge, lvEp) : null];
  })];
}

export interface LvEinlesung { zeilen: { oz: string; art: string; kurztext: string; langtext: string; menge: number | null; einheit: string; ep: number | null }[]; titel: number; positionen: number; doppelt: string[] }
const K = { oz: /^(oz|pos\.?|position|pos\.?-?nr\.?|ordnungszahl)$/i, art: /^art$/i, kurz: /^(kurztext|bezeichnung|text|leistung|kurzbeschreibung)$/i, lang: /^(langtext|beschreibung|langbeschreibung)$/i,
  menge: /^(menge|lv-?menge)$/i, eh: /^(eh|einheit|me|mengeneinheit)$/i, ep: /^(ep|einheitspreis|ep \(€\)|ep €)$/i };

type Spalte = keyof typeof K;
interface Gelesen { oz: string; art: string; kurztext: string; langtext: string; menge: number | null; einheit: string; ep: number | null }
/** Kopfzeile in den ersten Zeilen suchen (die nötigen Spalten müssen da sein), dann jede Zeile mit ihrer Art. */
function zeilenLesen(zeilen: string[][], noetig: Spalte[], fehlt: string): Gelesen[] {
  let kopf = -1; const sp: Partial<Record<Spalte, number>> = {};
  for (let i = 0; i < Math.min(zeilen.length, 25) && kopf < 0; i++) {
    const z = zeilen[i]!.map((x) => x.trim());
    const f = (k: Spalte) => z.findIndex((x) => K[k].test(x));
    if (noetig.some((k) => f(k) < 0)) continue;
    kopf = i; for (const k of Object.keys(K) as Spalte[]) { const j = f(k); if (j >= 0) sp[k] = j; }
  }
  if (kopf < 0) throw new Error(fehlt);
  const zelle = (z: string[], k: Spalte) => (sp[k] == null ? '' : (z[sp[k]!] ?? '').trim());
  const aus: Gelesen[] = [];
  for (const z of zeilen.slice(kopf + 1)) {
    const oz = zelle(z, 'oz'), kurz = zelle(z, 'kurz'), ep = mengeLesen(zelle(z, 'ep'));
    if (!oz && !kurz) continue;
    const menge = mengeLesen(zelle(z, 'menge')), eh = zelle(z, 'eh'), artText = zelle(z, 'art').toLowerCase();
    const art = ART_AUS[artText] ?? (menge == null && !eh && ep == null ? 'titel' : 'normal');
    aus.push({ oz, art, kurztext: kurz, langtext: zelle(z, 'lang'), menge: istText(art) ? null : menge, einheit: art === 'titel' ? '' : eh, ep: istText(art) ? null : ep });
  }
  return aus;
}

/** LV aus einer Tabelle: Titel und Positionen; schon vorhandene OZ kommen nicht noch einmal. */
export function lvAusTabelle(zeilen: string[][], vorhanden: E[] = []): LvEinlesung {
  const da = new Set(vorhanden.map((q) => ozSchluessel(q.werte.oz)));
  const erg: LvEinlesung = { zeilen: [], titel: 0, positionen: 0, doppelt: [] };
  for (const z of zeilenLesen(zeilen, ['oz', 'kurz'], 'Keine Kopfzeile mit „OZ“ und „Kurztext“ (oder „Bezeichnung“) gefunden.')) {
    if (z.oz && da.has(ozSchluessel(z.oz))) { erg.doppelt.push(z.oz); continue; }
    erg.zeilen.push(z);
    if (z.art === 'titel') erg.titel++; else if (!istHinweis(z.art)) erg.positionen++;
  }
  return erg;
}

export interface PreisEinlesung { preise: { position: string; ep: number }[]; fremd: string[]; ohnePreis: number }
/** Angebot aus einer Tabelle (Excel der Bieter:in): EP je OZ zu den Positionen des LV – wie beim X84. */
export function preiseAusTabelle(zeilen: string[][], positionen: E[]): PreisEinlesung {
  // Ob Titel oder Position, sagt das LV (die Tabelle der Bieter:in hat oft keine Menge): nur OZ, die es im LV gibt
  const pos = new Map(positionen.filter((q) => !istText(q.werte.art)).map((q) => [ozSchluessel(q.werte.oz), q.id]));
  const text = new Set(positionen.filter((q) => istText(q.werte.art)).map((q) => ozSchluessel(q.werte.oz)));
  const erg: PreisEinlesung = { preise: [], fremd: [], ohnePreis: 0 };
  for (const z of zeilenLesen(zeilen, ['oz', 'ep'], 'Keine Kopfzeile mit „OZ“ und „EP“ (oder „Einheitspreis“) gefunden.')) {
    const k = ozSchluessel(z.oz), id = pos.get(k);
    if (!z.oz || text.has(k) || (!id && z.ep == null)) continue;
    if (!id) { erg.fremd.push(z.oz); continue; }
    if (z.ep == null) { erg.ohnePreis++; continue; }
    erg.preise.push({ position: id, ep: z.ep });
  }
  return erg;
}
