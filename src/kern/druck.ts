// Schrift: Arial bzw. die maßgleiche Liberation Sans (im Druckdienst) – so brechen Vorschau und PDF gleich um.
// Druckwerk: EIN Weg vom Objekt zum Ausdruck – dieselbe Seite für die Vorschau im Browser und für das PDF.
// Ein Modul beschreibt seinen Ausdruck im Beipackzettel als Folge von Blöcken; das Büro stellt daran, was es will
// (Beschriftungen, Texte, ein/aus, Schriftgröße) – jede Einstellung ist ein Eintrag „druckeinstellung“ und damit
// ein Befehl wie alles andere (Rückgängig, Abgleich). Reine Textfunktion: läuft im Browser und auf dem Server gleich.
import { zumDrucken } from './textergaenzung';
import type { Feld, ObjektModell, Wert, Werte } from './modell';
import { nachOz } from './oz';
import { istHinweis } from './lvarten';

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
  // Leistungsverzeichnis: Titel und Positionen nach OZ mit Kurz- und Langtext, Menge, Einheit, EP/GP – zum Ausfüllen durch die
  // Bieter:in oder mit den geschätzten Preisen (Stelle „<block>.preise“); Titelsummen, Zusammenstellung, Angebotssumme.
  // Die Einträge brauchen oz, art (titel, normal, bedarf, alternativ, pauschal, stundenlohn, hinweis), kurztext, langtext, menge, einheit, ep;
  // ohne: Einträge, bei denen dieses Feld gesetzt ist, gehören nicht dazu (z. B. Nachtragspositionen).
  | { id: string; art: 'lv'; objekt: string; ueber: string; ohne?: string; titel: string }
  // Unterschriften (z. B. Bauvertrag): je Partei eine Linie mit „Ort, Datum“ und der Rolle darunter; {feld} wird ersetzt
  | { id: string; art: 'unterschriften'; parteien: string[] }
  // Berechnete Tabellen (z. B. Rechenleiter und Prüfblatt einer Rechnung): eine Druckquelle des Moduls rechnet sie aus den Daten,
  // die sie braucht – im Browser aus der Sicht, auf dem Server aus der Datenbank, mit derselben Rechnung
  | { id: string; art: 'berechnet'; quelle: string; titel: string };

/** Eine berechnete Tabelle: Spalten und Zeilen als fertiger Text (summe fett mit Linie, hinweis kursiv, titel als Zwischenzeile). */
export interface DruckTabelle { titel?: string; spalten: { titel: string; rechts?: boolean }[]; zeilen: { zellen: string[]; art?: 'summe' | 'hinweis' | 'titel' }[] }
/** Einträge eines Objekts, deren Feld (oder „id“) den Wert hat. */
export type Hole = (objekt: string, feld: string, wert: string) => { id: string; werte: Werte }[];
/** Druckquelle eines Moduls: was sie braucht (Objekt, Feld, und welches Feld des gedruckten Eintrags den Wert liefert – „id“ für ihn
 *  selbst) und wie sie daraus rechnet. */
export interface Druckquelle { braucht: { objekt: string; feld: string; wert: string }[]; tabellen: (hole: Hole, eintrag: { id: string; werte: Werte }) => DruckTabelle[] }

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
/** Feld einer Verzeichnis-Spalte: ein eigenes Feld („telefon“) oder ein Feld des verwiesenen Eintrags („bieter.telefon“). */
export function spaltenFeld(m: ObjektModell, name: string, modell: (o: string) => ObjektModell | undefined): Feld | undefined {
  const [a, b] = name.split('.');
  if (b === undefined) return m.felder.find((f) => f.name === a);
  const v = m.felder.find((f) => f.name === a && f.art === 'verweis'), z = v?.ziel ? modell(v.ziel)?.felder.find((f) => f.name === b && !f.verborgen) : undefined;
  return z ? { ...z, name } : undefined;
}
/** Die verwiesenen Felder, die als Spalten wählbar sind (je Verweis die sichtbaren, kurzen Felder des Ziels). */
export const verweisSpalten = (m: ObjektModell, modell: (o: string) => ObjektModell | undefined): { verweis: Feld; felder: Feld[] }[] =>
  m.felder.filter((f) => f.art === 'verweis' && !f.verborgen && f.ziel && f.ziel !== 'projekt' && modell(f.ziel))
    .map((f) => ({ verweis: f, felder: modell(f.ziel!)!.felder.filter((z) => !z.verborgen && z.art !== 'langtext' && z.art !== 'verweis' && z.name !== modell(f.ziel!)!.anzeigeFeld) }));

