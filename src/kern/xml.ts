// Ein kleiner XML-Leser ohne Zusatzbibliothek: Elemente (Name ohne Namensraum), Eigenschaften, Text – genug für Austauschformate
// wie GAEB DA XML. Kommentare, Verarbeitungsanweisungen und DOCTYPE werden übersprungen, CDATA und Entitäten aufgelöst.
// Reine Textfunktion: läuft im Browser und auf dem Server gleich.

export interface XmlKnoten { name: string; attr: Record<string, string>; kinder: XmlKnoten[]; text: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const entitaeten = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);
const ohneNs = (n: string) => n.slice(n.indexOf(':') + 1);

export class XmlFehler extends Error {}

/** Liest ein XML-Dokument; liefert das Wurzelelement. text: aller Text direkt im Element (ohne Kinder), hintereinander. */
export function xmlLesen(quelle: string): XmlKnoten {
  const wurzel: XmlKnoten = { name: '', attr: {}, kinder: [], text: '' };
  const stapel: XmlKnoten[] = [wurzel];
  let i = 0;
  const n = quelle.length;
  while (i < n) {
    const lt = quelle.indexOf('<', i);
    const textEnde = lt < 0 ? n : lt;
    if (textEnde > i) stapel[stapel.length - 1]!.text += entitaeten(quelle.slice(i, textEnde));
    if (lt < 0) break;
    if (quelle.startsWith('<!--', lt)) { const e = quelle.indexOf('-->', lt + 4); if (e < 0) throw new XmlFehler('Kommentar ohne Ende'); i = e + 3; continue; }
    if (quelle.startsWith('<![CDATA[', lt)) { const e = quelle.indexOf(']]>', lt + 9); if (e < 0) throw new XmlFehler('CDATA ohne Ende'); stapel[stapel.length - 1]!.text += quelle.slice(lt + 9, e); i = e + 3; continue; }
    if (quelle.startsWith('<?', lt)) { const e = quelle.indexOf('?>', lt + 2); if (e < 0) throw new XmlFehler('Anweisung ohne Ende'); i = e + 2; continue; }
    if (quelle.startsWith('<!', lt)) { const e = quelle.indexOf('>', lt + 2); if (e < 0) throw new XmlFehler('Deklaration ohne Ende'); i = e + 1; continue; }
    const gt = (() => { let q = ''; for (let j = lt + 1; j < n; j++) { const c = quelle[j]!; if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') return j; } return -1; })();
    if (gt < 0) throw new XmlFehler('Element ohne Ende');
    const inhalt = quelle.slice(lt + 1, gt);
    i = gt + 1;
    if (inhalt[0] === '/') {
      const name = ohneNs(inhalt.slice(1).trim());
      const k = stapel.pop();
      if (!k || k.name !== name || !stapel.length) throw new XmlFehler(`Unerwartetes Ende von „${name}“`);
      continue;
    }
    const zu = inhalt.endsWith('/');
    const kopf = zu ? inhalt.slice(0, -1) : inhalt;
    const m = /^([^\s/>]+)/.exec(kopf);
    if (!m) throw new XmlFehler('Element ohne Namen');
    const attr: Record<string, string> = {};
    for (const a of kopf.slice(m[1]!.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attr[ohneNs(a[1]!)] = entitaeten(a[3] ?? a[4] ?? '');
    const k: XmlKnoten = { name: ohneNs(m[1]!), attr, kinder: [], text: '' };
    stapel[stapel.length - 1]!.kinder.push(k);
    if (!zu) stapel.push(k);
  }
  if (stapel.length !== 1) throw new XmlFehler(`„${stapel[stapel.length - 1]!.name}“ ist nicht geschlossen`);
  const w = wurzel.kinder[0];
  if (!w) throw new XmlFehler('Kein Element in der Datei');
  return w;
}

/** Erstes Kind mit diesem Namen (auch über mehrere Stufen: kind(k, 'BoQ', 'BoQInfo')). */
export function kind(k: XmlKnoten | undefined, ...pfad: string[]): XmlKnoten | undefined {
  let x = k;
  for (const p of pfad) x = x?.kinder.find((c) => c.name === p);
  return x;
}
export const kinder = (k: XmlKnoten | undefined, name: string) => k?.kinder.filter((c) => c.name === name) ?? [];
/** Aller Text darin (mit den Kindern), Leerraum zusammengefasst. */
export const alleText = (k: XmlKnoten | undefined): string => (k ? [k.text, ...k.kinder.map(alleText)].join(' ').replace(/\s+/g, ' ').trim() : '');
/** Für Ausgaben: Sonderzeichen maskieren. */
export const xmlText = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
