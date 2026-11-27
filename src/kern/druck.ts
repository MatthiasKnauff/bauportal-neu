// Schrift: Arial bzw. die maßgleiche Liberation Sans (im Druckdienst) – so brechen Vorschau und PDF gleich um.
// Druckwerk: EIN Weg vom Objekt zum Ausdruck – dieselbe Seite für die Vorschau im Browser und für das PDF.
// Ein Modul beschreibt seinen Ausdruck im Beipackzettel als Folge von Blöcken; das Büro stellt daran, was es will
// (Beschriftungen, Texte, ein/aus, Schriftgröße) – jede Einstellung ist ein Eintrag „druckeinstellung“ und damit
// ein Befehl wie alles andere (Rückgängig, Abgleich). Reine Textfunktion: läuft im Browser und auf dem Server gleich.
import { zumDrucken } from './textergaenzung';
import type { Feld, ObjektModell, Wert, Werte } from './modell';
import { nachOz } from './oz';
import { istHinweis, istZuschlag, mengeVon, nachKennung, zuschlagAuf } from './lvarten';

export type Druckblock =
  | { id: string; art: 'briefkopf' }                                   // Büro links, Projekt rechts
  | { id: string; art: 'titel'; text: string; unter?: string }         // Überschrift; {feld} wird ersetzt
  | { id: string; art: 'felder'; felder: string[] }                    // Beschriftung + Wert, nebeneinander
  | { id: string; art: 'text'; feld: string; titel?: string }         // langer Text mit Überschrift (ab Werk die des Felds), über mehrere Seiten
  | { id: string; art: 'absatz'; text: string }                        // fester Text (z. B. Anrede und Gruß eines Briefs); {feld} wird ersetzt, einstellbar
  // Tabelle der Einträge, die am Objekt hängen (z. B. die Mängel eines Berichts): objekt.ueber verweist auf das gedruckte Objekt
  // spaltenTitel: eigene Beschriftung je Spalte ab Werk; leerzeile: eine freie Zeile zum Nachtragen; titel '' – ohne Überschrift
  | { id: string; art: 'liste'; objekt: string; ueber: string; filter?: Werte; titel: string; spalten: string[]; spaltenTitel?: Record<string, string>; leerzeile?: boolean }
  // Bilder, die am Objekt hängen – ab Werk zwei nebeneinander (spalten), nie beschnitten, mit Beschriftung; neueSeite: beginnt auf einer neuen Seite
  | { id: string; art: 'bilder'; objekt: string; ueber: string; titel: string; beschriftung: string; spalten?: 1 | 2 | 3; neueSeite?: boolean; unter?: string; nummern?: boolean /* „Foto 1“, „Foto 2“ … vor der Beschriftung */ }
  // Formularkopf: großer Titel links, rechts das Logo (sonst der Name des Büros), darunter eine kräftige Linie
  | { id: string; art: 'formularkopf'; text: string }
  // Raster aus beschrifteten Zellen (Zeilen × Zellen, breite in %), Text mit Platzhaltern; je Zeile die Art der Beschriftung (RasterZeile)
  | { id: string; art: 'raster'; zeilen: RasterZeile[] }
  // Häkchen (ja/nein-Felder): in einer Reihe, wahlweise mit Beschriftung davor; gross: je Feld eine gleich breite Spalte,
  // Beschriftung oben, darunter ein großes Kästchen mit ✓ (Formular wie bisher)
  | { id: string; art: 'haken'; felder: string[]; titel?: string; gross?: boolean }
  // Beschrifteter Kasten mit den Einträgen, die am Objekt hängen, als Text: je Quelle (welche Einträge, wenn) ein fetter Vorspann und der Text;
  // erledigt: Feld, mit dem ein Eintrag durchgestrichen und „(erledigt)“ dasteht. Unten eine freie Zeile zum Nachtragen. Ohne Einträge
  // steht der Kasten nur da, wenn immer gesetzt ist.
  | { id: string; art: 'kasten'; objekt: string; ueber: string; titel: string; quellen: { wenn: Werte; vorne?: string; text: string }[]; erledigt?: string; immer?: boolean }
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

