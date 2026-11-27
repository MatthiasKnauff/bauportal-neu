// Aufmaß je Rechnung (wie im bisherigen Bauportal, einfacher gebaut): ein Eintrag „aufmass“ ist eine Rechenzeile einer Position –
// Rechenweg, Datum, Ort. Ohne Rechnung ist sie „laufend“ (gehört zur offenen Rechnung); beim Abschließen der Prüfung bekommt sie
// die Rechnung und steht danach fest. Abschlags- und Schlussrechnungen (Kette „Hauptauftrag“) sowie Nachtragsrechnungen
// (Kette „Nachtrag“) bauen aufeinander auf: ihr Stand ist alles bis zu ihnen, ihr Zuwachs das seit der vorigen geprüften.
// Stundenlohnrechnungen stehen für sich (nur ihre eigenen Zeilen).
// Der Rechenweg folgt einer Regel: ohne Zeichen getippt ist er der Stand (bis einschließlich dieser Rechnung) – gespeichert mit dem
// Stand davor als „basis“, die Zeile trägt die Differenz bei; mit „+“ davor ist er der Zuwachs.
// Reine Rechnung: im Browser, auf dem Server und in den Tests gleich.
import { rechenweg } from '../../kern/rechenweg';
import type { Werte } from '../../kern/modell';
import { zahl } from './rechnung';

type E = { id: string; werte: Werte };
export type Kette = 'haupt' | 'nachtrag';

/** Kette einer Rechnung – null: steht für sich (Stundenlohn). */
export const ketteVon = (r: E): Kette | null => (r.werte.art === 'stundenlohn' ? null : r.werte.art === 'nachtrag' ? 'nachtrag' : 'haupt');
export const geprueft = (r: E) => r.werte.status === 'geprueft' || r.werte.status === 'bezahlt';

/** Rechnungen eines LV in ihrer Reihenfolge (Rechnungsdatum, dann Nummer). */
export function reihe(rechnungen: E[]): E[] {
  return [...rechnungen].sort((a, b) => String(a.werte.datum ?? '9999').localeCompare(String(b.werte.datum ?? '9999')) || String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true }));
}

/** Menge, die eine Rechenzeile beiträgt (null: Rechenweg nicht lesbar). */
export function beitrag(z: E): number | null {
  const t = String(z.werte.rechenweg ?? '').trim();
  if (!t) return 0;
  if (t.startsWith('+')) return rechenweg(t.slice(1)).summe;
  const s = rechenweg(t).summe;
  return s == null ? null : s - zahl(z.werte.basis);
}
/** Rechenzeile so, wie sie getippt wurde (Stand ohne Zeichen, Zuwachs mit „+“). */
export const getippt = (z: E) => String(z.werte.rechenweg ?? '');

/** Zeilen, die zu einer Rechnung zählen: für eine kumulierende alle der Kette bis zu ihr (und die laufenden, solange sie offen ist),
 *  für eine Stundenlohnrechnung nur ihre eigenen. Ohne Rechnung: alle laufenden und alle festen der Hauptkette. */
export function zeilenBis(zeilen: E[], rechnungen: E[], r: E | null): E[] {
  const R = reihe(rechnungen), nach = new Map(R.map((x, i) => [x.id, i]));
  if (r && ketteVon(r) === null) return zeilen.filter((z) => z.werte.rechnung === r.id);
  const k = r ? ketteVon(r) : 'haupt', bis = r ? nach.get(r.id)! : Infinity;
  return zeilen.filter((z) => {
    if (!z.werte.rechnung) return !r || !geprueft(r);   // laufend: gehört zur offenen Rechnung
    const x = R[nach.get(String(z.werte.rechnung)) ?? -1];
    return !!x && ketteVon(x) === k && nach.get(x.id)! <= bis;
  });
}

/** Stand je Position (Summe der Beiträge) aus diesen Zeilen. */
export function standAus(zeilen: E[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const z of zeilen) { const b = beitrag(z); if (b != null) m.set(String(z.werte.position), Math.round(((m.get(String(z.werte.position)) ?? 0) + b) * 10000) / 10000); }
  return m;
}
/** Stand bis zur vorigen geprüften Rechnung derselben Kette (Spalte „bis …“). */
export function vorige(rechnungen: E[], r: E | null): E | null {
  if (r && ketteVon(r) === null) return null;
  const R = reihe(rechnungen), k = r ? ketteVon(r) : 'haupt', bis = r ? R.findIndex((x) => x.id === r.id) : R.length;
  return R.slice(0, bis).filter((x) => ketteVon(x) === k && geprueft(x)).at(-1) ?? null;
}

/** Die Rechnung, um die es in der Aufmaßprüfung geht: die offene (älteste), sonst die letzte. */
export function aktuelleRechnung(rechnungen: E[]): E | null {
  const R = reihe(rechnungen);
  return R.find((x) => !geprueft(x)) ?? R.at(-1) ?? null;
}

/** Neue Rechenzeile aus einer Eingabe: „+ …“ = Zuwachs, sonst Stand (basis = Stand ohne diese Zeile). null: nicht lesbar. */
export function zeileAus(eingabe: string, standOhne: number): { rechenweg: string; basis: number | null; beitrag: number } | null {
  const t = eingabe.trim(); if (!t) return null;
  if (t.startsWith('+')) { const v = rechenweg(t.slice(1)).summe; return v == null ? null : { rechenweg: `+ ${t.slice(1).trim()}`, basis: null, beitrag: v }; }
  const v = rechenweg(t).summe; if (v == null) return null;
  return { rechenweg: t, basis: Math.round(standOhne * 10000) / 10000, beitrag: v - standOhne };
}

/** Prüfstand je Position: ✓ Menge der Firma = aufgemessen, ✗ weicht ab, ○ noch nichts aufgemessen. */
export type Pruef = 'stimmt' | 'abweichend' | 'offen';
export function pruefung(firma: number | null | undefined, stand: number | undefined): Pruef {
  if (stand == null) return 'offen';
  if (firma == null) return 'abweichend';
  return Math.abs(firma - stand) < 0.0005 ? 'stimmt' : 'abweichend';
}
