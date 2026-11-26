// Aufmaß der Firma aus einer Tabelle (Excel/CSV) lesen: Ordnungszahl und Menge je Zeile den Positionen des LV zuordnen.
// Reine Rechnung – im Browser und in den Tests gleich. Mehrere Zeilen derselben OZ (Aufmaßblatt mit Einzelansätzen) werden addiert.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };

const OZ_KOPF = /^(oz|pos\.?|position|pos\.?-?nr\.?|ordnungszahl|ordnungs-?nr\.?)$/i;
const MENGE_KOPF = /menge/i;
/** Mengenspalten des LV oder Auftrags – nicht die Menge der Firma. */
const MENGE_NICHT = /(lv|ausschreibung|auftrag|beauftragt|vertrag|soll|vorherig|bisher|einheit)/i;

/** OZ vergleichbar machen: „01.0010.“ und „1.10“ sind dieselbe Position. */
export const ozSchluessel = (oz: unknown) => String(oz ?? '').trim().replace(/\.$/, '').split(/[.\s]+/).filter(Boolean)
  .map((t) => (/^\d+$/.test(t) ? String(Number(t)) : t.toUpperCase())).join('.');

/** Zahl aus einer Zelle: deutsch („1.234,5“) oder aus Excel („1234.5“). Leer oder unlesbar → null. */
export function mengeLesen(t: string): number | null {
  const s = t.replace(/\s| /g, '').replace(/[a-zA-Z²³]+$/, '');
  if (!s) return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  return Number.isFinite(n) ? n : null;
}

export interface AufmassTreffer { position: string; oz: string; menge: number; zeilen: number }
export interface AufmassLesung {
  /** Spaltennamen, die gelesen wurden */ ozSpalte: string; mengeSpalte: string;
  treffer: AufmassTreffer[];
  /** OZ aus der Datei ohne passende Position */ fremd: string[];
}

/** Kopfzeile suchen (in den ersten Zeilen der Datei), OZ- und Mengenspalte bestimmen, Zeilen den Positionen zuordnen. */
export function aufmassAusZeilen(zeilen: string[][], positionen: E[]): AufmassLesung {
  let kopf = -1, oz = -1, menge = -1;
  for (let i = 0; i < Math.min(zeilen.length, 25) && kopf < 0; i++) {
    const z = zeilen[i]!.map((x) => x.trim());
    const o = z.findIndex((x) => OZ_KOPF.test(x));
    if (o < 0) continue;
    const mengen = z.map((x, j) => [x, j] as const).filter(([x]) => MENGE_KOPF.test(x) && !MENGE_NICHT.test(x));
    if (!mengen.length) continue;
    // „Menge gesamt/aktuell“ vor einer einfachen „Menge“
    menge = (mengen.find(([x]) => /gesamt|aktuell|abgerechnet|ist/i.test(x)) ?? mengen[0]!)[1];
    kopf = i; oz = o;
  }
  if (kopf < 0) throw new Error('Keine Kopfzeile mit „OZ“ (oder „Position“) und „Menge“ gefunden.');
  const paare = zeilen.slice(kopf + 1).map((z) => ({ oz: (z[oz] ?? '').trim(), menge: mengeLesen(z[menge] ?? '') }));
  return { ozSpalte: zeilen[kopf]![oz]!, mengeSpalte: zeilen[kopf]![menge]!, ...mengenZuordnen(paare, positionen) };
}

/** Mengen je OZ den Positionen zuordnen (auch für die Zeilen einer E-Rechnung): gleiche OZ addiert, fremde OZ gesammelt. */
export function mengenZuordnen(paare: { oz: string; menge: number | null }[], positionen: E[]): { treffer: AufmassTreffer[]; fremd: string[] } {
  const nachSchluessel = new Map(positionen.filter((p) => p.werte.oz).map((p) => [ozSchluessel(p.werte.oz), p]));
  const treffer = new Map<string, AufmassTreffer>(), fremd: string[] = [];
  for (const { oz: o, menge: m } of paare) {
    if (!o || m == null) continue;
    const p = nachSchluessel.get(ozSchluessel(o));
    if (!p) { if (!fremd.includes(o)) fremd.push(o); continue; }
    const t = treffer.get(p.id);
    if (t) { t.menge = Math.round((t.menge + m) * 1000) / 1000; t.zeilen++; }
    else treffer.set(p.id, { position: p.id, oz: String(p.werte.oz), menge: m, zeilen: 1 });
  }
  return { treffer: [...treffer.values()], fremd };
}
