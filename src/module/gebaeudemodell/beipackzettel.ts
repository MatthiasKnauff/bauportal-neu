// Modul Gebäudemodell: Gebäude, Geschosse, Räume, Aufbauten mit Schichten und Bauteile (mit Kostengruppe nach DIN 276)
// in Versionen – gespeist aus IFC oder vom Assistenten.
import type { Beipackzettel } from '../../kern/modul';
import type { Feld, ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

// Das Gebäudemodell: Gebäude → Geschosse → Räume und Bauteile.
// Es darf ungenau beginnen oder leer bleiben. Jeder Wert trägt seine Herkunft (von Hand, aus IFC, geschätzt …) –
// das führt der Kern für alle Objekte, hier wird es zuerst gebraucht.
// Quellen (IFC, Assistent, 2D-Pläne) und Abnehmer (Termine, Kosten, AVA) hängen sich später an diese Objekte.
const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] };
const zusammenhang: Feld[] = [
  { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
  { name: 'version', titel: 'Version', art: 'verweis', ziel: 'version', pflicht: true },
];
const basis = { projektFeld: 'projekt', versionsBereich: 'gebaeudemodell', rechte };

const wahl = (...paare: [string, string][]) => [{ wert: '', titel: 'noch offen' }, ...paare.map(([wert, titel]) => ({ wert, titel }))];
// Maßnahmen, bei denen ein Bestand da ist – nur dann gelten die Fragen der Gruppe „Bestand“
const IM_BESTAND = ['anbau', 'aufstockung', 'umbau', 'wohnungssanierung', 'kernsanierung', 'energetisch', 'instandsetzung', 'innenausbau', 'abbruch'];

// Das Gebäude trägt auch die Antworten des Assistenten (Gruppen Größe bis Bestand). Sie lassen sich jederzeit
// in der Karte ändern; der Assistent schätzt daraus Geschosse und Bauteile (schaetzung.ts).
export const gebaeude: ObjektModell = {
  ...basis, name: 'gebaeude', titel: 'Gebäude', titelMehrzahl: 'Gebäude', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 240, gruppe: 'Gebäude' },
    { name: 'nutzung', titel: 'Gebäudeart', art: 'auswahl', inListe: true, breite: 190, gruppe: 'Gebäude', optionen: wahl(
      ['efh', 'Ein-/Zweifamilienhaus'], ['mfh', 'Mehrfamilienhaus'], ['wohnung', 'Wohnung'], ['wohn_geschaeft', 'Wohn- und Geschäftshaus'], ['buero', 'Büro / Verwaltung'],
      ['bildung', 'Schule / Kita'], ['gesundheit', 'Pflege / Gesundheit'], ['gewerbe', 'Halle / Gewerbe'], ['handel', 'Handel / Gastro / Hotel'],
      ['garage', 'Garage / Tiefgarage'], ['landwirtschaft', 'Landwirtschaft'], ['sonder', 'Sonderbau / Sonstiges']) },
    { name: 'massnahme', titel: 'Maßnahme (mehrere möglich)', art: 'mehrfach', inListe: true, breite: 190, gruppe: 'Gebäude', optionen: [
      { wert: 'neubau', titel: 'Neubau' }, { wert: 'anbau', titel: 'Anbau' }, { wert: 'aufstockung', titel: 'Aufstockung' }, { wert: 'umbau', titel: 'Umbau / Umnutzung' },
      { wert: 'wohnungssanierung', titel: 'Wohnungssanierung' }, { wert: 'kernsanierung', titel: 'Kernsanierung' }, { wert: 'energetisch', titel: 'Energetische Sanierung' },
      { wert: 'instandsetzung', titel: 'Instandsetzung' }, { wert: 'innenausbau', titel: 'Innenausbau' }, { wert: 'abbruch', titel: 'Abbruch / Rückbau' },
    ] },
    { name: 'bereiche', titel: 'Betroffene Bereiche (wenn nicht alles)', art: 'mehrfach', gruppe: 'Gebäude', optionen: [
      { wert: 'keller', titel: 'Keller' }, { wert: 'dach', titel: 'Dach' }, { wert: 'fassade', titel: 'Fassade' }, { wert: 'fenster', titel: 'Fenster' }, { wert: 'baeder', titel: 'Bäder' },
      { wert: 'kuechen', titel: 'Küchen' }, { wert: 'haustechnik', titel: 'Haustechnik' }, { wert: 'brandschutz', titel: 'Brandschutz' }, { wert: 'barrierefrei', titel: 'Barrierefrei / Aufzug' },
      { wert: 'schadstoffe', titel: 'Schadstoffe' }, { wert: 'aussenanlagen', titel: 'Außenanlagen' }, { wert: 'tiefgarage', titel: 'Tiefgarage' },
    ] },
    { name: 'denkmal', titel: 'Denkmal', art: 'ja_nein', gruppe: 'Gebäude' },
    { name: 'wohnflaeche', titel: 'Wohn-/Nutzfläche in m²', art: 'zahl', gruppe: 'Größe' },
    { name: 'einheiten', titel: 'Einheiten (Wohnungen, Mieteinheiten)', art: 'zahl', gruppe: 'Größe' },
    { name: 'geschosszahl', titel: 'Geschosse (ohne Keller und Dach)', art: 'zahl', gruppe: 'Größe' },
    { name: 'bgf', titel: 'Brutto-Grundfläche in m²', art: 'zahl', inListe: true, breite: 150, gruppe: 'Größe' },
    { name: 'bri', titel: 'Brutto-Rauminhalt in m³', art: 'zahl', inListe: true, breite: 150, gruppe: 'Größe' },
    { name: 'raumhoehe', titel: 'Raumhöhe in m', art: 'zahl', gruppe: 'Größe' },
    { name: 'dach_oben', titel: 'Über dem obersten Geschoss', art: 'auswahl', gruppe: 'Größe', optionen: wahl(['ausgebaut', 'ausgebautes Dach'], ['kalt', 'kaltes Dach'], ['nichts', 'nichts (Flachdach)']) },
    { name: 'keller', titel: 'Keller / Gründung', art: 'auswahl', gruppe: 'Bauweise', optionen: wahl(['ohne', 'kein Keller – Bodenplatte'], ['wu', 'Keller aus WU-Beton'], ['gemauert', 'Keller gemauert mit Abdichtung'], ['fertig', 'Fertigkeller']) },
    { name: 'tragwerk', titel: 'Tragwerk', art: 'auswahl', gruppe: 'Bauweise', optionen: wahl(['massiv', 'Massivbau (Mauerwerk)'], ['stahlbeton', 'Stahlbeton'], ['holzrahmen', 'Holzrahmenbau'], ['brettsperrholz', 'Brettsperrholz'], ['gemischt', 'gemischt']) },
    { name: 'dachform', titel: 'Dachform', art: 'auswahl', gruppe: 'Bauweise', optionen: wahl(['sattel', 'Satteldach'], ['walm', 'Walmdach'], ['pult', 'Pultdach'], ['flach', 'Flachdach']) },
    { name: 'dachdeckung', titel: 'Dachdeckung', art: 'auswahl', gruppe: 'Bauweise', optionen: wahl(['ziegel', 'Dachziegel / Betondachstein'], ['schiefer', 'Schiefer'], ['bitumen', 'Bitumenbahnen'], ['kunststoff', 'Kunststoffbahnen'], ['gruen', 'Gründach'], ['metall', 'Metall (Stehfalz)']) },
    { name: 'fassade', titel: 'Fassade', art: 'auswahl', gruppe: 'Bauweise', optionen: wahl(['putz', 'Putzfassade'], ['wdvs', 'WDVS mit Putz'], ['klinker', 'Klinker'], ['vhf', 'vorgehängt hinterlüftet'], ['holz', 'Holzfassade'], ['keine', 'keine Arbeiten']) },
    { name: 'fenster', titel: 'Fenster', art: 'auswahl', gruppe: 'Bauweise', optionen: wahl(['kunststoff', 'Kunststoff'], ['holz', 'Holz'], ['holzalu', 'Holz-Alu'], ['alu', 'Aluminium']) },
    { name: 'heizung', titel: 'Wärmeerzeuger', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['bleibt', 'unverändert'], ['wp_luft', 'Luft-Wasser-Wärmepumpe'], ['wp_sole', 'Sole-Wärmepumpe mit Erdsonden'], ['gas', 'Gas-Brennwert'], ['fernwaerme', 'Fernwärme'], ['pellet', 'Pelletkessel']) },
    { name: 'lueftung', titel: 'Lüftung', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['fenster', 'Fensterlüftung'], ['dezentral', 'dezentrale Geräte'], ['zentral', 'zentral mit Wärmerückgewinnung']) },
    { name: 'waermeverteilung', titel: 'Wärmeverteilung', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['fbh', 'Fußbodenheizung'], ['heizkoerper', 'Heizkörper']) },
    { name: 'pv', titel: 'Photovoltaik', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['keine', 'keine'], ['pv', 'PV-Anlage'], ['pv_speicher', 'PV mit Speicher']) },
    { name: 'estrich', titel: 'Estrich', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['zement', 'Zementestrich'], ['calciumsulfat', 'Calciumsulfat-Fließestrich'], ['trocken', 'Trockenestrich']) },
    { name: 'innenausbau', titel: 'Wände und Decken innen', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['putz', 'Innenputz'], ['trockenbau', 'Trockenbau'], ['beides', 'Putz und Trockenbau']) },
    { name: 'bodenbelag', titel: 'Bodenbelag', art: 'auswahl', gruppe: 'Technik und Ausbau', optionen: wahl(['parkett', 'Parkett'], ['massivparkett', 'Massivparkett'], ['vinyl', 'Vinyl / Designbelag'], ['teppich', 'Teppich'], ['fliesen', 'Fliesen']) },
    { name: 'erweiterung', titel: 'Erweiterung', art: 'auswahl', gruppe: 'Bestand', wenn: { massnahme: IM_BESTAND }, optionen: wahl(['keine', 'keine'], ['anbau', 'Anbau'], ['aufstockung', 'Aufstockung'], ['beides', 'Anbau und Aufstockung']) },
    { name: 'bestandskeller', titel: 'Vorhandener Keller', art: 'auswahl', gruppe: 'Bestand', wenn: { massnahme: IM_BESTAND }, optionen: wahl(['bleibt', 'keiner / unverändert'], ['aussen', 'von außen abdichten'], ['innen', 'von innen abdichten'], ['beides', 'außen und innen'], ['ausbau', 'abdichten und ausbauen']) },
    { name: 'anbaukeller', titel: 'Neuer Keller am Anbau', art: 'auswahl', gruppe: 'Bestand', wenn: { erweiterung: ['anbau', 'beides'] }, optionen: wahl(['ohne', 'keiner – Bodenplatte'], ['wu', 'WU-Beton'], ['gemauert', 'gemauert mit Abdichtung'], ['fertig', 'Fertigkeller']) },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung im Plan (IFC)', art: 'text', gruppe: 'Aus dem Plan' },
  ],
};