/** Zelle eines Rasters: Beschriftung, Text, kleine Zeile darunter, Breite in %, groß (z. B. das Bauvorhaben), grau hinterlegt. */
export interface RasterZelle { titel: string; text: string; unter?: string[] /* Teile, leere fallen weg, verbunden mit „ · “ */; breite?: number; gross?: boolean; grau?: boolean; mitte?: boolean }
/** Zeile eines Rasters. kopf: 'oben' (ab Werk) kleine Beschriftung über dem Wert; 'links' Beschriftung vor dem Wert in einer Zeile;
 *  'zeile' die Beschriftungen als eigene Kopfzeile (grau hinterlegt) über einer Zeile mit den Werten. */
export interface RasterZeile { zellen: RasterZelle[]; kopf?: 'oben' | 'links' | 'zeile' }
/** Eine Vorlage: dieselben Daten, anders angeordnet. Das Büro wählt sie in der Vorschau (Stelle „seite.vorlage“). */
export interface Vorlage { id: string; titel: string; bloecke: Druckblock[]; fuss?: string; stil?: 'formular'; rand?: Partial<Rand> }
export interface Rand { oben: number; links: number; rechts: number; unten: number }

/** Eine berechnete Tabelle: Spalten und Zeilen als fertiger Text (summe fett mit Linie, hinweis kursiv, titel als Zwischenzeile). */
export interface DruckTabelle { titel?: string; spalten: { titel: string; rechts?: boolean }[]; zeilen: { zellen: string[]; art?: 'summe' | 'hinweis' | 'titel' }[] }
/** Einträge eines Objekts, deren Feld (oder „id“) den Wert hat. */
export type Hole = (objekt: string, feld: string, wert: string) => { id: string; werte: Werte }[];
/** Druckquelle eines Moduls: was sie braucht (Objekt, Feld, und welches Feld des gedruckten Eintrags den Wert liefert – „id“ für ihn
 *  selbst; „fest“: ein fester Wert, z. B. die Kennung des Büros) und wie sie daraus rechnet. */
export interface Druckquelle { braucht: ({ objekt: string; feld: string; wert: string; fest?: never } | { objekt: string; feld: string; fest: string; wert?: never })[]; tabellen: (hole: Hole, eintrag: { id: string; werte: Werte }) => DruckTabelle[] }

export interface Ausdruck {
  id: string;              // eindeutig, z. B. "bautagebuch.tagesbericht"
  titel: string;           // Name des Ausdrucks in der Oberfläche
  objekt: string;          // was gedruckt wird
  dateiname: string;       // Vorschlag für die PDF-Datei; {feld} wird ersetzt
  fuss: string;            // Fußzeile links; {feld} wird ersetzt. Rechts steht immer „Seite x von y“.
  rolle?: string;          // Ablagerolle (kern/ablageordner): wohin „Im Projektordner ablegen“ das PDF legt – ohne Rolle wird nicht abgelegt
  ersetzen?: boolean;      // gleichnamige ältere Fassung ersetzen (die alte wandert in den Papierkorb), statt „ (2)“ anzuhängen – z. B. GEPRÜFT
  vermerk?: string;        // Feld des Objekts, in das nach dem PDF „Datei · Zeitpunkt“ geschrieben wird (z. B. „Als PDF exportiert“)
  bloecke: Druckblock[];
  /** Verzeichnis statt eines einzelnen Eintrags: gedruckt werden viele Einträge (die gefilterte Liste oder die Auswahl).
   *  Platzhalter dann: {anzahl}, {filter}, {datum}, {buero}. */
  verzeichnis?: boolean;
  /** Hoch- oder Querformat ab Werk (einstellbar: Stelle „seite.format“). */
  format?: 'hoch' | 'quer';
  /** Weitere Vorlagen zur Wahl (Stelle „seite.vorlage“); ab Werk gilt die des Ausdrucks selbst (bloecke, fuss, stil, rand) mit dem Namen vorlageTitel. */
  vorlagen?: Vorlage[];
  vorlageTitel?: string;
  stil?: 'formular';       // Formular: Tabellen mit Rahmen und grauem Kopf, Zeilen abwechselnd hinterlegt
  rand?: Partial<Rand>;    // Seitenränder in mm, wenn anders als ab Werk (z. B. 25 mm links zum Abheften)
}

