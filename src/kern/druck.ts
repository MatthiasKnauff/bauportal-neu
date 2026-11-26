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
  | { id: string; art: 'text'; feld: string }                          // langer Text mit Überschrift, über mehrere Seiten
  // Tabelle der Einträge, die am Objekt hängen (z. B. die Mängel eines Berichts): objekt.ueber verweist auf das gedruckte Objekt
  | { id: string; art: 'liste'; objekt: string; ueber: string; filter?: Werte; titel: string; spalten: string[] }
  // Bilder, die am Objekt hängen – zwei nebeneinander, nie beschnitten, mit Beschriftung
  | { id: string; art: 'bilder'; objekt: string; ueber: string; titel: string; beschriftung: string }
  // Verzeichnis: die gewählten bzw. gefilterten Einträge des Objekts selbst als Tabelle (z. B. Adressverzeichnis)
  | { id: string; art: 'verzeichnis'; titel: string; spalten: string[] }
  // Unterschriften (z. B. Bauvertrag): je Partei eine Linie mit „Ort, Datum“ und der Rolle darunter; {feld} wird ersetzt
  | { id: string; art: 'unterschriften'; parteien: string[] };

export interface Ausdruck {
  id: string;              // eindeutig, z. B. "bautagebuch.tagesbericht"
  titel: string;           // Name des Ausdrucks in der Oberfläche
  objekt: string;          // was gedruckt wird
  dateiname: string;       // Vorschlag für die PDF-Datei; {feld} wird ersetzt
  fuss: string;            // Fußzeile links; {feld} wird ersetzt. Rechts steht immer „Seite x von y“.
  ordner?: string;         // Unterordner im Projektordner, in dem das PDF abgelegt wird (einstellbar: Stelle „seite.ordner“)
  vermerk?: string;        // Feld des Objekts, in das nach dem PDF „Datei · Zeitpunkt“ geschrieben wird (z. B. „Als PDF exportiert“)
  bloecke: Druckblock[];
  /** Verzeichnis statt eines einzelnen Eintrags: gedruckt werden viele Einträge (die gefilterte Liste oder die Auswahl).
   *  Platzhalter dann: {anzahl}, {filter}, {datum}, {buero}. */
  verzeichnis?: boolean;
  /** Hoch- oder Querformat ab Werk (einstellbar: Stelle „seite.format“). */
  format?: 'hoch' | 'quer';
}

/** Querformat? Die Einstellung des Büros geht vor, sonst gilt, was der Ausdruck ab Werk hat. */
export const querformat = (a: Ausdruck, e: Einstellungen) => (e['seite.format'] || a.format || 'hoch') === 'quer';
/** Die Spalten eines Verzeichnisses: wie eingestellt (Stelle „<block>.spalten“, Feldnamen mit Komma) oder ab Werk. */
export function verzeichnisSpalten(b: { id: string; spalten: string[] }, m: ObjektModell, e: Einstellungen): string[] {
  const eigen = (e[`${b.id}.spalten`] ?? '').split(',').filter((n) => m.felder.some((f) => f.name === n));
  return eigen.length ? eigen : b.spalten;
}

