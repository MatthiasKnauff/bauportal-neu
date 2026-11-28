// Text ↔ Feldwert für Tabellen wie in Excel: was man tippt oder aus Excel einfügt, wird zum Wert des Felds –
// Auswahl nach Titel oder Kürzel, Ja/Nein aus „x“, „ja“, „✓“, Mehrfach aus „Lichtausschnitt, OTS“, Zahlen mit Komma, Datum wie man es schreibt.
// Reine Textfunktion: im Browser und auf dem Server gleich.
import type { Feld, Wert } from './modell';
import { datumAusText } from './datum';

const JA = /^(x|ja|j|1|✓|✔|true|wahr|yes)$/i;

/** Text → Wert des Felds; '' löscht. Liefert null, wenn der Text nicht passt (z. B. „abc“ in einer Zahl). */
export function wertAusText(f: Feld, text: string): Wert | undefined {
  const t = text.trim();
  if (f.art === 'ja_nein') return JA.test(t);
  if (!t) return '';
  if (f.art === 'zahl') { const n = Number(t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : undefined; }
  if (f.art === 'datum') { const d = datumAusText(t); return d === null ? undefined : d; }
  if (f.art === 'auswahl') {
    const o = f.optionen?.find((x) => x.titel.toLowerCase() === t.toLowerCase() || x.wert.toLowerCase() === t.toLowerCase())
      ?? (f.name === 'din' ? f.optionen?.find((x) => x.titel.toLowerCase() === `din ${t.toLowerCase()}`) : undefined);   // „L“ → „DIN L“ wie bisher
    return o ? o.wert : f.eigeneWerte ? t : undefined;
  }
  if (f.art === 'mehrfach' && f.ziel) return undefined;   // mehrere Verweise: nicht aus Text
  if (f.art === 'mehrfach') {
    const teile = t.toLowerCase().split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    return (f.optionen ?? []).filter((o) => teile.some((x) => x === o.titel.toLowerCase() || x === o.wert.toLowerCase() || o.titel.toLowerCase().startsWith(x))).map((o) => o.wert).join(',');
  }
  return t;
}

/** Reihe wie beim Ausfüllkästchen in Excel: aus den Quellwerten n weitere. Zahlen (zwei und mehr: mit ihrem Abstand) und Text mit
 *  Zahl am Ende („T 07“) zählen hoch; sonst wird wiederholt. umkehren (Strg) dreht das um: Zahlen werden kopiert, Text zählt. */
export function reiheFortsetzen(quelle: string[], n: number, umkehren = false): string[] {
  const zahl = (s: string) => /^-?\d+([.,]\d+)?$/.test(s.trim()) ? Number(s.trim().replace(',', '.')) : null;
  const zahlen = quelle.map(zahl);
  const nurZahlen = quelle.length > 0 && zahlen.every((x) => x !== null);
  const endziffer = (s: string) => /^(.*?)(\d+)(\D*)$/.exec(s);
  const zaehlen = nurZahlen ? !umkehren : quelle.length === 1 && !!endziffer(quelle[0]!) ? !umkehren : umkehren && quelle.every((s) => !!endziffer(s));
  if (!zaehlen) return Array.from({ length: n }, (_, i) => quelle[i % quelle.length] ?? '');
  if (nurZahlen) {
    const z = zahlen as number[], schritt = z.length > 1 ? z[z.length - 1]! - z[z.length - 2]! : 1;
    return Array.from({ length: n }, (_, i) => String(Math.round((z[z.length - 1]! + schritt * (i + 1)) * 1e6) / 1e6).replace('.', ','));
  }
  const m = endziffer(quelle[quelle.length - 1]!)!;
  return Array.from({ length: n }, (_, i) => m[1]! + String(Number(m[2]) + i + 1).padStart(m[2]!.length, '0') + m[3]!);
}

/** Text aus der Zwischenablage (Excel: Tabulator zwischen Zellen, Zeilenumbruch zwischen Zeilen; Zellen in Anführungszeichen dürfen Umbrüche enthalten). */
export function tabellenText(text: string): string[][] {
  const zeilen: string[][] = []; let zeile: string[] = [], zelle = '', inAnf = false;
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inAnf) { if (c === '"' && t[i + 1] === '"') { zelle += '"'; i++; } else if (c === '"') inAnf = false; else zelle += c; continue; }
    if (c === '"' && zelle === '') inAnf = true;
    else if (c === '\t') { zeile.push(zelle); zelle = ''; }
    else if (c === '\n') { zeile.push(zelle); zeilen.push(zeile); zeile = []; zelle = ''; }
    else zelle += c;
  }
  zeile.push(zelle); zeilen.push(zeile);
  return zeilen;
}
/** Zellen → Text für die Zwischenablage (wie Excel). */
export const alsTabellenText = (zellen: string[][]): string => zellen.map((z) => z.map((x) => (/[\t\n"]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join('\t')).join('\n');
