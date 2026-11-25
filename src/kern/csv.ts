// CSV, das Excel mit Umlauten und Spalten direkt öffnet: UTF-8 mit BOM, Semikolon, Zeilenende CRLF.
export function csv(zeilen: unknown[][]): string {
  const zelle = (w: unknown) => { const t = String(w ?? ''); return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '\uFEFF' + zeilen.map((r) => r.map(zelle).join(';')).join('\r\n') + '\r\n';
}