/** Reihenfolge der Einträge einer Liste: wie eingetragen (Feld „reihe“, wenn das Objekt eins hat) – im Browser und auf dem Server gleich. */
export const listenfolge = (a: { id: string; werte: Werte }, b: { id: string; werte: Werte }): number =>
  (Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Die Einstellungen eines Ausdrucks: Stelle -> Wert. Stellen: „seite.schrift“, „titel.text“, „<block>.aus“, „<block>.<feld>.titel“ … */
export type Einstellungen = Record<string, string>;
export interface Druckdaten {
  werte: Werte;                                    // das Objekt
  buero: Werte;
  logo?: string;                                   // Büro-Logo für den Briefkopf (im Browser eine Adresse, im PDF das Bild selbst)
  projekt: string;                                 // Name des Projekts, '' wenn es keins gibt
  verweis: (ziel: string, id: string) => string;   // Anzeigename eines verwiesenen Objekts
  kinder: (blockId: string) => { id: string; werte: Werte }[];   // die Einträge eines Listen- oder Bilder-Blocks, in der Reihenfolge des Ausdrucks
  bild: (id: string) => string;                    // Adresse des Vorschaubilds (im Browser ein Verweis, im PDF das Bild selbst)
  modell: (objekt: string) => ObjektModell;        // Modell der Einträge
  extra?: Record<string, string>;                  // weitere Platzhalter (Verzeichnis: anzahl, filter, datum)
}
export const SCHRIFT: Record<string, { titel: string; pt: number }> = { klein: { titel: 'klein', pt: 9 }, normal: { titel: 'normal', pt: 10.5 }, gross: { titel: 'groß', pt: 12 } };
/** Seitenränder in mm – in der Vorschau der Rand des Blatts, im PDF der Rand der Seite. */
export const RAND = { oben: 18, seite: 18, unten: 20 };

/** Name eines Objekts, wie er überall dasteht (Karte, Suche, Verweise, Rückgängig): das Anzeigefeld, sonst der Ersatzname. */
export function benennen(m: ObjektModell, w: Werte, verweis: (ziel: string, id: string) => string): string {
  const feld = (n: string) => m.felder.find((f) => f.name === n)!;
  // ein verborgenes Namensfeld (z. B. die frühere Kurzbeschreibung des Tagesberichts) steht nirgends – dann die Ersatzbenennung
  const haupt = feld(m.anzeigeFeld).verborgen ? '' : feldtext(feld(m.anzeigeFeld), w[m.anzeigeFeld], verweis);
  if (haupt || !m.ersatzName) return haupt;
  return m.ersatzName.map((n) => { const f = feld(n), t = feldtext(f, w[n], verweis); return t && f.art !== 'datum' ? `${f.titel} ${t}` : t; }).filter(Boolean).join(' · ');
}

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
    if (d.extra && k in d.extra) return d.extra[k]!;
    const f = m.felder.find((x) => x.name === k);
    return f ? feldtext(f, d.werte[k], d.verweis) : '';
  }).replace(/\s+/g, ' ').trim();
}

/** Platzhalter, die ein Text dieses Ausdrucks verwenden kann – für die Erklärung im Einstellfeld. */
export const platzhalter = (m: ObjektModell): string[] => ['buero', 'projekt', ...m.felder.filter((f) => f.art !== 'verweis' && f.art !== 'langtext' && !f.verborgen).map((f) => f.name)];

