// Tabellen aus Dateien lesen – CSV (Semikolon, Komma oder Tab; UTF-8 oder Windows-1252) und Excel (.xlsx, erstes Blatt) –
// ohne Zusatzbibliothek: Excel ist ein ZIP mit XML darin; entpackt wird mit dem eingebauten DecompressionStream.
// Läuft im Browser und in Node gleich. Ergebnis: Kopfzeile und Zeilen als Text.
import { kind, kinder, xmlLesen, type XmlKnoten } from './xml';

/** Text einer Zelle genau so, wie er steht (Zeilenumbrüche und Leerzeichen bleiben): alle <t> darin hintereinander, ohne Lautschrift (<rPh>). */
const zellText = (k: XmlKnoten | undefined): string => (!k || k.name === 'rPh' ? '' : k.name === 't' || k.name === 'v' ? k.text : k.kinder.map(zellText).join(''));

export interface Tabelle { kopf: string[]; zeilen: string[][] }

/** CSV-Text in Zeilen und Zellen; das Trennzeichen wird an der ersten Zeile erkannt. */
export function csvLesen(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const erste = t.slice(0, t.search(/\r?\n|$/));
  const trenn = [';', '\t', ','].map((z) => [z, erste.split(z).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const zeilen: string[][] = [];
  let zeile: string[] = [], zelle = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { zelle += '"'; i++; } else inQ = false; } else zelle += c;
    } else if (c === '"') inQ = true;
    else if (c === trenn) { zeile.push(zelle); zelle = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; zeile.push(zelle); zeilen.push(zeile); zeile = []; zelle = ''; }
    else zelle += c;
  }
  if (zelle || zeile.length) { zeile.push(zelle); zeilen.push(zeile); }
  return zeilen.filter((z) => z.some((x) => x.trim()));
}

/** Text einer Datei: UTF-8, sonst (ungültige Zeichen) Windows-1252 wie bei älteren Excel-CSV. */
function textAus(b: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

/** Die Einträge eines ZIP (zentrales Verzeichnis), entpackt nach Bedarf. */
async function zipLesen(b: Uint8Array): Promise<Map<string, () => Promise<Uint8Array>>> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let ende = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { ende = i; break; }
  if (ende < 0) throw new Error('Die Datei ist kein Excel-Dokument (.xlsx).');
  const anzahl = dv.getUint16(ende + 10, true);
  let p = dv.getUint32(ende + 16, true);
  const aus = new Map<string, () => Promise<Uint8Array>>();
  for (let n = 0; n < anzahl; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const art = dv.getUint16(p + 10, true), groesse = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), kl = dv.getUint16(p + 32, true), lokal = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    aus.set(name, async () => {
      const start = lokal + 30 + dv.getUint16(lokal + 26, true) + dv.getUint16(lokal + 28, true);
      const roh = b.subarray(start, start + groesse);
      if (art === 0) return roh;
      if (art !== 8) throw new Error('Unbekannte Packart in der Excel-Datei.');
      const s = new Blob([roh as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    });
    p += 46 + nl + xl + kl;
  }
  return aus;
}

/** Spalte aus einem Zellbezug: „C12“ → 2. */
const spalte = (ref: string) => { let n = 0; for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

/** Erstes Blatt einer Excel-Datei als Zeilen. */
export async function xlsxLesen(b: Uint8Array): Promise<string[][]> {
  const zip = await zipLesen(b);
  const lies = async (n: string) => { const f = zip.get(n); return f ? new TextDecoder().decode(await f()) : ''; };
  const geteilt = (await lies('xl/sharedStrings.xml')) ? kinder(xmlLesen(await lies('xl/sharedStrings.xml')), 'si').map((si) => zellText(si)) : [];
  // erstes Blatt laut Mappe (workbook.xml → rels), sonst sheet1
  let blatt = 'xl/worksheets/sheet1.xml';
  try {
    const rid = kind(xmlLesen(await lies('xl/workbook.xml')), 'sheets', 'sheet')?.attr.id;
    const ziel = kinder(xmlLesen(await lies('xl/_rels/workbook.xml.rels')), 'Relationship').find((r) => r.attr.Id === rid)?.attr.Target;
    if (ziel) blatt = `xl/${ziel.replace(/^\/?xl\//, '')}`;
  } catch { /* einfache Dateien ohne Verweise: sheet1 */ }
  const daten = kind(xmlLesen(await lies(blatt)), 'sheetData');
  return kinder(daten, 'row').map((r) => {
    const z: string[] = [];
    for (const c of kinder(r, 'c')) {
      const v = zellText(kind(c, 'v')).trim(), typ = c.attr.t;
      const w = typ === 's' ? geteilt[Number(v)] ?? '' : typ === 'inlineStr' ? zellText(kind(c, 'is')) : v;
      z[c.attr.r ? spalte(c.attr.r) : z.length] = w;
    }
    return Array.from(z, (x) => x ?? '');
  }).filter((z) => z.some((x) => x.trim()));
}

/** Liest eine Tabellendatei (nach der Endung): erste Zeile = Kopf. */
export async function tabelleLesen(name: string, b: Uint8Array): Promise<Tabelle> {
  const zeilen = /\.xls[xm]$/i.test(name) ? await xlsxLesen(b) : csvLesen(textAus(b));
  if (!zeilen.length) throw new Error('In der Datei stehen keine Zeilen.');
  const breite = Math.max(...zeilen.map((z) => z.length));
  const voll = zeilen.map((z) => Array.from({ length: breite }, (_, i) => (z[i] ?? '').trim()));
  return { kopf: voll[0]!, zeilen: voll.slice(1) };
}
