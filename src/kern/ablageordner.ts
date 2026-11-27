// Ablageordner: wohin ein Dokument oder ein Ausdruck im Projektordner kommt. Jede Dokumentart und jeder Ausdruck nennt eine
// Rolle (z. B. „Rechnungsprüfung je Firma“); die Rolle bringt einen Vorschlag ab Werk mit (wie im Projektordner A481).
// Die Ablage ist immer nur ein Vorschlag (Entscheidung 27.11.2026): Reihenfolge fest in der Verwaltung → im Projekt gemerkte Wahl
// (je Dokumentart und je Firma/Gewerk) → Vorgabe des Büros → ab Werk. Platzhalter: {projekt} {lv} {firma} {gewerk} {datum}.

/** Eine Rolle im Projektordner – einmal beschrieben, von Dokumentarten und Ausdrucken genannt. */
export interface Ablagerolle { id: string; titel: string; ordner: string }
/** Was die Verwaltung zu einer Rolle eingestellt hat: eigener Ordner, auf Wunsch fest (dann wird nicht mehr gefragt). */
export interface Ablageregel { ordner: string; fest: boolean }
export type Platzhalter = Partial<Record<'projekt' | 'lv' | 'firma' | 'gewerk' | 'datum', string>>;
export type Ablageherkunft = 'fest' | 'projekt' | 'buero' | 'werk';

const PLATZ = /\{(projekt|lv|firma|gewerk|datum)\}/g;

/** Der Ordner mit eingesetzten Platzhaltern – was fehlt, fällt samt Leerzeichen weg; Zeichen, die Windows nicht mag, werden „-“. */
export function ordnerEinsetzen(muster: string, p: Platzhalter): string {
  return muster.replace(PLATZ, (_, k: keyof Platzhalter) => (p[k] ?? '').replace(/[\\/:*?"<>|]+/g, '-'))
    .split('/').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('/');
}

/** Woran sich das Projekt eine andere Wahl merkt: je Firma, sonst je Gewerk, wenn der Ordner danach unterscheidet. */
export function wahlBezug(muster: string, p: { firma?: string | null; gewerk?: string | null }): string {
  if (muster.includes('{firma}')) return p.firma ?? '';
  if (muster.includes('{gewerk}')) return p.gewerk ?? '';
  return '';
}

/** Der vorgeschlagene Ordner und woher er kommt. */
export function ablageordner(rolle: Ablagerolle, q: { regel?: Ablageregel; wahl?: string }, p: Platzhalter): { ordner: string; herkunft: Ablageherkunft; muster: string } {
  const regel = q.regel?.ordner.trim() ? q.regel : undefined;
  if (regel?.fest) return { ordner: ordnerEinsetzen(regel.ordner, p), herkunft: 'fest', muster: regel.ordner };
  if (q.wahl?.trim()) return { ordner: ordnerEinsetzen(q.wahl, p), herkunft: 'projekt', muster: q.wahl };
  if (regel) return { ordner: ordnerEinsetzen(regel.ordner, p), herkunft: 'buero', muster: regel.ordner };
  return { ordner: ordnerEinsetzen(rolle.ordner, p), herkunft: 'werk', muster: rolle.ordner };
}

export const HERKUNFT_TEXT: Record<Ablageherkunft, string> = {
  fest: 'fest eingestellt in der Verwaltung', projekt: 'wie zuletzt in diesem Projekt', buero: 'Vorgabe des Büros', werk: 'Vorschlag wie im Projektordner A481',
};