// Gebäudeteile (Bestand und Anbau, Aufstockung …): Das Gebäude ist der erste Teil. Ein weiterer Teil nennt nur, was bei
// ihm anders ist – leer heißt „wie das Hauptgebäude“ (Entscheidung 25.11.2026: eigene Einträge, erben vom ersten Teil).
const JE_TEIL = ['geschosszahl', 'wohnflaeche', 'dach_oben', 'keller', 'tragwerk', 'dachform', 'dachdeckung', 'fassade', 'fenster', 'lueftung', 'waermeverteilung', 'estrich', 'innenausbau', 'bodenbelag'];
export const gebaeudeteil: ObjektModell = {
  ...basis, name: 'gebaeudeteil', titel: 'Gebäudeteil', titelMehrzahl: 'Gebäudeteile', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'gebaeude', titel: 'Gebäude', art: 'verweis', ziel: 'gebaeude', pflicht: true, verborgen: true },
    { name: 'name', titel: 'Bezeichnung, z. B. Anbau', art: 'text', pflicht: true, gruppe: 'Gebäudeteil' },
    { name: 'lage', titel: 'Art', art: 'auswahl', gruppe: 'Gebäudeteil', optionen: wahl(['anbau', 'Anbau (neu)'], ['aufstockung', 'Aufstockung (neu, auf dem Bestand)'], ['neu', 'eigenes neues Gebäude'], ['bestand', 'Bestand']) },
    ...gebaeude.felder.filter((f) => JE_TEIL.includes(f.name)).map((f): Feld => ({ ...f, inListe: false, wenn: undefined,
      titel: f.art === 'zahl' ? `${f.titel} (leer: wie das Hauptgebäude)` : f.titel,
      ...(f.optionen ? { optionen: f.optionen.map((o) => (o.wert === '' ? { wert: '', titel: 'wie das Hauptgebäude' } : o)) } : {}) })),
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
  ],
};

