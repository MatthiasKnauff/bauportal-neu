// Schrift: Arial bzw. die maßgleiche Liberation Sans (im Druckdienst) – so brechen Vorschau und PDF gleich um.
// Druckwerk: EIN Weg vom Objekt zum Ausdruck – dieselbe Seite für die Vorschau im Browser und für das PDF.
// Ein Modul beschreibt seinen Ausdruck im Beipackzettel als Folge von Blöcken; das Büro stellt daran, was es will
// (Beschriftungen, Texte, ein/aus, Schriftgröße) – jede Einstellung ist ein Eintrag „druckeinstellung“ und damit
// ein Befehl wie alles andere (Rückgängig, Abgleich). Reine Textfunktion: läuft im Browser und auf dem Server gleich.
import type { Feld, ObjektModell, Wert, Werte } from './modell';

export type Druckblock =
  | { id: string; art: 'briefkopf' }                                   // Büro links, Projekt rechts
  | { id: string; art: 'titel'; text: string; unter?: string }         // Überschrift; {feld} wird ersetzt
  | { id: string; art: 'felder'; felder: string[] }                    // Beschriftung + Wert, nebeneinander
  | { id: string; art: 'text'; feld: string };                         // langer Text mit Überschrift, über mehrere Seiten

export interface Ausdruck {
  id: string;              // eindeutig, z. B. "bautagebuch.tagesbericht"
  titel: string;           // Name des Ausdrucks in der Oberfläche
  objekt: string;          // was gedruckt wird
  dateiname: string;       // Vorschlag für die PDF-Datei; {feld} wird ersetzt
  fuss: string;            // Fußzeile links; {feld} wird ersetzt. Rechts steht immer „Seite x von y“.
  bloecke: Druckblock[];
}

/** Die Einstellungen eines Ausdrucks: Stelle -> Wert. Stellen: „seite.schrift“, „titel.text“, „<block>.aus“, „<block>.<feld>.titel“ … */
export type Einstellungen = Record<string, string>;
export interface Druckdaten {
  werte: Werte;                                    // das Objekt
  buero: Werte;
  projekt: string;                                 // Name des Projekts, '' wenn es keins gibt
  verweis: (ziel: string, id: string) => string;   // Anzeigename eines verwiesenen Objekts
}
export const SCHRIFT: Record<string, { titel: string; pt: number }> = { klein: { titel: 'klein', pt: 9 }, normal: { titel: 'normal', pt: 10.5 }, gross: { titel: 'groß', pt: 12 } };
/** Seitenränder in mm – in der Vorschau der Rand des Blatts, im PDF der Rand der Seite. */
export const RAND = { oben: 18, seite: 18, unten: 20 };

/** Wert so, wie er für Menschen dasteht – in Tabellen, Karten und Ausdrucken gleich. */
export function feldtext(f: Feld, w: Wert | undefined, verweis: (ziel: string, id: string) => string): string {
  if (w === null || w === undefined) return '';
  if (f.art === 'auswahl') return f.optionen?.find((o) => o.wert === w)?.titel ?? String(w);
  if (f.art === 'mehrfach') return f.optionen!.filter((o) => String(w).split(',').includes(o.wert)).map((o) => o.titel).join(', ');
  if (f.art === 'ja_nein') return w ? 'Ja' : '';
  if (f.art === 'datum') { const t = String(w); return t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : ''; }
  if (f.art === 'verweis') return verweis(f.ziel!, String(w));
  if (typeof w === 'number') return w.toLocaleString('de', { maximumFractionDigits: 3, useGrouping: f.name !== 'nummer' });
  return String(w);
}

const sicher = (t: string) => t.replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!);

/** Ersetzt {feld} durch den Wert des Objekts, {buero} und {projekt} durch Büro- und Projektnamen. */
export function einsetzen(vorlage: string, m: ObjektModell, d: Druckdaten): string {
  return vorlage.replace(/\{([a-z0-9_]+)\}/g, (_ganz, k: string) => {
    if (k === 'buero') return String(d.buero.name ?? '');
    if (k === 'projekt') return d.projekt;
    const f = m.felder.find((x) => x.name === k);
    return f ? feldtext(f, d.werte[k], d.verweis) : '';
  }).replace(/\s+/g, ' ').trim();
}

/** Platzhalter, die ein Text dieses Ausdrucks verwenden kann – für die Erklärung im Einstellfeld. */
export const platzhalter = (m: ObjektModell): string[] => ['buero', 'projekt', ...m.felder.filter((f) => f.art !== 'verweis' && f.art !== 'langtext').map((f) => f.name)];