/** Die gewählte Vorlage eines Ausdrucks: Blöcke, Fußzeile, Stil, Ränder. */
export function vorlageVon(a: Ausdruck, e: Einstellungen): { bloecke: Druckblock[]; fuss: string; stil?: 'formular'; rand: Rand } {
  const v = a.vorlagen?.find((x) => x.id === e['seite.vorlage']);
  const r = { oben: RAND.oben, links: RAND.seite, rechts: RAND.seite, unten: RAND.unten, ...(v ? v.rand : a.rand) };
  return v ? { bloecke: v.bloecke, fuss: v.fuss ?? a.fuss, stil: v.stil, rand: r } : { bloecke: a.bloecke, fuss: a.fuss, stil: a.stil, rand: r };
}
/** Alle Blöcke aller Vorlagen – zum Nachschlagen eines Blocks über seine Kennung (die ist über alle Vorlagen eindeutig). */
export const alleBloecke = (a: Ausdruck): Druckblock[] => [...a.bloecke, ...(a.vorlagen ?? []).flatMap((v) => v.bloecke)];
/** Gehört ein Eintrag zu einem Block mit Einträgen? (Liste: alle Werte des Filters; Kasten: eine seiner Quellen) */
export function passt(b: Druckblock, w: Werte): boolean {
  const gleich = (f: Werte) => Object.entries(f).every(([n, x]) => w[n] === x);
  return b.art === 'liste' ? gleich(b.filter ?? {}) : b.art === 'kasten' ? b.quellen.some((q) => gleich(q.wenn)) : true;
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
  projektwerte?: Werte;                            // das Projekt des Objekts (Platzhalter {projekt.feld})
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

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
/**
 * Ersetzt {feld} durch den Wert des Objekts, {buero} und {projekt} durch Büro- und Projektnamen, {buero.feld} und {projekt.feld}
 * durch Felder des Büros bzw. Projekts, {datum:wochentag} durch den Wochentag. {a|b}: der erste Platzhalter mit Wert.
 * [ … ] fällt weg, wenn ein Platzhalter darin leer ist (z. B. „[ (bis {frist})]“). werte: ab Werk die des gedruckten Objekts.
 */
export function einsetzen(vorlage: string, m: ObjektModell, d: Druckdaten, werte: Werte = d.werte): string {
  const eins = (k: string): string => {
    const [name, form] = k.split(':') as [string, string | undefined];
    if (name === 'buero') return String(d.buero.name ?? '');
    if (name === 'projekt') return d.projekt;
    if (d.extra && name in d.extra) return d.extra[name]!;
    const [ebene, feldname] = name.includes('.') ? name.split('.') as [string, string] : ['', name];
    if (ebene === 'buero') return String(d.buero[feldname] ?? '');
    const mm = ebene === 'projekt' ? d.modell('projekt') : m, ww = ebene === 'projekt' ? d.projektwerte ?? {} : werte;
    const f = mm?.felder.find((x) => x.name === feldname);
    if (!f) return '';
    if (form === 'wochentag') { const t = String(ww[feldname] ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(t) ? WOCHENTAGE[new Date(`${t.slice(0, 10)}T12:00:00Z`).getUTCDay()]! : ''; }
    return feldtext(f, ww[feldname], d.verweis);
  };
  const wert = (k: string) => k.split('|').map(eins).find((x) => x !== '') ?? '';
  return vorlage.replace(/\[([^\[\]]*\{[^\[\]]*)\]/g, (_g, innen: string) => ([...innen.matchAll(/\{([a-z0-9_.:|]+)\}/g)].every((x) => wert(x[1]!) !== '') ? innen : ''))
    .replace(/\{([a-z0-9_.:|]+)\}/g, (_g, k: string) => wert(k)).replace(/\s+/g, ' ').trim();
}

/** Platzhalter, die ein Text dieses Ausdrucks verwenden kann – für die Erklärung im Einstellfeld. */
export const platzhalter = (m: ObjektModell): string[] => ['buero', 'projekt', ...m.felder.filter((f) => f.art !== 'verweis' && f.art !== 'langtext' && !f.verborgen).map((f) => f.name)];

export const CSS = (schrift: number) => `
  .seite { font: ${schrift}pt/1.4 Arial, "Liberation Sans", Helvetica, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  .absatz { margin-bottom: 5mm; } .absatz p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
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
  .fuss { color: #444; font-size: .85em; white-space: pre-line; }
  .bilder.drei .bildraster { grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
  .bilder.drei .bildraster img { max-height: 52mm; }
  .bilder.neueseite { break-before: page; }
  .bilder .bildunter { margin: -1mm 0 3mm; padding-bottom: 2mm; border-bottom: .3mm solid #4a5056; }
  .formkopf { display: flex; justify-content: space-between; align-items: center; border-bottom: .6mm solid #1f2326; padding-bottom: 2mm; margin-bottom: 5mm; }
  .formkopf .formtitel { font-size: 2em; font-weight: 700; letter-spacing: .02em; }
  .formkopf .logo { max-height: 20mm; max-width: 55mm; object-fit: contain; }
  .raster { border: .3mm solid #4a5056; border-radius: 1mm; margin-bottom: 4mm; break-inside: avoid; overflow: hidden; }
  .rasterzeile { display: flex; }
  .rasterzeile + .rasterzeile { border-top: .2mm solid #4a5056; }
  .raster .zelle { padding: 1.2mm 2.5mm; min-width: 0; }
  .raster .zelle + .zelle { border-left: .2mm solid #4a5056; }
  .raster .zelle.grau { background: #eef0f2; }
  .raster small { display: block; color: #6b7177; font-size: .7em; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
  .raster span { display: block; overflow-wrap: anywhere; }
  .raster .gross span { font-size: 1.45em; font-weight: 700; line-height: 1.2; }
  .raster em { display: block; font-style: normal; color: #444; font-size: .8em; }
  .raster .zelle.mitte { text-align: center; }
  .formular .raster { margin-bottom: 7mm; } .formular .raster .zelle { display: flex; flex-direction: column; justify-content: center; }
  .formular .raster .gross { min-height: 19mm; padding-left: 3mm; } .formular .rasterzeile.links .zelle { min-height: 9.5mm; flex-direction: row; justify-content: flex-start; align-items: center; }
  .formular .rasterzeile.kopfzeile .zelle { min-height: 8mm; } .formular .rasterzeile:not(.kopfzeile):not(.links) .zelle:not(.gross) { min-height: 11.5mm; font-size: 1.05em; }
  .rasterzeile.links .zelle { display: flex; align-items: baseline; gap: 3mm; background: #f6f7f8; }
  .rasterzeile.links small { display: inline; flex: none; }
  .rasterzeile.kopfzeile { background: #eef0f2; color: #6b7177; font-weight: 700; font-size: .8em; text-align: center; }
  .rasterzeile.kopfzeile .zelle { padding: 1.6mm 2mm; }
  .haken.gross { display: grid; grid-template-columns: 21.8fr 15.2fr 28.8fr 34.2fr; gap: 0; margin: 0 0 6mm; }
  .haken.gross span { display: block; padding-left: 5mm; }
  .haken.gross small { display: block; color: #6b7177; font-weight: 700; font-size: .72em; margin-bottom: 1.5mm; }
  .haken.gross .kaestchen { display: grid; place-items: center; width: 6.5mm; height: 6.5mm; border-radius: 1.5mm; border-width: .35mm; font-size: 1.9em; font-weight: 400; line-height: 1; font-style: normal; }
  .haken.gross .kaestchen.an { background: none; box-shadow: none; color: #1f2326; }
  .haken { display: flex; flex-wrap: wrap; gap: 2mm 7mm; margin: 0 0 5mm; break-inside: avoid; }
  .haken b { margin-right: 2mm; }
  .haken span { display: flex; align-items: center; gap: 1.8mm; }
  .kaestchen { display: inline-block; width: 3.6mm; height: 3.6mm; border: .3mm solid #4a5056; border-radius: .5mm; }
  .kaestchen.an { background: #1f2326; box-shadow: inset 0 0 0 .6mm #fff; }
  .kasten { border: .3mm solid #4a5056; border-radius: 1mm; margin-bottom: 3mm; break-inside: avoid; overflow: hidden; }
  .kasten h2 { margin: 0; padding: 1.6mm 2.5mm; background: #eef0f2; border-bottom: .2mm solid #4a5056; color: #6b7177; font-size: .75em; }
  .kasteninhalt { padding: 1mm 2.5mm 0; }
  .kasteninhalt p { margin: 0 0 1mm; white-space: pre-wrap; overflow-wrap: anywhere; }
  .kasteninhalt p.frei { height: 7mm; margin: 0; }
  .kasteninhalt s { color: #777; }
  .formular .liste table { border: .3mm solid #4a5056; border-collapse: separate; border-spacing: 0; border-radius: 1mm; overflow: hidden; }
  .formular .liste th { background: #eef0f2; color: #6b7177; font-weight: 700; font-size: .75em; border: 0; border-bottom: .2mm solid #4a5056; padding: 2mm 2.5mm; }
  .formular .liste td { border: 0; padding: 1.2mm 2.5mm; }
  .formular .liste :is(th, td) + :is(th, td) { border-left: .2mm solid #4a5056; }   /* nur Spaltenlinien, keine Striche zwischen den Zeilen */
  .formular .liste tbody tr:nth-child(even) td { background: #f6f7f8; }   /* feine Streifen statt Linien */
  .formular .liste .schmal { text-align: center; }
  .liste tr.frei td { height: 7mm; }
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
  const teile = vorlageVon(a, e).bloecke.map((b) => {
    if (b.art === 'formularkopf') {
      const rechts = d.logo ? `<img class="logo" src="${sicher(d.logo)}" alt="">` : `<b>${sicher(String(d.buero.name ?? ''))}</b>`;
      return huelle(b.id, 'formkopf', `<span class="formtitel" data-stelle="${b.id}.text">${sicher(einsetzen(e[`${b.id}.text`] || b.text, m, d))}</span>${rechts}`);
    }
    if (b.art === 'raster') {
      const zelle = (c: RasterZelle, mitTitel: boolean, klasse = '') => {
        const unter = (c.unter ?? []).map((t) => einsetzen(t, m, d)).filter(Boolean).join(' · ');
        return `<div class="zelle${klasse}${c.gross ? ' gross' : ''}${c.grau ? ' grau' : ''}${c.mitte ? ' mitte' : ''}" style="flex: ${c.breite ?? 1} 1 0">${mitTitel ? `<small>${sicher(c.titel)}</small>` : ''}<span>${sicher(einsetzen(c.text, m, d)) || '&nbsp;'}</span>${unter ? `<em>${sicher(unter)}</em>` : ''}</div>`;
      };
      return huelle(b.id, 'raster', b.zeilen.map((z) => z.kopf === 'zeile'
        ? `<div class="rasterzeile kopfzeile">${z.zellen.map((c) => `<div class="zelle" style="flex: ${c.breite ?? 1} 1 0">${sicher(c.titel)}</div>`).join('')}</div><div class="rasterzeile">${z.zellen.map((c) => zelle(c, false)).join('')}</div>`
        : `<div class="rasterzeile${z.kopf === 'links' ? ' links' : ''}">${z.zellen.map((c) => zelle(c, true)).join('')}</div>`).join(''));
    }
    if (b.art === 'haken') {
      if (b.gross) return huelle(b.id, 'haken gross', b.felder.map((n) => `<span><small>${sicher(feld(n).titel)}</small><i class="kaestchen${d.werte[n] ? ' an' : ''}">${d.werte[n] ? '✓' : ''}</i></span>`).join(''));
      return huelle(b.id, 'haken', `${b.titel ? `<b>${sicher(einsetzen(e[`${b.id}.titel`] || b.titel, m, d))}</b>` : ''}${b.felder.map((n) => `<span><i class="kaestchen${d.werte[n] ? ' an' : ''}"></i>${sicher(feld(n).titel)}</span>`).join('')}`);
    }
    if (b.art === 'kasten') {
      const k = d.modell(b.objekt), zeilen = d.kinder(b.id);
      if (!zeilen.length && !bearbeiten && !b.immer && e[`${b.id}.leer`] !== 'ja') return '';
      const eintrag = (z: Werte) => {
        const q = b.quellen.find((x) => Object.entries(x.wenn).every(([n, w]) => z[n] === w))!;
        const vorne = q.vorne ? einsetzen(q.vorne, k, d, z) : '', text = sicher(einsetzen(q.text, k, d, z));
        const fertig = b.erledigt && z[b.erledigt];
        return `<p>${vorne ? `<b>${sicher(vorne)}</b> ` : ''}${fertig ? `<s>${text}</s> (erledigt)` : text}</p>`;
      };
      return huelle(b.id, 'kasten', `<h2 data-stelle="${b.id}">${sicher(einsetzen(e[`${b.id}.titel`] || b.titel, m, d))}</h2><div class="kasteninhalt">${zeilen.map((z) => eintrag(z.werte)).join('')}<p class="frei">&nbsp;</p></div>`);
    }
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
      if (!zeilen.length && !bearbeiten && e[`${b.id}.leer`] !== 'ja' && !(b.art === 'liste' && b.leerzeile)) return '';
      const ab = (f: Feld) => (b.art === 'liste' ? b.spaltenTitel?.[f.name] : undefined) ?? f.titel;
      const spalten = (b.art === 'verzeichnis' ? verzeichnisSpalten(b, k, e, d.modell) : b.spalten).map((n) => spaltenFeld(k, n, d.modell)!).filter((f) => f && (bearbeiten || !aus(`${b.id}.${f.name}`)));
      // Wert einer Spalte: eigenes Feld oder Feld des verwiesenen Eintrags
      const wert = (z: Werte, f: Feld): Wert => { const [a, n] = f.name.split('.'); if (n === undefined) return z[f.name] ?? null;
        const v = k.felder.find((x) => x.name === a)!, id = z[a!]; return id ? d.zielwerte?.(v.ziel!, String(id))?.[n] ?? null : null; };
      // schmale Spalten: alles außer langen Texten und Verweisen
      const schmal = (f: Feld) => (f.art === 'langtext' || f.art === 'text' || f.art === 'verweis' ? '' : ' schmal');
      const kopf = spalten.map((f) => `<th class="${aus(`${b.id}.${f.name}`) ? 'aus' : ''}${schmal(f)}" data-stelle="${b.id}.${f.name}">${sicher(e[`${b.id}.${f.name}.titel`] || ab(f))}</th>`).join('');
      const rumpf = zeilen.map(({ werte: z }) => `<tr>${spalten.map((f) => `<td class="${aus(`${b.id}.${f.name}`) ? 'aus' : ''}${schmal(f)}">${sicher(f.art === 'ja_nein' ? (wert(z, f) ? '✓' : '') : feldtext(f, wert(z, f), d.verweis))}</td>`).join('')}</tr>`).join('');
      const frei = b.art === 'liste' && b.leerzeile && !zeilen.length ? `<tr class="frei">${spalten.map(() => '<td>&nbsp;</td>').join('')}</tr>` : '';
      const titel = e[`${b.id}.titel`] || b.titel;
      return huelle(b.id, `liste${zeilen.length ? '' : ' leer'}`, `${titel ? `<h2>${sicher(titel)}</h2>` : ''}<table><thead><tr>${kopf}</tr></thead><tbody>${rumpf || (frei ? '' : `<tr><td colspan="${spalten.length}">–</td></tr>`)}${frei}</tbody></table>`);
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
      const spalten = e[`${b.id}.spalten`] || String(b.spalten ?? 2), unter = b.unter ? einsetzen(b.unter, m, d) : '';
      return huelle(b.id, `bilder${bilder.length ? '' : ' leer'}${spalten === '1' ? ' eins' : spalten === '3' ? ' drei' : ''}${b.neueSeite ? ' neueseite' : ''}`, `<h2>${sicher(e[`${b.id}.titel`] || b.titel)}</h2>${unter ? `<div class="unter bildunter">${sicher(unter)}</div>` : ''}<div class="bildraster">${
        bilder.map((z, i) => `<figure><img src="${sicher(d.bild(z.id))}" alt=""><figcaption>${b.nummern ? `<b>Foto ${i + 1}</b> ` : ''}${sicher(String(z.werte[b.beschriftung] ?? ''))}</figcaption></figure>`).join('') || '–'}</div>`);
    }
    if (b.art === 'absatz') return huelle(b.id, 'absatz', `<p>${sicher(einsetzen(e[`${b.id}.text`] || b.text, m, d))}</p>`);
    const text = String(d.werte[b.feld] ?? '');
    if (!text && !bearbeiten && e[`${b.id}.leer`] !== 'ja') return '';   // leere Abschnitte fallen weg, wenn nicht anders eingestellt
    return huelle(b.id, `textblock${text ? '' : ' leer'}`, `<h2>${sicher(e[`${b.id}.titel`] || b.titel || feld(b.feld).titel)}</h2><p>${sicher(text) || '–'}</p>`);
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
  const z = nachOz(eintraege), alle = nachKennung(eintraege);
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
    // Zuschlagsposition: Satz in % auf die GP ihrer Positionen (kern/lvarten.ts) – als Menge die Summe / 100
    const zu = istZuschlag(art), menge = zu ? mengeVon({ id: '', werte: w }, alle, (y) => zahlVon(y.werte.menge), (y) => zahlVon(y.werte.ep)) : zahlVon(w.menge);
    const ep = zahlVon(w.ep), gp = Math.round(menge * ep * 100) / 100, zaehlt = !OHNE_GP[art];
    if (zaehlt) { if (offen.length) offen[offen.length - 1]!.summe += gp; else gesamt += gp; }
    zeilen.push(`<tr><td class="oz">${sicher(oz)}</td><td><div class="kurz">${kurz}</div>${lang ? `<div class="lang">${sicher(lang)}</div>` : ''}${OHNE_GP[art] ? `<div class="merk">${OHNE_GP[art]}</div>` : art === 'stundenlohn' ? '<div class="merk">Stundenlohnarbeiten</div>' : ''}</td>`
      + `<td class="zahl">${zu ? `auf ${zuschlagAuf(w).length} Pos.` : w.menge != null && w.menge !== '' ? sicher(menge.toLocaleString('de', { maximumFractionDigits: 3 })) : ''}</td><td>${zu ? '%' : sicher(String(w.einheit ?? ''))}</td>`
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
/** Fußzeile links – legt die Vorlage fest (nicht die Druckvorschau, 27.11.2026); eine Zeile je Zeile der Vorlage (z. B. darunter die Anschrift des Büros). */
export const fusszeile = (a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen) =>
  vorlageVon(a, e).fuss.split('\n').map((z) => einsetzen(z, m, d)).filter(Boolean).join('\n');
export const dateiname = (a: Ausdruck, m: ObjektModell, d: Druckdaten) => (einsetzen(a.dateiname, m, d).replace(/[\\/:*?"<>|]+/g, '-') || a.titel) + '.pdf';

/** Die ganze Seite für das PDF: A4, Ränder, Fußzeile mit Seitenzahl auf jeder Seite. Lädt nichts von außen. */
export function druckSeite(a: Ausdruck, m: ObjektModell, d: Druckdaten, e: Einstellungen): string { return druckSeiten(a, m, [d], e); }

/** Mehrere Einträge in einem PDF (z. B. ausgewählte Tagesberichte): jeder beginnt auf einer neuen Seite und hat seine eigene Fußzeile. */
export function druckSeiten(a: Ausdruck, m: ObjektModell, alle: Druckdaten[], e: Einstellungen): string {
  const schrift = '8pt Arial, "Liberation Sans", Helvetica, sans-serif';
  const v = vorlageVon(a, e), r = v.rand;
  const seiten = alle.map((d, i) => `@page s${i} { @bottom-left { content: "${fusszeile(a, m, d, e).replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\A ')}"; font: ${schrift}; color: #444; white-space: pre; } }`).join('\n  ');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${sicher(a.titel)}</title><style>
  @page { size: A4${querformat(a, e) ? ' landscape' : ''}; margin: ${r.oben}mm ${r.rechts}mm ${r.unten}mm ${r.links}mm;
    @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: ${schrift}; color: #444; } }
  ${seiten}
  html, body { margin: 0; padding: 0; }
  .seite + .seite { break-before: page; }
  ${CSS(schriftgroesse(e))}</style></head><body>${alle.map((d, i) => `<div class="seite${v.stil ? ` ${v.stil}` : ''}" style="page: s${i}">${druckInhalt(a, m, d, e)}</div>`).join('')}</body></html>`;
}
