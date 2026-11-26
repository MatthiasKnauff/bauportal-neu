// Werte aufräumen (wie im bisherigen Bauportal): ähnliche Gewerke, Stichwörter und Tags finden und auf einen Wert
// zusammenführen, Werte umbenennen. Reine Rechnung – im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };

/** Teile eines Werts: bei Listen (Stichwörter, Tags: „a, b“) jeder Eintrag, sonst der ganze Wert. */
export const teile = (w: unknown, liste: boolean): string[] => {
  const t = String(w ?? '').trim();
  if (!t) return [];
  return liste ? t.split(',').map((x) => x.trim()).filter(Boolean) : [t];
};

/** Jeder vorkommende Wert mit der Zahl der Kontakte, die ihn tragen – A bis Z. */
export function werteZaehlen(eintraege: E[], feld: string, liste: boolean): { wert: string; anzahl: number }[] {
  const m = new Map<string, number>();
  for (const e of eintraege) for (const t of new Set(teile(e.werte[feld], liste))) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([wert, anzahl]) => ({ wert, anzahl })).sort((a, b) => a.wert.localeCompare(b.wert, 'de'));
}

/** Zum Vergleichen: klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern („Elektro-Installation“ = „elektroinstallation“). */
export const grundform = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

function abstand(a: string, b: string, grenze: number): number {
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1;
  let vor = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    for (let j = 1; j <= b.length; j++) jetzt[j] = Math.min(vor[j]! + 1, jetzt[j - 1]! + 1, vor[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...jetzt) > grenze) return grenze + 1;
    vor = jetzt;
  }
  return vor[b.length]!;
}

/**
 * Gruppen ähnlicher Werte: gleiche Grundform, ein Tippfehler (ab 6 Zeichen zwei) oder einer beginnt mit dem anderen
 * („Elektro“ – „Elektroinstallation“, ab 5 Zeichen). Der häufigste Wert steht vorn – er ist der Vorschlag.
 */
export function aehnlicheGruppen(werte: { wert: string; anzahl: number }[]): { wert: string; anzahl: number }[][] {
  const g = werte.map((w) => grundform(w.wert));
  const eltern = werte.map((_, i) => i);
  const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i]!)));
  for (let i = 0; i < werte.length; i++) for (let j = i + 1; j < werte.length; j++) {
    const a = g[i]!, b = g[j]!;
    if (!a || !b) continue;
    const kurz = Math.min(a.length, b.length);
    const aehnlich = a === b || abstand(a, b, kurz >= 6 ? 2 : 1) <= (kurz >= 6 ? 2 : kurz >= 4 ? 1 : 0) || (kurz >= 5 && (a.startsWith(b) || b.startsWith(a)));
    if (aehnlich) eltern[wurzel(i)] = wurzel(j);
  }
  const gruppen = new Map<number, { wert: string; anzahl: number }[]>();
  werte.forEach((w, i) => { const r = wurzel(i); gruppen.set(r, [...(gruppen.get(r) ?? []), w]); });
  // Vorschlag vorn: der häufigste – bei Gleichstand groß geschrieben vor klein, dann der kürzere
  const gross = (t: string) => Number(t[0] !== t[0]!.toLowerCase());
  return [...gruppen.values()].filter((x) => x.length > 1).map((x) => x.sort((a, b) => b.anzahl - a.anzahl || gross(b.wert) - gross(a.wert) || a.wert.length - b.wert.length || a.wert.localeCompare(b.wert, 'de')));
}

/** Änderungen, die die Werte „von“ in „nach“ umbenennen (bei Listen ohne Doppelte, Reihenfolge bleibt). */
export function umbenennen(eintraege: E[], feld: string, liste: boolean, von: string[], nach: string): { id: string; werte: Werte }[] {
  const weg = new Set(von);
  const ziel = nach.trim();
  return eintraege.flatMap((e) => {
    const alt = teile(e.werte[feld], liste);
    if (!alt.some((t) => weg.has(t))) return [];
    const neu: string[] = [];
    for (const t of alt.map((x) => (weg.has(x) ? ziel : x))) if (t && !neu.some((n) => n.toLowerCase() === t.toLowerCase())) neu.push(t);
    const wert = liste ? neu.join(', ') : neu[0] ?? '';
    return wert === String(e.werte[feld] ?? '') ? [] : [{ id: e.id, werte: { [feld]: wert } }];
  });
}