export const CSS = (schrift: number) => `
  .seite { font: ${schrift}pt/1.4 Arial, "Liberation Sans", Helvetica, sans-serif; color: #111; }
  .seite * { box-sizing: border-box; }
  .briefkopf { display: flex; justify-content: space-between; gap: 12mm; padding-bottom: 3mm; border-bottom: .4mm solid #111; margin-bottom: 7mm; }
  .briefkopf b { display: block; font-size: 1.15em; }
  .briefkopf .rechts { text-align: right; }
  .briefkopf small, .unter { color: #444; font-size: .9em; }
  h1 { font-size: 1.7em; line-height: 1.2; margin: 0 0 1mm; }
  .titelblock { margin-bottom: 6mm; }
  .felder { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 10mm; margin-bottom: 6mm; break-inside: avoid; }
  .felder div { display: flex; gap: 3mm; border-bottom: .2mm solid #ccc; padding-bottom: 1mm; }
  .felder dt { flex: 0 0 38%; color: #444; }
  .felder dd { margin: 0; flex: 1; font-weight: 600; }
  .textblock { margin-bottom: 5mm; }
  .textblock h2 { font-size: 1.05em; margin: 0 0 1mm; break-after: avoid; }
  .textblock p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .fuss { color: #444; font-size: .85em; }
`;

/**
 * Der Inhalt der Seite. bearbeiten = true (Vorschau mit Einstellen): Ausgeblendetes bleibt blass sichtbar,
 * damit man es wieder einschalten kann; leere Textblöcke stehen als Platzhalter da.
 */
export function druckInhalt(a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen, bearbeiten = false): string {
  const aus = (stelle: string) => e[`${stelle}.aus`] === 'ja';
  const huelle = (stelle: string, klasse: string, innen: string, tag = 'div') =>
    aus(stelle) && !bearbeiten ? '' : `<${tag} class="${klasse}${aus(stelle) ? ' aus' : ''}" data-stelle="${stelle}">${innen}</${tag}>`;
  const feld = (name: string) => m.felder.find((f) => f.name === name)!;
  const teile = a.bloecke.map((b) => {
    if (b.art === 'briefkopf') {
      const anschrift = [d.buero.strasse, [d.buero.plz, d.buero.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      const draht = [d.buero.telefon, d.buero.email].filter(Boolean).join(' · ');
      return huelle(b.id, 'briefkopf', `<div><b>${sicher(String(d.buero.name || 'Büro'))}</b><small>${sicher(anschrift)}${anschrift && draht ? '<br>' : ''}${sicher(draht)}</small></div><div class="rechts"><small>Projekt</small><b>${sicher(d.projekt)}</b></div>`);
    }
    if (b.art === 'titel') {
      const unter = einsetzen(e[`${b.id}.unter`] ?? b.unter ?? '', m, d);
      return huelle(b.id, 'titelblock', `<h1 data-stelle="${b.id}.text">${sicher(einsetzen(e[`${b.id}.text`] || b.text, m, d))}</h1>${unter || bearbeiten ? `<div class="unter" data-stelle="${b.id}.unter">${sicher(unter) || '&nbsp;'}</div>` : ''}`);
    }
    if (b.art === 'felder') {
      return huelle(b.id, 'felder', b.felder.map((n) => huelle(`${b.id}.${n}`, 'zeile', `<dt>${sicher(e[`${b.id}.${n}.titel`] || feld(n).titel)}</dt><dd>${sicher(feldtext(feld(n), d.werte[n], d.verweis)) || '–'}</dd>`)).join(''), 'dl');
    }
    const text = String(d.werte[b.feld] ?? '');
    if (!text && !bearbeiten && e[`${b.id}.leer`] !== 'ja') return '';   // leere Abschnitte fallen weg, wenn nicht anders eingestellt
    return huelle(b.id, `textblock${text ? '' : ' leer'}`, `<h2>${sicher(e[`${b.id}.titel`] || feld(b.feld).titel)}</h2><p>${sicher(text) || '–'}</p>`);
  });
  return teile.join('');
}

export const schriftgroesse = (e: Einstellungen) => (SCHRIFT[e['seite.schrift'] ?? ''] ?? SCHRIFT.normal!).pt;
export const fusszeile = (a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen) => (e['seite.fuss.aus'] === 'ja' ? '' : einsetzen(e['seite.fuss'] || a.fuss, m, d));
export const dateiname = (a: Ausdruck, m: ObjektModell, d: Druckdaten) => (einsetzen(a.dateiname, m, d).replace(/[\\/:*?"<>|]+/g, '-') || a.titel) + '.pdf';

/** Die ganze Seite für das PDF: A4, Ränder, Fußzeile mit Seitenzahl auf jeder Seite. Lädt nichts von außen. */
export function druckSeite(a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen): string {
  const fuss = fusszeile(a, m, d, e).replace(/[\\"]/g, '\\$&');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${sicher(a.titel)}</title><style>
  @page { size: A4; margin: ${RAND.oben}mm ${RAND.seite}mm ${RAND.unten}mm;
    @bottom-left { content: "${fuss}"; font: 8pt Arial, "Liberation Sans", Helvetica, sans-serif; color: #444; }
    @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt Arial, "Liberation Sans", Helvetica, sans-serif; color: #444; } }
  html, body { margin: 0; padding: 0; }
  ${CSS(schriftgroesse(e))}</style></head><body><div class="seite">${druckInhalt(a, m, d, e)}</div></body></html>`;
}