export const geschoss: ObjektModell = {
  ...basis, name: 'geschoss', titel: 'Geschoss', titelMehrzahl: 'Geschosse', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'gebaeude', titel: 'Gebäude', art: 'verweis', ziel: 'gebaeude', pflicht: true, inListe: true, breite: 200, gruppe: 'Geschoss' },
    { name: 'name', titel: 'Bezeichnung, z. B. EG', art: 'text', pflicht: true, inListe: true, breite: 180, gruppe: 'Geschoss' },
    { name: 'ebene', titel: 'Ebene (0 = Erdgeschoss, -1 = Keller)', art: 'zahl', inListe: true, breite: 90, gruppe: 'Geschoss' },
    { name: 'hoehe', titel: 'Geschosshöhe in m', art: 'zahl', inListe: true, breite: 130, gruppe: 'Geschoss' },
    { name: 'flaeche', titel: 'Brutto-Grundfläche in m²', art: 'zahl', inListe: true, breite: 150, gruppe: 'Geschoss' },
    { name: 'kennung', titel: 'Kennung im Plan (IFC)', art: 'text', gruppe: 'Aus dem Plan' },
  ],
};

export const raum: ObjektModell = {
  ...basis, name: 'raum', titel: 'Raum', titelMehrzahl: 'Räume', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'geschoss', titel: 'Geschoss', art: 'verweis', ziel: 'geschoss', pflicht: true, inListe: true, breite: 150, gruppe: 'Raum' },
    { name: 'nummer', titel: 'Raumnummer', art: 'text', inListe: true, breite: 110, gruppe: 'Raum' },
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 220, gruppe: 'Raum' },
    { name: 'nutzung', titel: 'Nutzung', art: 'text', inListe: true, breite: 160, gruppe: 'Raum' },
    { name: 'flaeche', titel: 'Fläche in m²', art: 'zahl', inListe: true, breite: 110, gruppe: 'Maße' },
    { name: 'hoehe', titel: 'Lichte Höhe in m', art: 'zahl', inListe: true, breite: 120, gruppe: 'Maße' },
    { name: 'kennung', titel: 'Kennung im Plan (IFC)', art: 'text', gruppe: 'Aus dem Plan' },
  ],
};

