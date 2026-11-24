import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';

export const kontakt: ObjektModell = {
  name: 'kontakt',
  titel: 'Kontakt',
  titelMehrzahl: 'Kontakte',
  anzeigeFeld: 'name',
  rechte: {
    lesen: ['bueroleitung', 'bauleitung', 'mitarbeiter'],
    schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'],
    loeschen: ['bueroleitung', 'bauleitung'],
  },
  felder: [
    { name: 'name', titel: 'Name', art: 'text', pflicht: true, inListe: true, breite: 260, gruppe: 'Kontakt' },
    { name: 'art', titel: 'Art', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Kontakt', optionen: [
      { wert: 'firma', titel: 'Firma' },
      { wert: 'person', titel: 'Person' },
      { wert: 'behoerde', titel: 'Behörde' },
      { wert: 'plotdienst', titel: 'Plotdienst' },
    ] },
    { name: 'ansprechpartner', titel: 'Ansprechpartner:in', art: 'text', gruppe: 'Kontakt' },
    { name: 'gewerk', titel: 'Gewerk', art: 'text', inListe: true, breite: 170, gruppe: 'Kontakt' },
    { name: 'strasse', titel: 'Straße und Hausnummer', art: 'text', gruppe: 'Anschrift' },
    { name: 'plz', titel: 'PLZ', art: 'text', gruppe: 'Anschrift' },
    { name: 'ort', titel: 'Ort', art: 'text', inListe: true, breite: 150, gruppe: 'Anschrift' },
    { name: 'telefon', titel: 'Telefon', art: 'telefon', inListe: true, breite: 160, gruppe: 'Erreichbarkeit' },
    { name: 'mobil', titel: 'Mobil', art: 'telefon', gruppe: 'Erreichbarkeit' },
    { name: 'email', titel: 'E-Mail', art: 'email', inListe: true, breite: 230, gruppe: 'Erreichbarkeit' },
    { name: 'web', titel: 'Internetseite', art: 'text', gruppe: 'Erreichbarkeit' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
  ],
};

export const adressen: Beipackzettel = {
  id: 'adressen',
  name: 'Adressen',
  version: '0.1.0',
  beschreibung: 'Firmen, Personen und Behörden – eine Liste für alle Module.',
  braucht: [],
  objekte: [kontakt],
  ansichten: [{ id: 'kontakte', titel: 'Kontakte', objekt: 'kontakt' }],
};
