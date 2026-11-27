// Fenster- & Türliste als Anlage zum LV-Druck (wie bisher): nur wenn das LV Positionen aus einer Türliste hat – dann die
// Türen und Fenster dieser Listen, nach Liste und Nummer. Eine Druckquelle: Browser und Server rechnen gleich.
import { feldtext, type Druckquelle, type DruckTabelle, type Hole } from '../../kern/druck';
import type { Werte } from '../../kern/modell';
import { tuer } from './beipackzettel';

type E = { id: string; werte: Werte };
/** Spalten der Anlage (hochkant – das LV ist hochkant): Nummer, Ort, Typ, Anzahl, Maße, Brandschutz, Bemerkung. */
const SPALTEN = ['nr', 'geschoss', 'raum', 'typ', 'anzahl', 'mass', 'brand', 'bem'] as const;
const feld = (n: string) => tuer.felder.find((f) => f.name === n)!;
const text = (w: Werte, n: string) => (n === 'mass' ? [w.b, w.h].filter((x) => x != null && x !== '').join(' × ') : feldtext(feld(n), w[n], () => ''));

/** Die Türlisten, aus denen Positionen des LV stammen (Quelle „Liste|Gruppe|…“), mit ihren Einträgen. */
export function tueranlage(positionen: E[], listen: E[], tueren: E[]): DruckTabelle[] {
  const ids = new Set(positionen.map((q) => String(q.werte.quelle ?? '').split('|')[0]));
  const nr = (w: Werte) => String(w.nr ?? '');
  return listen.filter((l) => ids.has(l.id)).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de')).map((l) => ({
    titel: String(l.werte.name ?? 'Fenster- & Türliste'),
    spalten: SPALTEN.map((n) => ({ titel: n === 'mass' ? 'B × H' : feld(n).titel, rechts: n === 'anzahl' })),
    zeilen: tueren.filter((t) => t.werte.liste === l.id).sort((a, b) => nr(a.werte).localeCompare(nr(b.werte), 'de', { numeric: true }))
      .map((t) => ({ zellen: SPALTEN.map((n) => text(t.werte, n)) })),
  })).filter((t) => t.zeilen.length);
}

const quelle: Druckquelle = {
  braucht: [{ objekt: 'lv_position', feld: 'lv', wert: 'id' }, { objekt: 'tuerliste', feld: 'projekt', wert: 'projekt' }, { objekt: 'tuer', feld: 'projekt', wert: 'projekt' }],
  tabellen: (hole: Hole, lv) => { const p = String(lv.werte.projekt ?? ''); return tueranlage(hole('lv_position', 'lv', lv.id), hole('tuerliste', 'projekt', p), hole('tuer', 'projekt', p)); },
};
export const DRUCKQUELLEN: Record<string, Druckquelle> = { 'ava.tueranlage': quelle };