export const BAUTEILARTEN = [
  { wert: 'aussenwand', titel: 'Außenwand' }, { wert: 'innenwand', titel: 'Innenwand' }, { wert: 'decke', titel: 'Decke' }, { wert: 'dach', titel: 'Dach' },
  { wert: 'bodenplatte', titel: 'Bodenplatte' }, { wert: 'fundament', titel: 'Fundament' }, { wert: 'fenster', titel: 'Fenster' }, { wert: 'tuer', titel: 'Tür, Tor' }, { wert: 'stuetze', titel: 'Stütze, Träger' },
  { wert: 'treppe', titel: 'Treppe' }, { wert: 'sonstiges', titel: 'Sonstiges' },
];
const WAENDE = ['aussenwand', 'innenwand'];

/**
 * Kostengruppe nach DIN 276, die zu Art, Lage und Tragfähigkeit eines Bauteils gehört. Wo die Angaben nicht reichen
 * (z. B. Wand, tragend oder nicht?), die Gruppe darüber – das ist ehrlich und lässt sich von Hand verfeinern.
 */
export function kostengruppeNummer(art: unknown, lage: unknown, tragend: unknown): string | null {
  const aussen = lage === 'aussen';
  switch (art) {
    case 'aussenwand': return tragend === 'ja' ? '331' : tragend === 'nein' ? '332' : '330';
    case 'innenwand': return tragend === 'ja' ? '341' : tragend === 'nein' ? '342' : '340';
    case 'stuetze': return aussen ? '333' : lage === 'innen' ? '343' : null;
    case 'fenster': case 'tuer': return aussen ? '334' : lage === 'innen' ? '344' : null;
    case 'decke': case 'treppe': return '351';
    case 'dach': return '361';
    case 'bodenplatte': case 'fundament': return '322';
    default: return null;
  }
}

