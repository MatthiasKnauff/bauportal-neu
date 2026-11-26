// Was ist das für ein Dokument? Aus dem Text eines PDF oder Scans (Texterkennung im Dateidienst): Art, Projekt, Firma,
// Nummer, Datum, Betrag. Reine Textfunktion – im Browser und in den Tests gleich. Die KI kommt nur auf Knopfdruck dazu.
import type { Dokumentart } from './modul';

/** Firmennamen vergleichbar: ohne Rechtsform und Satzzeichen („Maler Kunz GmbH & Co. KG“ = „maler kunz“). */
export const firmenSchluessel = (n: unknown) => String(n ?? '').toLowerCase()
  .replace(/\b(gmbh|mbh|co|kg|ag|ohg|gbr|ug|e\.?\s?k|e\.?\s?v|inh|haftungsbeschränkt|fa|firma)\b\.?/g, '').replace(/[^a-zäöüß0-9]+/g, ' ').trim();

export interface Erkennung {
  /** Art mit den meisten Merkmalen – null, wenn keine Wendung passt */ art: string | null;
  /** Punkte je Art (gefundene Merkmale) – nur Arten mit Treffern */ punkte: Record<string, number>;
  projekt: string | null; firma: string | null;
  nummer: string; datum: string; betrag: number | null;
}
export interface Erkennungsquellen {
  arten: Pick<Dokumentart, 'art' | 'merkmale' | 'nummerWort'>[];
  projekte: { id: string; nummer?: unknown; name?: unknown; strasse?: unknown }[];
  kontakte: { id: string; name?: unknown }[];
  /** Firmen, die im Briefkopf als Empfänger stehen und deshalb nie der Absender sind (das eigene Büro) */
  ausser?: string[];
}

const klein = (t: string) => t.toLowerCase().replace(/\s+/g, ' ');
const zahlDe = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));
const iso = (d: string) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(d); if (!m) return '';
  const j = m[3]!.length === 2 ? `20${m[3]}` : m[3]!, mo = Number(m[2]), t = Number(m[1]);
  return mo >= 1 && mo <= 12 && t >= 1 && t <= 31 ? `${j}-${String(mo).padStart(2, '0')}-${String(t).padStart(2, '0')}` : '';
};
const wort = (w: string) => new RegExp(`(^|[^a-zäöüß0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zäöüß0-9])`, 'i');

export function dokumentErkennen(roh: string, q: Erkennungsquellen): Erkennung {
  const text = roh.replace(/ /g, ' '), t = klein(text);
  // Art: je gefundener Wendung ein Punkt; bei Gleichstand die, deren erstes Merkmal früher im Text steht
  const punkte = q.arten.map((a) => {
    const treffer = a.merkmale.map((m) => new RegExp(m, 'im').exec(text)).filter((x): x is RegExpExecArray => !!x);
    return { a, n: treffer.length, erst: Math.min(...treffer.map((x) => x.index), Infinity) };
  }).filter((x) => x.n > 0).sort((x, y) => y.n - x.n || x.erst - y.erst);
  const art = punkte[0]?.a;
  // Projekt: Projektnummer als eigenes Wort, sonst der Name, sonst die Straße der Baustelle
  const projekt = q.projekte.find((p) => String(p.nummer ?? '').length >= 2 && wort(String(p.nummer)).test(text))
    ?? q.projekte.find((p) => String(p.name ?? '').length >= 6 && t.includes(klein(String(p.name))))
    ?? q.projekte.find((p) => String(p.strasse ?? '').length >= 6 && t.includes(klein(String(p.strasse))));
  // Firma: der längste Name aus den Adressen, der im Text steht (nicht das eigene Büro)
  const tf = ` ${firmenSchluessel(text)} `, aus = new Set((q.ausser ?? []).map(firmenSchluessel));
  const firma = q.kontakte.map((k) => ({ k, s: firmenSchluessel(k.name) })).filter((x) => x.s.length >= 4 && !aus.has(x.s) && tf.includes(` ${x.s} `))
    .sort((a, b) => b.s.length - a.s.length)[0]?.k;
  // Nummer: „Rechnungsnummer: 4711“, „Rechnung Nr. R-26/12“, sonst „Nr. …“
  const nw = art?.nummerWort;
  const nummer = (nw ? new RegExp(`${nw}s?[- ]?(?:nummer|nr\\.?)\\s*[:.]?\\s*([A-Za-z0-9][\\w\\-/.]{0,24})`, 'i').exec(text) : null)
    ?? /\b(?:nummer|nr\.?)\s*[:.]?\s*([A-Za-z0-9][\w\-/.]{0,24}\d[\w\-/]*)/i.exec(text);
  // Datum: nach „…datum“ oder „Datum“, sonst das erste im Text
  const datum = /datum\s*[:.]?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i.exec(text)?.[1] ?? /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/.exec(text)?.[1] ?? '';
  // Betrag netto: der größte Betrag hinter „netto“ (Summe, Gesamtbetrag, Leistungsstand)
  const netto = [...text.matchAll(/netto[^\d\n]{0,40}?(-?\d{1,3}(?:\.\d{3})*,\d{2})/gi)].map((m) => zahlDe(m[1]!));
  return { art: art?.art ?? null, punkte: Object.fromEntries(punkte.map((x) => [x.a.art, x.n])), projekt: projekt?.id ?? null, firma: firma?.id ?? null,
    nummer: (nummer?.[1] ?? '').replace(/[.,:;]+$/, ''), datum: iso(datum), betrag: netto.length ? Math.max(...netto) : null };
}
