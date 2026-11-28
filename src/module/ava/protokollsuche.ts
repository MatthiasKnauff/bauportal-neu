// „Im Ordner suchen“ an der Angebotsbesprechung (wie bisher): im Projektordner das ausgefüllte, unterschriebene Protokoll finden –
// Dateinamen mit „Besprechung“/„Verhandlung“ (oder „Protokoll“), dem Namen der Bieter:in und dem Gewerk im Pfad; beste Treffer zuerst.

export interface Fund { pfad: string; name: string; punkte: number; geaendert: string }

const klein = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ');
const NICHT = new Set(['gmbh', 'bau', 'und']);

export function protokollSuchen(dateien: { pfad: string; geaendert: string }[], bieter: string, gewerk: string): Fund[] {
  const worte = klein(bieter).split(' ').filter((w) => w.length > 3 && !NICHT.has(w)).slice(0, 3);
  const gw = klein(gewerk).split(' ').filter((w) => w.length > 3).slice(0, 2);
  return dateien.filter((d) => /\.(pdf|jpe?g|png|heic|tiff?)$/i.test(d.pfad)).map((d) => {
    const name = d.pfad.split('/').pop()!, n = klein(name), p = klein(d.pfad);
    const punkte = (/besprech|verhandl/.test(n) ? 3 : n.includes('protokoll') ? 1 : 0) + 2 * worte.filter((w) => n.includes(w)).length
      + gw.filter((w) => p.includes(w)).length + (p.includes('angebot') ? 1 : 0);
    return { pfad: d.pfad, name, punkte, geaendert: d.geaendert };
  }).filter((f) => f.punkte >= 3).sort((a, b) => b.punkte - a.punkte || b.geaendert.localeCompare(a.geaendert)).slice(0, 8);
}