// Ein Aufbau: Schichten von außen nach innen (bei Decken und Dächern von oben nach unten). Viele Bauteile teilen
// sich einen Aufbau – daraus werden U-Wert, Kosten und Ausschreibung gerechnet. Gehört wie die Bauteile zur Version.
export const aufbau: ObjektModell = {
  ...basis, name: 'aufbau', titel: 'Aufbau', titelMehrzahl: 'Aufbauten', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 320, gruppe: 'Aufbau' },
    { name: 'art', titel: 'für Bauteilart', art: 'auswahl', inListe: true, breite: 150, gruppe: 'Aufbau', optionen: [{ wert: '', titel: 'offen' }, ...BAUTEILARTEN] },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung (Plan oder Schätzung)', art: 'text', verborgen: true },
  ],
};

export const aufbauSchicht: ObjektModell = {
  ...basis, name: 'aufbau_schicht', titel: 'Schicht', titelMehrzahl: 'Schichten', anzeigeFeld: 'material',
  felder: [
    ...zusammenhang,
    { name: 'aufbau', titel: 'Aufbau', art: 'verweis', ziel: 'aufbau', pflicht: true, inListe: true, breite: 260, gruppe: 'Schicht' },
    { name: 'material', titel: 'Material', art: 'text', inListe: true, breite: 260, gruppe: 'Schicht' },
    { name: 'dicke', titel: 'Dicke in cm', art: 'zahl', inListe: true, breite: 110, gruppe: 'Schicht' },
    { name: 'lambda', titel: 'λ in W/(m·K)', art: 'zahl', inListe: true, breite: 110, gruppe: 'Schicht' },
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung (Plan oder Schätzung)', art: 'text', verborgen: true },
  ],
};

export const bauteil: ObjektModell = {
  ...basis, name: 'bauteil', titel: 'Bauteil', titelMehrzahl: 'Bauteile', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 240, gruppe: 'Bauteil' },
    { name: 'art', titel: 'Bauteilart', art: 'auswahl', inListe: true, breite: 150, gruppe: 'Bauteil', optionen: BAUTEILARTEN },
    { name: 'geschoss', titel: 'Geschoss', art: 'verweis', ziel: 'geschoss', inListe: true, breite: 130, gruppe: 'Bauteil' },
    { name: 'lage', titel: 'Lage', art: 'auswahl', inListe: true, breite: 100, gruppe: 'Bauteil', optionen: [{ wert: '', titel: 'offen' }, { wert: 'aussen', titel: 'außen' }, { wert: 'innen', titel: 'innen' }] },
    { name: 'tragend', titel: 'Tragend', art: 'auswahl', gruppe: 'Bauteil', wenn: { art: WAENDE }, optionen: [{ wert: '', titel: 'offen' }, { wert: 'ja', titel: 'tragend' }, { wert: 'nein', titel: 'nicht tragend' }] },
    { name: 'wand', titel: 'sitzt in Wand', art: 'verweis', ziel: 'bauteil', gruppe: 'Bauteil', wenn: { art: ['fenster', 'tuer'] } },
    { name: 'kostengruppe', titel: 'Kostengruppe (DIN 276)', art: 'verweis', ziel: 'kostengruppe', inListe: true, breite: 230, gruppe: 'Bauteil' },
    { name: 'gewerk', titel: 'Gewerk', art: 'text', gruppe: 'Bauteil' },
    { name: 'menge', titel: 'Menge', art: 'zahl', inListe: true, breite: 100, gruppe: 'Menge', einheit: 'einheit' },
    { name: 'einheit', titel: 'Einheit', art: 'auswahl', inListe: true, breite: 90, gruppe: 'Menge', optionen: [{ wert: 'm2', titel: 'm²' }, { wert: 'm', titel: 'm' }, { wert: 'stk', titel: 'Stück' }, { wert: 'm3', titel: 'm³' }] },
    { name: 'abmessung', titel: 'Abmessung', art: 'text', inListe: true, breite: 140, gruppe: 'Menge' },
    { name: 'aufbau', titel: 'Aufbau', art: 'verweis', ziel: 'aufbau', inListe: true, breite: 240, gruppe: 'Aufbau' },
    { name: 'material', titel: 'Material laut Plan', art: 'text', gruppe: 'Aufbau' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Aufbau' },
    { name: 'kennung', titel: 'Kennung im Plan (IFC)', art: 'text', gruppe: 'Aus dem Plan' },
  ],
};

