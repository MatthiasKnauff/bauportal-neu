// Zentrale Versandstelle als reine Rechnung: Welche Nachrichten des Postausgangs gehen jetzt raus, und wie gebündelt?
// Mitteilungen (z. B. „Mail an alle“) gleich, je Empfänger:in einzeln. Erinnerungen zurückhaltend: zu den eingestellten Zeiten
// (ab Werk einmal am Tag um 07:00) und je Adresse in EINER Mail zusammen. Der Server führt nur aus, was hier steht.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };
export interface Paket { an: string; ids: string[]; betreff: string; text: string; anhaenge?: Anhang[] }
/** Anhang einer Nachricht – entsteht erst beim Versand aus dem dann aktuellen Stand, mit den Rechten der Person, die sie angelegt hat.
 *  Gespeichert je Zeile: „druck|<Ausdruck>|<Kennung>“ (PDF des Druckwerks), „x83|<LV>“ (LV als GAEB ohne Preise) oder
 *  „dokument|<Kennung>“ (ein abgelegtes Dokument – Plan, Datei aus dem Projektordner, vom Rechner – im Original). */
export type Anhang = { art: 'druck'; ausdruck: string; id: string } | { art: 'x83'; id: string } | { art: 'dokument'; id: string };
export const anhangText = (a: Anhang) => (a.art === 'druck' ? `druck|${a.ausdruck}|${a.id}` : `${a.art}|${a.id}`);
export function anhaengeVon(w: Werte): Anhang[] {
  return String(w.anhaenge ?? '').split('\n').map((z) => z.trim().split('|')).flatMap((t): Anhang[] =>
    t[0] === 'druck' && t[1] && t[2] ? [{ art: 'druck', ausdruck: t[1], id: t[2] }] : (t[0] === 'x83' || t[0] === 'dokument') && t[1] ? [{ art: t[0], id: t[1] }] : []);
}
export interface Einstellung { buendeln?: string; uhrzeit?: string; letzter?: string }

/** Ortszeit (Europe/Berlin) als „JJJJ-MM-TT“ und „HH:MM“. */
export function ortszeit(d: Date): { tag: string; uhr: string } {
  const t = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { tag: t.slice(0, 10), uhr: t.slice(11, 16) };
}

/** Kennung des Bündel-Laufs, der jetzt dran ist – null, wenn gerade keiner dran ist (schon gelaufen oder noch nicht Zeit). */
export function buendelLauf(jetzt: Date, e: Einstellung): string | null {
  const { tag, uhr } = ortszeit(jetzt);
  const art = e.buendeln || 'tag';
  if (art === 'sofort') return `${tag}T${uhr}`;
  const lauf = art === 'stunde' ? `${tag}T${uhr.slice(0, 2)}` : tag;
  if (art === 'tag' && uhr < (/^\d{2}:\d{2}$/.test(e.uhrzeit ?? '') ? e.uhrzeit! : '07:00')) return null;
  return lauf === e.letzter ? null : lauf;
}

/** Die Pakete, die jetzt verschickt werden – und ob dabei ein Bündel-Lauf stattfindet (dann wird er gemerkt). */
export function pakete(nachrichten: E[], jetzt: Date, e: Einstellung): { pakete: Paket[]; lauf: string | null } {
  const { tag } = ortszeit(jetzt);
  const faellig = nachrichten.filter((n) => n.werte.stand === 'wartet' && String(n.werte.an ?? '').includes('@') && (!n.werte.faellig || String(n.werte.faellig) <= tag));
  const aus: Paket[] = faellig.filter((n) => n.werte.art !== 'erinnerung')
    .map((n) => ({ an: String(n.werte.an), ids: [n.id], betreff: String(n.werte.betreff ?? ''), text: String(n.werte.text ?? ''), anhaenge: anhaengeVon(n.werte) }));
  const erinnerungen = faellig.filter((n) => n.werte.art === 'erinnerung');
  const lauf = erinnerungen.length ? buendelLauf(jetzt, e) : null;
  if (lauf) {
    const je = new Map<string, E[]>();
    for (const n of erinnerungen) { const a = String(n.werte.an).trim().toLowerCase(); je.set(a, [...(je.get(a) ?? []), n]); }
    for (const [an, l] of je) aus.push(l.length === 1
      ? { an, ids: [l[0]!.id], betreff: String(l[0]!.werte.betreff ?? ''), text: String(l[0]!.werte.text ?? '') }
      : { an, ids: l.map((n) => n.id), betreff: `${l.length} Erinnerungen aus dem Bauportal`,
        text: l.map((n, i) => `${i + 1}. ${String(n.werte.betreff ?? '')}\n${String(n.werte.text ?? '').trim()}`).join('\n\n') });
  }
  return { pakete: aus, lauf };
}

/** Anrede für „Mail an alle“ ({anrede} im Text): „Sehr geehrte Frau Muster,“ – ohne Ansprechperson „Sehr geehrte Damen und Herren,“. */
export function anredeVon(k: Werte): string {
  const name = String(k.ansprechpartner || (k.anrede ? k.name : '') || '').trim(), nach = name.split(/\s+/).at(-1) ?? '';
  const titel = String(k.titel ?? '').trim();
  if (k.anrede === 'Frau' && nach) return `Sehr geehrte Frau ${titel ? `${titel} ` : ''}${nach},`;
  if (k.anrede === 'Herr' && nach) return `Sehr geehrter Herr ${titel ? `${titel} ` : ''}${nach},`;
  return 'Sehr geehrte Damen und Herren,';
}
