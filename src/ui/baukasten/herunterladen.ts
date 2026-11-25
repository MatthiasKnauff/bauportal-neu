// Baustein „Herunterladen“: eine Datei aus dem Browser speichern (Export aus Tabellen, Plänen …).

export function herunterladen(inhalt: string | Blob, name: string, typ = 'application/octet-stream'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: typ }));
  a.download = name.replace(/[\\/:*?"<>|]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

