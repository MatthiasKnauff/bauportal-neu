// Passt das Gewerk einer Firma (frei geschrieben: „Dachdecker“, „Heizung/Sanitär“) zum Gewerk eines LV nach VOB/C
// („Dachdeckungs- und Dachabdichtungsarbeiten“)? Verglichen werden Wortstämme, dazu wenige feste Zuordnungen für Wörter,
// die im VOB/C-Namen gar nicht vorkommen (Sanitär → Wasser, Rohbau → Mauer/Beton …). Für die Bieter-Wahl.

const FUELL = new Set(['und', 'oder', 'von', 'an', 'in', 'im', 'mit', 'ohne', 'aus', 'für', 'der', 'die', 'das', 'zum', 'zur', 'innerhalb', 'außerhalb', 'gebäuden', 'arbeiten', 'anlagen', 'bau', 'technische']);
/** Endungen von Berufen und Tätigkeiten – „Dachdecker“ und „Dachdeckung“ haben denselben Stamm */
const ENDUNGEN = ['arbeiten', 'anlagen', 'ungs', 'ung', 'leger', 'bauer', 'technik', 'ers', 'er', 'en', 'e', 's'];
/** Firmen-Wörter, die im VOB/C-Namen nicht stehen → Stämme, die dort stehen */
const AUCH: Record<string, string> = {
  sanitär: 'Wasser Entwässerung', shk: 'Wasser Heizung', heizungsbauer: 'Heizung', rohbau: 'Mauer Beton', maurer: 'Mauer Beton',
  schreiner: 'Tischler', fenster: 'Tischler Metallbau', fensterbau: 'Tischler Metallbau', lüftung: 'Raumluft', klima: 'Raumluft',
  elektriker: 'Elektro', boden: 'Bodenbelag Parkett Estrich', abbruch: 'Abbruch Rückbau',
};

function staemme(text: string): string[] {
  return text.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length >= 3 && !FUELL.has(w)).map((w) => {
    for (const e of ENDUNGEN) if (w.length - e.length >= 4 && w.endsWith(e)) return w.slice(0, -e.length);
    return w;
  });
}
const gleich = (a: string, b: string) => { const n = Math.min(a.length, b.length); return n >= 4 && a.slice(0, n) === b.slice(0, n); };

/** true, wenn eines der Gewerke der Firma (durch Komma, Semikolon oder „/“ getrennt) zum VOB/C-Namen passt. */
export function gewerkPasst(firmaGewerk: string, vobName: string): boolean {
  const lv = staemme(vobName);
  if (!lv.length) return false;
  return firmaGewerk.split(/\s*[,;/]\s*/).some((teil) => {
    const roh = teil.toLowerCase().trim();
    const f = staemme(`${teil} ${AUCH[roh] ?? ''}`);
    return f.some((a) => lv.some((b) => gleich(a, b)));
  });
}
