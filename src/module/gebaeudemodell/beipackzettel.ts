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

export const gebaeude: ObjektModell = {
  ...basis, name: 'gebaeude', titel: 'Gebäude', titelMehrzahl: 'Gebäude', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 240, gruppe: 'Gebäude' },
    { name: 'nutzung', titel: 'Nutzung', art: 'auswahl', inListe: true, breite: 170, gruppe: 'Gebäude', optionen: [
      { wert: '', titel: 'noch offen' }, { wert: 'wohnen', titel: 'Wohnen' }, { wert: 'buero', titel: 'Büro und Verwaltung' }, { wert: 'gewerbe', titel: 'Gewerbe' },
      { wert: 'bildung', titel: 'Schule, Kita' }, { wert: 'gesundheit', titel: 'Gesundheit, Pflege' }, { wert: 'sonder', titel: 'Sonderbau' },
    ] },
    { name: 'massnahme', titel: 'Maßnahme', art: 'auswahl', inListe: true, breite: 130, gruppe: 'Gebäude', optionen: [
      { wert: 'neubau', titel: 'Neubau' }, { wert: 'umbau', titel: 'Umbau' }, { wert: 'sanierung', titel: 'Sanierung' }, { wert: 'erweiterung', titel: 'Erweiterung' },
    ] },
    { name: 'bgf', titel: 'Brutto-Grundfläche in m²', art: 'zahl', inListe: true, breite: 150, gruppe: 'Größe' },
    { name: 'bri', titel: 'Brutto-Rauminhalt in m³', art: 'zahl', inListe: true, breite: 150, gruppe: 'Größe' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung im Plan (IFC)', art: 'text', gruppe: 'Aus dem Plan' },
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

export const bauteil: ObjektModell = {
  ...basis, name: 'bauteil', titel: 'Bauteil', titelMehrzahl: 'Bauteile', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 240, gruppe: 'Bauteil' },
    { name: 'art', titel: 'Bauteilart', art: 'auswahl', inListe: true, breite: 150, gruppe: 'Bauteil', optionen: [
      { wert: 'aussenwand', titel: 'Außenwand' }, { wert: 'innenwand', titel: 'Innenwand' }, { wert: 'decke', titel: 'Decke' }, { wert: 'dach', titel: 'Dach' },
      { wert: 'bodenplatte', titel: 'Bodenplatte' }, { wert: 'fenster', titel: 'Fenster' }, { wert: 'tuer', titel: 'Tür, Tor' }, { wert: 'stuetze', titel: 'Stütze, Träger' },
      { wert: 'treppe', titel: 'Treppe' }, { wert: 'sonstiges', titel: 'Sonstiges' },
    ] },
    { name: 'geschoss', titel: 'Geschoss', art: 'verweis', ziel: 'geschoss', inListe: true, breite: 130, gruppe: 'Bauteil' },
    { name: 'gewerk', titel: 'Gewerk', art: 'text', gruppe: 'Bauteil' },
    { name: 'lage', titel: 'Lage', art: 'auswahl', inListe: true, breite: 100, gruppe: 'Bauteil', optionen: [{ wert: '', titel: 'offen' }, { wert: 'aussen', titel: 'außen' }, { wert: 'innen', titel: 'innen' }] },
    { name: 'menge', titel: 'Menge', art: 'zahl', inListe: true, breite: 100, gruppe: 'Menge' },
    { name: 'einheit', titel: 'Einheit', art: 'auswahl', inListe: true, breite: 90, gruppe: 'Menge', optionen: [{ wert: 'm2', titel: 'm²' }, { wert: 'm', titel: 'm' }, { wert: 'stk', titel: 'Stück' }, { wert: 'm3', titel: 'm³' }] },
    { name: 'abmessung', titel: 'Abmessung', art: 'text', gruppe: 'Menge' },
    { name: 'aufbau', titel: 'Aufbau, Material', art: 'text', inListe: true, breite: 220, gruppe: 'Aufbau' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Aufbau' },
    { name: 'kennung', titel: 'Kennung im Plan (IFC)', art: 'text', gruppe: 'Aus dem Plan' },
  ],
};

export const gebaeudemodell: Beipackzettel = {
  id: 'gebaeudemodell',
  name: 'Gebäudemodell',
  version: '0.1.0',
  beschreibung: 'Der Kern: Gebäude, Geschosse, Räume und Bauteile eines Projekts – mit Herkunft je Wert, in Versionen.',
  braucht: ['projekte'],
  objekte: [gebaeude, geschoss, raum, bauteil],
  ansichten: [
    { id: 'bauteile', titel: 'Bauteile', objekt: 'bauteil', baum: ['art', 'geschoss'], brauchtProjekt: true },
    { id: 'raeume', titel: 'Räume', objekt: 'raum', baum: ['geschoss'], brauchtProjekt: true },
    { id: 'geschosse', titel: 'Geschosse', objekt: 'geschoss', baum: ['gebaeude'], brauchtProjekt: true },
    { id: 'gebaeude', titel: 'Gebäude', objekt: 'gebaeude', brauchtProjekt: true },
  ],
  versionen: [{ bereich: 'gebaeudemodell', titel: 'Gebäudemodell', wege: ['kopie', 'leer', 'projekt'] }],
};
