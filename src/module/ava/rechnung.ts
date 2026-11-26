// Ausschreibung: Summen und Wertung – reine Rechnung, im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };
/** Positionen, die in die Summe eingehen: Bedarfs- und Alternativpositionen nicht (sie stehen nur mit EP im LV), Titel und Hinweise ohnehin nicht. */
export const zaehlt = (p: E) => ['normal', 'pauschal', 'stundenlohn', ''].includes(String(p.werte.art ?? ''));
export const zahl = (w: unknown): number => (typeof w === 'number' ? w : Number(String(w ?? '').replace(/\./g, '').replace(',', '.')) || 0);
export const gp = (menge: unknown, ep: unknown) => Math.round(zahl(menge) * zahl(ep) * 100) / 100;

/** Ordnungszahlen natürlich sortieren: „01.2.10“ nach „01.2.9“. */
export function ozVergleich(a: unknown, b: unknown): number {
  const x = String(a ?? '').split(/[.\s]+/), y = String(b ?? '').split(/[.\s]+/);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? '', q = y[i] ?? '';
    const d = /^\d+$/.test(p) && /^\d+$/.test(q) ? Number(p) - Number(q) : p.localeCompare(q, 'de');
    if (d) return d;
  }
  return 0;
}
/** OZ für eine neue Position: hinter der letzten Position des LV, in Zehnerschritten mit gleicher Stellenzahl (01.0030 → 01.0040). */
export function naechsteOz(positionen: E[]): string {
  const letzte = nachOz(positionen.filter((p) => p.werte.oz)).at(-1);
  if (!letzte) return '01.0010';
  const teile = String(letzte.werte.oz).split('.');
  if (letzte.werte.art === 'titel') return `${teile.join('.')}.${'0010'}`;
  const ende = teile.pop()!, n = Number(ende);
  return Number.isNaN(n) ? '' : [...teile, String(n + 10).padStart(ende.length, '0')].join('.');
}
export const nachOz = <T extends E>(l: T[]) => [...l].sort((a, b) => ozVergleich(a.werte.oz, b.werte.oz) || Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0));

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
    return { angebot: a.id, netto, nachLass: Math.round(netto * (1 - zahl(a.werte.nachlass) / 100) * 100) / 100, fehlend, rang: null as number | null, aus: a.werte.ausgeschlossen === true };
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
export interface Leiterzeile { titel: string; betrag: number; summe?: boolean }
/**
 * Erst die Abzüge netto (Nachlass), dann die Umsatzsteuer, dann die Abzüge brutto (Sicherheitseinbehalt, bisherige Zahlungen).
 * Leistungsstand: kumuliert (bei Abschlagsrechnungen der ganze Stand bis dahin) – geprüft, sonst wie angefordert.
 * Bisherige Zahlungen: die Zahlbeträge der früheren Rechnungen desselben Auftrags (nach Datum).
 */
export function leiter(rechnungen: E[], id: string, nachlassProzent: number): Leiterzeile[] {
  const reihe = [...rechnungen].sort((a, b) => String(a.werte.datum ?? '').localeCompare(String(b.werte.datum ?? '')) || (a.id < b.id ? -1 : 1));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  let gezahlt = 0;
  for (const r of reihe) {
    const stand = zahl(r.werte.geprueft ?? r.werte.betrag);
    const nachlass = r2(stand * nachlassProzent / 100), netto = r2(stand - nachlass), ust = r2(netto * UST), brutto = r2(netto + ust);
    const einbehalt = r2(brutto * zahl(r.werte.einbehalt) / 100), zahlbetrag = r2(brutto - einbehalt - gezahlt);
    if (r.id === id) return [
      { titel: `Leistungsstand netto${r.werte.geprueft != null && r.werte.geprueft !== '' ? ' (geprüft)' : ' (angefordert)'}`, betrag: stand },
      ...(nachlass ? [{ titel: `− Nachlass ${String(nachlassProzent).replace('.', ',')} %`, betrag: -nachlass }, { titel: 'netto nach Nachlass', betrag: netto, summe: true }] : []),
      { titel: `+ Umsatzsteuer ${UST * 100} %`, betrag: ust }, { titel: 'brutto', betrag: brutto, summe: true },
      ...(einbehalt ? [{ titel: `− Sicherheitseinbehalt ${String(r.werte.einbehalt).replace('.', ',')} %`, betrag: -einbehalt }] : []),
      ...(gezahlt ? [{ titel: '− bisherige Zahlungen', betrag: -gezahlt }] : []),
      { titel: 'Zahlbetrag', betrag: zahlbetrag, summe: true },
    ];
    gezahlt = r2(gezahlt + zahlbetrag);
  }
  return [];
}

/** Aufmaßprüfung je Position: ✓ stimmt, ✗ weicht ab, ○ noch offen (kein Rechenweg). */
export type Pruefstand = 'stimmt' | 'abweichend' | 'offen';
export function pruefstand(mengeFirma: unknown, geprueft: number | null): Pruefstand {
  if (geprueft == null) return 'offen';
  if (mengeFirma == null || mengeFirma === '') return 'abweichend';
  return Math.abs(zahl(mengeFirma) - geprueft) < 0.0005 ? 'stimmt' : 'abweichend';
}
