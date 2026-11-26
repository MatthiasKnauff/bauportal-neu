// Excel-Datei (.xlsx) schreiben – ohne Bibliothek, im Browser wie auf dem Server gleich. Eine Tabelle: erste Zeile fett und
// fixiert, mit Autofilter, Spaltenbreiten nach Inhalt. Zahlen bleiben Zahlen, Daten werden echte Excel-Daten (TT.MM.JJJJ).
// Gegenstück zum Lesen in tabellendatei.ts. Die ZIP-Hülle ist unkomprimiert („stored“) – Excel öffnet sie ohne Weiteres.

export type Zelle = string | number | boolean | Date | null | undefined;

const TABELLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(d: Uint8Array): number { let c = 0xffffffff; for (const b of d) c = TABELLE[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** ZIP ohne Kompression aus Dateien (Name → Inhalt). */
export function zip(dateien: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder(), teile: Uint8Array[] = [], verzeichnis: Uint8Array[] = [];
  let ort = 0;
  for (const [name, inhalt] of dateien) {
    const n = enc.encode(name), crc = crc32(inhalt);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, 0x0800, true);   // UTF-8-Namen
    kopf.setUint32(14, crc, true); kopf.setUint32(18, inhalt.length, true); kopf.setUint32(22, inhalt.length, true); kopf.setUint16(26, n.length, true);
    teile.push(new Uint8Array(kopf.buffer), n, inhalt);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true);
    z.setUint32(16, crc, true); z.setUint32(20, inhalt.length, true); z.setUint32(24, inhalt.length, true); z.setUint16(28, n.length, true); z.setUint32(42, ort, true);
    verzeichnis.push(new Uint8Array(z.buffer), n);
    ort += 30 + n.length + inhalt.length;
  }
  const groesse = verzeichnis.reduce((s, x) => s + x.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, dateien.length, true); ende.setUint16(10, dateien.length, true); ende.setUint32(12, groesse, true); ende.setUint32(16, ort, true);
  const alle = [...teile, ...verzeichnis, new Uint8Array(ende.buffer)];
  const aus = new Uint8Array(alle.reduce((s, x) => s + x.length, 0));
  let i = 0; for (const x of alle) { aus.set(x, i); i += x.length; }
  return aus;
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const spalte = (i: number): string => (i >= 26 ? spalte(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
/** Excel zählt Tage seit dem 30.12.1899. */
const serie = (d: Date) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);

/** Eine Tabelle als .xlsx – erste Zeile ist die Kopfzeile. */
export function xlsxSchreiben(zeilen: Zelle[][], blatt = 'Tabelle1'): Uint8Array<ArrayBuffer> {
  const breite: number[] = [];
  const zellen = zeilen.map((r, z) => `<row r="${z + 1}">${r.map((w, s) => {
    const ref = `${spalte(s)}${z + 1}`, text = w instanceof Date ? '00.00.0000' : String(w ?? '');
    breite[s] = Math.max(breite[s] ?? 6, Math.min(60, text.length + 2));
    const stil = z === 0 ? ' s="1"' : '';
    if (w == null || w === '') return z === 0 ? `<c r="${ref}"${stil}/>` : '';
    if (typeof w === 'number' && Number.isFinite(w)) return `<c r="${ref}"${stil}><v>${w}</v></c>`;
    if (w instanceof Date) return `<c r="${ref}" s="2"><v>${serie(w)}</v></c>`;
    if (typeof w === 'boolean') return `<c r="${ref}" t="b"${stil}><v>${w ? 1 : 0}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${stil}><is><t xml:space="preserve">${xml(String(w))}</t></is></c>`;
  }).join('')}</row>`).join('');
  const sp = spalte(Math.max(0, (zeilen[0]?.length ?? 1) - 1)), anzahl = Math.max(1, zeilen.length), letzte = `${sp}${anzahl}`;
  const name = blatt.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ');
  const enc = new TextEncoder(), x = (t: string) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${t}`);
  const NS = 'http://schemas.openxmlformats.org';
  return zip([
    ['[Content_Types].xml', x(`<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`)],
    ['_rels/.rels', x(`<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)],
    ['xl/workbook.xml', x(`<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="${xml(name)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(name.replace(/'/g, "''"))}'!$A$1:$${sp}$${anzahl}</definedName></definedNames></workbook>`)],
    ['xl/_rels/workbook.xml.rels', x(`<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)],
    ['xl/styles.xml', x(`<styleSheet xmlns="${NS}/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`)],
    ['xl/worksheets/sheet1.xml', x(`<worksheet xmlns="${NS}/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${breite.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join('')}</cols><sheetData>${zellen}</sheetData><autoFilter ref="A1:${letzte}"/></worksheet>`)],
  ]);
}