export const gebaeudemodell: Beipackzettel = {
  id: 'gebaeudemodell',
  handy: 'lesen',
  zeichen: 'gebaeude',
  farbe: '#0b7285',
  name: 'Gebäudemodell',
  version: '0.1.0',
  beschreibung: 'Der Kern: Gebäude, Geschosse, Räume und Bauteile eines Projekts – mit Herkunft je Wert, in Versionen.',
  braucht: ['projekte', 'kataloge'],
  objekte: [gebaeude, gebaeudeteil, geschoss, raum, aufbau, aufbauSchicht, bauteil],
  ansichten: [
    { id: 'gebaeude', titel: 'Gebäude', abschnitt: 'Gebäude', zeichen: 'gebaeude', objekt: 'gebaeude', brauchtProjekt: true },
    { id: 'geschosse', titel: 'Geschosse', abschnitt: 'Gebäude', zeichen: 'liste', objekt: 'geschoss', baum: ['gebaeude'], brauchtProjekt: true },
    { id: 'raeume', titel: 'Räume', abschnitt: 'Gebäude', zeichen: 'kacheln', objekt: 'raum', baum: ['geschoss'], brauchtProjekt: true },
    { id: 'modell3d', titel: '3D', abschnitt: 'Modell', zeichen: 'modell3d', objekt: 'bauteil', brauchtProjekt: true,
      hilfe: 'Das Gebäude aus dem eingelesenen Plan (IFC) in 3D.\n\nZiehen dreht, das Mausrad zoomt, mit der rechten Taste (oder Umschalt) verschieben. Ein Klick auf ein Bauteil zeigt rechts seine Karte, Strg + Klick wählt dazu. Oben Geschosse und Dach ein- und ausblenden und die Geschosse auseinanderziehen; unten färben nach Bauteilart, Lage oder Aufbau.\n\nLinks filtern (z. B. Fenster ODER Türen, NICHT Innenwände): das Modell zeigt nur, was der Filter durchlässt. „Gemeinsam bearbeiten“ ändert alle gefilterten Bauteile in einer Maske.' },
    { id: 'bauteile', titel: 'Bauteile', abschnitt: 'Modell', zeichen: 'bausteine', objekt: 'bauteil', baum: ['art', 'geschoss'], brauchtProjekt: true },
    { id: 'fenster', titel: 'Fensterliste', abschnitt: 'Listen', zeichen: 'fensterliste', objekt: 'bauteil', filter: { art: 'fenster' }, baum: ['geschoss'], brauchtProjekt: true,
      hilfe: 'Alle Fenster des Modells nach Geschoss (wie die Fenster- & Türliste im bisherigen Bauportal) – mit Abmessung, Lage und Wand. Spalten über „Spalten“ wählen; „Excel“ gibt die Liste aus.' },
    { id: 'tueren', titel: 'Türliste', abschnitt: 'Listen', zeichen: 'tuer', objekt: 'bauteil', filter: { art: 'tuer' }, baum: ['geschoss'], brauchtProjekt: true,
      hilfe: 'Alle Türen und Tore des Modells nach Geschoss – mit Abmessung, Lage und Wand. Spalten über „Spalten“ wählen; „Excel“ gibt die Liste aus.' },
    { id: 'kosten', titel: 'nach Kostengruppen', abschnitt: 'Modell', zeichen: 'liste_aufgaben', objekt: 'bauteil', baum: ['kostengruppe'], brauchtProjekt: true },
    { id: 'aufbauten', titel: 'Aufbauten', abschnitt: 'Modell', zeichen: 'baum', objekt: 'aufbau', baum: ['art'], brauchtProjekt: true },
  ],
  versionen: [{ bereich: 'gebaeudemodell', titel: 'Gebäudemodell', wege: ['kopie', 'leer', 'projekt'] }],
};