export const CSS = (schrift: number) => `
  .seite { font: ${schrift}pt/1.4 Arial, "Liberation Sans", Helvetica, sans-serif; color: #111; }
  .seite * { box-sizing: border-box; }
  .briefkopf { display: flex; justify-content: space-between; align-items: center; gap: 12mm; padding-bottom: 3mm; border-bottom: .4mm solid #111; margin-bottom: 7mm; }
  .briefkopf .logo { max-height: 16mm; max-width: 45mm; object-fit: contain; margin-right: -6mm; }
  .briefkopf .buero { flex: 1; }
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
  .unterschriften { display: flex; gap: 14mm; margin-top: 16mm; break-inside: avoid; }
  .unterschriften > div { flex: 1; }
  .unterschriften .linie { display: block; border-bottom: .3mm solid #111; height: 14mm; }
  .unterschriften small { color: #444; }
  .textblock h2 { font-size: 1.05em; margin: 0 0 1mm; break-after: avoid; }
  .textblock p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .liste { margin-bottom: 5mm; }
  .liste h2 { font-size: 1.05em; margin: 0 0 1mm; break-after: avoid; }
  .liste table { width: 100%; border-collapse: collapse; }
  .liste th { text-align: left; font-weight: 400; color: #444; font-size: .9em; border-bottom: .3mm solid #111; padding: .8mm 2mm .8mm 0; }
  .liste td { vertical-align: top; border-bottom: .2mm solid #ccc; padding: 1.2mm 2mm 1.2mm 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .liste tr { break-inside: avoid; }
  .liste .schmal { width: 1%; white-space: nowrap; }
  .bilder h2 { font-size: 1.05em; margin: 0 0 2mm; break-after: avoid; }
  .bildraster { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; }
  .bilder.eins .bildraster { grid-template-columns: 1fr; }
  .bildraster figure { margin: 0; break-inside: avoid; }
  .bildraster img { display: block; width: 100%; height: auto; max-height: 110mm; object-fit: contain; object-position: left top; }
  .bilder.eins .bildraster img { max-height: 200mm; }
  .bildraster figcaption { font-size: .9em; color: #333; padding-top: 1mm; min-height: 1em; }
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
      return huelle(b.id, 'briefkopf', `${d.logo ? `<img class="logo" src="${sicher(d.logo)}" alt="">` : ''}<div class="buero"><b>${sicher(String(d.buero.name || 'Büro'))}</b><small>${sicher(anschrift)}${anschrift && draht ? '<br>' : ''}${sicher(draht)}</small></div>${d.projekt ? `<div class="rechts"><small>Projekt</small><b>${sicher(d.projekt)}</b></div>` : ''}`);
    }
    if (b.art === 'titel') {
      const unter = einsetzen(e[`${b.id}.unter`] ?? b.unter ?? '', m, d);
      return huelle(b.id, 'titelblock', `<h1 data-stelle="${b.id}.text">${sicher(einsetzen(e[`${b.id}.text`] || b.text, m, d))}</h1>${unter || bearbeiten ? `<div class="unter" data-stelle="${b.id}.unter">${sicher(unter) || '&nbsp;'}</div>` : ''}`);
    }
    if (b.art === 'felder') {
      // Angaben ohne Wert stehen nicht im Ausdruck (in der Vorschau zum Einstellen bleiben sie sichtbar)
      const mitWert = (n: string) => bearbeiten || feld(n).art === 'ja_nein' || (d.werte[n] !== '' && d.werte[n] != null && feldtext(feld(n), d.werte[n], d.verweis) !== '');
      return huelle(b.id, 'felder', b.felder.filter(mitWert).map((n) => huelle(`${b.id}.${n}`, 'zeile', `<dt>${sicher(e[`${b.id}.${n}.titel`] || feld(n).titel)}</dt><dd>${sicher(feld(n).art === 'ja_nein' ? (d.werte[n] ? 'Ja' : 'Nein') : feldtext(feld(n), d.werte[n], d.verweis)) || '–'}</dd>`)).join(''), 'dl');
    }
    if (b.art === 'unterschriften') {
      return huelle(b.id, 'unterschriften', b.parteien.map((t) => `<div><span class="linie"></span><small>Ort, Datum · ${sicher(einsetzen(t, m, d))}</small></div>`).join(''));
    }
    if (b.art === 'liste' || b.art === 'verzeichnis') {
      const k = b.art === 'liste' ? d.modell(b.objekt) : m;
      const zeilen = d.kinder(b.id);
      if (!zeilen.length && !bearbeiten && e[`${b.id}.leer`] !== 'ja') return '';
      const spalten = (b.art === 'verzeichnis' ? verzeichnisSpalten(b, k, e) : b.spalten).map((n) => k.felder.find((f) => f.name === n)!).filter((f) => bearbeiten || !aus(`${b.id}.${f.name}`));
      // schmale Spalten: alles außer langen Texten und Verweisen
      const schmal = (f: Feld) => (f.art === 'langtext' || f.art === 'text' || f.art === 'verweis' ? '' : ' schmal');
      const kopf = spalten.map((f) => `<th class="${aus(`${b.id}.${f.name}`) ? 'aus' : ''}${schmal(f)}" data-stelle="${b.id}.${f.name}">${sicher(e[`${b.id}.${f.name}.titel`] || f.titel)}</th>`).join('');
      const rumpf = zeilen.map(({ werte: z }) => `<tr>${spalten.map((f) => `<td class="${aus(`${b.id}.${f.name}`) ? 'aus' : ''}${schmal(f)}">${sicher(f.art === 'ja_nein' ? (z[f.name] ? '✓' : '') : feldtext(f, z[f.name], d.verweis))}</td>`).join('')}</tr>`).join('');
      return huelle(b.id, `liste${zeilen.length ? '' : ' leer'}`, `<h2>${sicher(e[`${b.id}.titel`] || b.titel)}</h2><table><thead><tr>${kopf}</tr></thead><tbody>${rumpf || `<tr><td colspan="${spalten.length}">–</td></tr>`}</tbody></table>`);
    }
    if (b.art === 'bilder') {
      const bilder = d.kinder(b.id);
      if (!bilder.length && !bearbeiten) return '';
      const eins = e[`${b.id}.spalten`] === '1';
      return huelle(b.id, `bilder${bilder.length ? '' : ' leer'}${eins ? ' eins' : ''}`, `<h2>${sicher(e[`${b.id}.titel`] || b.titel)}</h2><div class="bildraster">${
        bilder.map((z) => `<figure><img src="${sicher(d.bild(z.id))}" alt=""><figcaption>${sicher(String(z.werte[b.beschriftung] ?? ''))}</figcaption></figure>`).join('') || '–'}</div>`);
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
  @page { size: A4${querformat(a, e) ? ' landscape' : ''}; margin: ${RAND.oben}mm ${RAND.seite}mm ${RAND.unten}mm;
    @bottom-left { content: "${fuss}"; font: 8pt Arial, "Liberation Sans", Helvetica, sans-serif; color: #444; }
    @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt Arial, "Liberation Sans", Helvetica, sans-serif; color: #444; } }
  html, body { margin: 0; padding: 0; }
  ${CSS(schriftgroesse(e))}</style></head><body><div class="seite">${druckInhalt(a, m, d, e)}</div></body></html>`;
}
