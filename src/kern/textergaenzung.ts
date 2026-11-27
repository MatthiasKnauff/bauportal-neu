// (liegt im Kern: der LV-Block des Druckwerks und GAEB kennen das Feld)
// Bietertextergänzungen im Langtext (wie im bisherigen Bauportal, GAEB „Textergänzung der Bieter:in“): ein Feld
// [[Bieter: Frage]] bzw. [[Bieter: Frage | Vorschlag]] – die Bieter:in füllt es im Angebot aus (z. B. angebotenes Fabrikat).
// Mit Vorschlag erscheint er „oder gleichwertig“; lässt die Bieter:in das Feld leer, gilt der Vorschlag als angeboten.
// Ergänzungen des Büros ([[Büro: Frage = Wert]]) legt man nicht mehr an – aus Vorlagen und GAEB bleiben sie lesbar.

export interface Ergaenzung { anfang: number; ende: number; art: 'bieter' | 'buero'; frage: string; wert: string }
const MUSTER = /\[\[(Bieter|Büro|Buero):\s*([^\]|=]*?)\s*(?:([|=])\s*([^\]]*?)\s*)?\]\]/g;

/** Alle Ergänzungen eines Langtexts. */
export function ergaenzungen(text: string): Ergaenzung[] {
  const aus: Ergaenzung[] = [];
  for (const m of text.matchAll(MUSTER)) aus.push({ anfang: m.index!, ende: m.index! + m[0].length, art: m[1] === 'Bieter' ? 'bieter' : 'buero', frage: m[2]!, wert: m[4] ?? '' });
  return aus;
}
/** Die Ergänzung an einer Stelle (Schreibmarke) – oder keine. */
export const ergaenzungBei = (text: string, stelle: number) => ergaenzungen(text).find((e) => stelle >= e.anfang && stelle <= e.ende);
/** Das Feld als Text. */
export const bieterFeld = (frage: string, vorschlag = '') => `[[Bieter: ${frage.trim()}${vorschlag.trim() ? ` | ${vorschlag.trim()}` : ''}]]`;
/** Fragt die Angabe nach Hersteller, Fabrikat oder Typ? Dann bietet sich ein Vorschlag des Büros an. */
export const fragtNachProdukt = (frage: string) => /hersteller|fabrikat|typ\b|produkt/i.test(frage);
/** Vorbelegung des Felds der Bieter:in: 20 Punkte (27.11.2026) – im Ausdruck und im GAEB-Feld; wer sie stehen lässt, hat nichts angegeben. */
export const LUECKE = '.'.repeat(20);
const nurLuecke = (t: string) => /^[.…_\s]*$/.test(t);
/** Für den Ausdruck: „Angebotenes Fabrikat: .................... (Vorschlag: X oder gleichwertig)“. */
export function zumDrucken(text: string, linie = LUECKE): string {
  return text.replace(MUSTER, (_g, art: string, frage: string, _z, wert: string | undefined) => art === 'Bieter'
    ? `${frage}: ${linie}${wert ? ` (Vorschlag: ${wert} oder gleichwertig)` : ''}`
    : `${frage}: ${wert || linie}`);
}

// ---------- GAEB DA XML: <TextComplement Kind="Owner"|"Bidder"> mit <ComplCaption> (Ansprechtext) und <ComplBody> (Inhalt) ----------
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (t: string) => (t ? `<span>${xml(t)}</span>` : '');
/** Langtext → Inhalt von <Text>: je Zeile ein Absatz, Felder als TextComplement. Ein Bieter-Feld mit Vorschlag wird – wie
 *  üblich – ein Feld des Büros mit dem Vorschlag „… oder gleichwertig“ und dahinter das Feld der Bieter:in „Angeboten:“. */
export function gaebText(lang: string, antworten: string[] = []): string {
  let k = 0;
  return lang.split('\n').map((zeile) => {
    if (!zeile.trim()) return '<p>&#160;</p>';
    let h = '', pos = 0;
    for (const m of zeile.matchAll(MUSTER)) {
      h += span(zeile.slice(pos, m.index!));
      const frage = m[2]!.trim(), w = (m[4] ?? '').trim();
      if (m[1] === 'Bieter') {
        const a = antworten[k++] ?? '';
        if (w) h += `<TextComplement Kind="Owner"><ComplCaption>${span(`${frage}: `)}</ComplCaption><ComplBody>${span(`${w} oder gleichwertig`)}</ComplBody></TextComplement>`;
        h += `<TextComplement Kind="Bidder"><ComplCaption>${span(w ? 'Angeboten: ' : `${frage}: `)}</ComplCaption><ComplBody>${span(a || LUECKE)}</ComplBody></TextComplement>`;
      } else h += `<TextComplement Kind="Owner"><ComplCaption>${span(`${frage}: `)}</ComplCaption><ComplBody>${span(w)}</ComplBody></TextComplement>`;
      pos = m.index! + m[0].length;
    }
    return `<p>${h + span(zeile.slice(pos))}</p>`;
  }).join('') || '<p></p>';
}

/** Ein gelesenes TextComplement → Feld im Langtext (Zwischenmarke, s. gaebZusammen) und die Antwort der Bieter:in. */
export function gaebFeld(kind: string, ansprechtext: string, inhalt: string): { marke: string; antwort: string | null } {
  const frage = ansprechtext.trim().replace(/:$/, '').trim(), body = nurLuecke(inhalt) ? '' : inhalt.trim();
  if (kind.toLowerCase() === 'bidder') return frage.toLowerCase() === 'angeboten' ? { marke: '\u0000B\u0000', antwort: body } : { marke: `[[Bieter: ${frage}]]`, antwort: body };
  if (/oder gleichwertig$/.test(body)) return { marke: `\u0000V${frage}\u0000${body.replace(/\s*oder gleichwertig$/, '')}\u0000`, antwort: null };
  return { marke: body ? `[[Büro: ${frage} = ${body}]]` : `[[Büro: ${frage}]]`, antwort: null };
}
/** Vorschlag des Büros + „Angeboten“ der Bieter:in wieder zu einem Bieter-Feld mit Vorschlag. */
export function gaebZusammen(text: string): string {
  return text.replace(/\u0000V([^\u0000]*)\u0000([^\u0000]*)\u0000\s*\u0000B\u0000/g, (_g, f: string, v: string) => `[[Bieter: ${f} | ${v}]]`)
    .replace(/\u0000V([^\u0000]*)\u0000([^\u0000]*)\u0000/g, (_g, f: string, v: string) => `[[Büro: ${f} = ${v} oder gleichwertig]]`)
    .replace(/\u0000B\u0000/g, '[[Bieter: Angeboten]]');
}