export function verzeichnisSpalten(b: { id: string; spalten: string[] }, m: ObjektModell, e: Einstellungen, modell: (o: string) => ObjektModell | undefined): string[] {
  const eigen = (e[`${b.id}.spalten`] ?? '').split(',').filter((n) => n && spaltenFeld(m, n, modell));
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
  zielwerte?: (ziel: string, id: string) => Werte | undefined;   // Werte eines verwiesenen Objekts (Spalten „verweis.feld“ im Verzeichnis)
  kinder: (blockId: string) => { id: string; werte: Werte }[];   // die Einträge eines Listen- oder Bilder-Blocks, in der Reihenfolge des Ausdrucks
  bild: (id: string) => string;                    // Adresse des Vorschaubilds (im Browser ein Verweis, im PDF das Bild selbst)
  modell: (objekt: string) => ObjektModell;        // Modell der Einträge
  extra?: Record<string, string>;                  // weitere Platzhalter (Verzeichnis: anzahl, filter, datum)
  berechnet?: (blockId: string) => DruckTabelle[];  // die Tabellen eines berechneten Blocks
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
  .lv h2 { font-size: 1.05em; margin: 0 0 1mm; break-after: avoid; }
  .lv table { width: 100%; border-collapse: collapse; }
  .lv th { text-align: left; font-weight: 400; color: #444; font-size: .9em; border-bottom: .3mm solid #111; padding: .8mm 2mm .8mm 0; }
  .lv td { vertical-align: top; padding: 1.4mm 2mm 1.4mm 0; border-bottom: .2mm solid #ddd; }
  .lv tr { break-inside: avoid; }
  .lv .oz { width: 1%; white-space: nowrap; }
  .lv .zahl { width: 1%; white-space: nowrap; text-align: right; }
  .lv .betrag { width: 24mm; white-space: nowrap; text-align: right; }
  .lv .leer { display: inline-block; width: 22mm; border-bottom: .2mm solid #111; height: 1em; }
  .lv .lv-titel td { font-weight: 700; padding-top: 3mm; border-bottom: .3mm solid #111; break-after: avoid; }
  .lv .lv-summe td { font-weight: 600; border-bottom: .3mm solid #111; }
  .lv .kurz { font-weight: 600; }
  .lv .lang { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: .8mm; }
  .lv .merk { color: #444; font-size: .9em; }
  .lv .zusammen { margin-top: 6mm; break-inside: avoid; }
  .lv .zusammen td { border-bottom: .2mm solid #ccc; }
  .lv .zusammen .gesamt td { font-weight: 700; border-bottom: .4mm solid #111; }
  .berechnet table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .berechnet th { text-align: left; font-weight: 600; border-bottom: .4mm solid #111; padding: .8mm 1.2mm; }
  .berechnet td { border-bottom: .2mm solid #ccc; padding: .8mm 1.2mm; vertical-align: top; }
  .berechnet .rechts { text-align: right; white-space: nowrap; }
  .berechnet tr.summe td { font-weight: 700; border-bottom: .4mm solid #111; }
  .berechnet tr.hinweis td { font-style: italic; color: #444; }
  .berechnet tr.titel td { font-weight: 700; padding-top: 2mm; }
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
      const spalten = (b.art === 'verzeichnis' ? verzeichnisSpalten(b, k, e, d.modell) : b.spalten).map((n) => spaltenFeld(k, n, d.modell)!).filter((f) => f && (bearbeiten || !aus(`${b.id}.${f.name}`)));
      // Wert einer Spalte: eigenes Feld oder Feld des verwiesenen Eintrags
      const wert = (z: Werte, f: Feld): Wert => { const [a, n] = f.name.split('.'); if (n === undefined) return z[f.name] ?? null;
        const v = k.felder.find((x) => x.name === a)!, id = z[a!]; return id ? d.zielwerte?.(v.ziel!, String(id))?.[n] ?? null : null; };
      // schmale Spalten: alles außer langen Texten und Verweisen
      const schmal = (f: Feld) => (f.art === 'langtext' || f.art === 'text' || f.art === 'verweis' ? '' : ' schmal');
      const kopf = spalten.map((f) => `<th class="${aus(`${b.id}.${f.name}`) ? 'aus' : ''}${schmal(f)}" data-stelle="${b.id}.${f.name}">${sicher(e[`${b.id}.${f.name}.titel`] || f.titel)}</th>`).join('');
      const rumpf = zeilen.map(({ werte: z }) => `<tr>${spalten.map((f) => `<td class="${aus(`${b.id}.${f.name}`) ? 'aus' : ''}${schmal(f)}">${sicher(f.art === 'ja_nein' ? (wert(z, f) ? '✓' : '') : feldtext(f, wert(z, f), d.verweis))}</td>`).join('')}</tr>`).join('');
      return huelle(b.id, `liste${zeilen.length ? '' : ' leer'}`, `<h2>${sicher(e[`${b.id}.titel`] || b.titel)}</h2><table><thead><tr>${kopf}</tr></thead><tbody>${rumpf || `<tr><td colspan="${spalten.length}">–</td></tr>`}</tbody></table>`);
    }
    if (b.art === 'lv') return huelle(b.id, 'lv', lvTabelle(b, d.kinder(b.id), e));
    if (b.art === 'berechnet') {
      const T = d.berechnet?.(b.id) ?? [];
      if (!T.length && !bearbeiten) return '';
      return huelle(b.id, `berechnet${T.length ? '' : ' leer'}`, `<h2>${sicher(e[`${b.id}.titel`] || b.titel)}</h2>${T.map((t) => `${t.titel ? `<h3>${sicher(t.titel)}</h3>` : ''}<table>${t.spalten.some((x) => x.titel) ? `<thead><tr>${t.spalten.map((x) => `<th class="${x.rechts ? 'rechts' : ''}">${sicher(x.titel)}</th>`).join('')}</tr></thead>` : ''}<tbody>${
        t.zeilen.map((z) => `<tr class="${z.art ?? ''}">${z.zellen.map((c, i) => `<td class="${t.spalten[i]?.rechts ? 'rechts' : ''}">${sicher(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('') || '<p>–</p>'}`);
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

// ------------------------------------------------------------------ Leistungsverzeichnis
const geld = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahlVon = (w: Wert | undefined) => { const n = typeof w === 'number' ? w : Number(String(w ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const OHNE_GP: Record<string, string> = { bedarf: 'Bedarfsposition – nur Einheitspreis', alternativ: 'Alternativposition – nur Einheitspreis' };

/** Die Tabelle des LV: Titel öffnen eine Gruppe (Ebene aus der OZ), nach ihrer letzten Position steht die Titelsumme. */
function lvTabelle(b: { id: string; titel: string }, eintraege: { id: string; werte: Werte }[], e: Einstellungen): string {
  const preise = e[`${b.id}.preise`] === 'ja', nurKurz = e[`${b.id}.kurz`] === 'ja';
  const z = nachOz(eintraege);
  const leer = '<span class="leer"></span>';
  const offen: { oz: string; text: string; ebene: number; summe: number }[] = [];
  const oben: { oz: string; text: string; summe: number }[] = [];
  let gesamt = 0;
  const zeilen: string[] = [];
  const schliessen = (bis: number) => {
    while (offen.length && offen[offen.length - 1]!.ebene >= bis) {
      const t = offen.pop()!;
      if (offen.length) offen[offen.length - 1]!.summe += t.summe; else oben.push({ oz: t.oz, text: t.text, summe: t.summe });
      zeilen.push(`<tr class="lv-summe"><td class="oz"></td><td colspan="3">Summe ${sicher(t.oz)} ${sicher(t.text)}</td><td class="betrag"></td><td class="betrag">${preise ? geld(t.summe) : leer}</td></tr>`);
    }
  };
  for (const { werte: w } of z) {
    const oz = String(w.oz ?? ''), art = String(w.art ?? 'normal'), ebene = oz.split('.').length;
    const kurz = sicher(String(w.kurztext ?? '')), lang = nurKurz ? '' : zumDrucken(String(w.langtext ?? '').trim());
    if (art === 'titel') { schliessen(ebene); offen.push({ oz, text: String(w.kurztext ?? ''), ebene, summe: 0 }); zeilen.push(`<tr class="lv-titel"><td class="oz">${sicher(oz)}</td><td colspan="5">${kurz}</td></tr>`); continue; }
    if (istHinweis(art)) { zeilen.push(`<tr><td class="oz">${sicher(oz)}</td><td colspan="5"><div class="kurz">${kurz}</div>${lang ? `<div class="lang">${sicher(lang)}</div>` : ''}</td></tr>`); continue; }
    const menge = zahlVon(w.menge), ep = zahlVon(w.ep), gp = Math.round(menge * ep * 100) / 100, zaehlt = !OHNE_GP[art];
    if (zaehlt) { if (offen.length) offen[offen.length - 1]!.summe += gp; else gesamt += gp; }
    zeilen.push(`<tr><td class="oz">${sicher(oz)}</td><td><div class="kurz">${kurz}</div>${lang ? `<div class="lang">${sicher(lang)}</div>` : ''}${OHNE_GP[art] ? `<div class="merk">${OHNE_GP[art]}</div>` : art === 'stundenlohn' ? '<div class="merk">Stundenlohnarbeiten</div>' : ''}</td>`
      + `<td class="zahl">${w.menge != null && w.menge !== '' ? sicher(menge.toLocaleString('de', { maximumFractionDigits: 3 })) : ''}</td><td>${sicher(String(w.einheit ?? ''))}</td>`
      + `<td class="betrag">${preise ? (ep ? geld(ep) : '') : leer}</td><td class="betrag">${zaehlt ? (preise ? geld(gp) : leer) : ''}</td></tr>`);
  }
  schliessen(1);
  gesamt += oben.reduce((s2, t) => s2 + t.summe, 0);
  const betrag = (n: number) => (preise ? geld(n) : leer);
  const zus = `<table class="zusammen"><thead><tr><th colspan="2">Zusammenstellung</th><th class="betrag">€</th></tr></thead><tbody>${oben.map((t) => `<tr><td class="oz">${sicher(t.oz)}</td><td>${sicher(t.text)}</td><td class="betrag">${betrag(t.summe)}</td></tr>`).join('')}`
    + `<tr class="gesamt"><td></td><td>Angebotssumme netto</td><td class="betrag">${betrag(gesamt)}</td></tr><tr><td></td><td>zzgl. Umsatzsteuer 19 %</td><td class="betrag">${betrag(Math.round(gesamt * 19) / 100)}</td></tr>`
    + `<tr class="gesamt"><td></td><td>Angebotssumme brutto</td><td class="betrag">${betrag(Math.round(gesamt * 119) / 100)}</td></tr></tbody></table>`;
  return `<h2>${sicher(e[`${b.id}.titel`] || b.titel)}</h2><table><thead><tr><th class="oz">OZ</th><th>Leistung</th><th class="zahl">Menge</th><th>Einheit</th><th class="betrag">EP €</th><th class="betrag">GP €</th></tr></thead><tbody>${zeilen.join('') || '<tr><td colspan="6">–</td></tr>'}</tbody></table>${zus}`;
}

export const schriftgroesse = (e: Einstellungen) => (SCHRIFT[e['seite.schrift'] ?? ''] ?? SCHRIFT.normal!).pt;
export const fusszeile = (a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen) => (e['seite.fuss.aus'] === 'ja' ? '' : einsetzen(e['seite.fuss'] || a.fuss, m, d));
export const dateiname = (a: Ausdruck, m: ObjektModell, d: Druckdaten) => (einsetzen(a.dateiname, m, d).replace(/[\\/:*?"<>|]+/g, '-') || a.titel) + '.pdf';

/** Die ganze Seite für das PDF: A4, Ränder, Fußzeile mit Seitenzahl auf jeder Seite. Lädt nichts von außen. */
export function druckSeite(a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen): string { return druckSeiten(a, m, [d], e); }

/** Mehrere Einträge in einem PDF (z. B. ausgewählte Tagesberichte): jeder beginnt auf einer neuen Seite und hat seine eigene Fußzeile. */
export function druckSeiten(a: Ausdruck, m: ObjektModell, alle: Druckdaten[], e: Einstellungen): string {
  const schrift = '8pt Arial, "Liberation Sans", Helvetica, sans-serif';
  const seiten = alle.map((d, i) => `@page s${i} { @bottom-left { content: "${fusszeile(a, m, d, e).replace(/[\\"]/g, '\\$&')}"; font: ${schrift}; color: #444; } }`).join('\n  ');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${sicher(a.titel)}</title><style>
  @page { size: A4${querformat(a, e) ? ' landscape' : ''}; margin: ${RAND.oben}mm ${RAND.seite}mm ${RAND.unten}mm;
    @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: ${schrift}; color: #444; } }
  ${seiten}
  html, body { margin: 0; padding: 0; }
  .seite + .seite { break-before: page; }
  ${CSS(schriftgroesse(e))}</style></head><body>${alle.map((d, i) => `<div class="seite" style="page: s${i}">${druckInhalt(a, m, d, e)}</div>`).join('')}</body></html>`;
}
