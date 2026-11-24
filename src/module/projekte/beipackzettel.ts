import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

export const projekt: ObjektModell = {
  name: 'projekt',
  titel: 'Projekt',
  titelMehrzahl: 'Projekte',
  anzeigeFeld: 'name',
  projektFeld: 'id',
  // Anlegen können nur Rollen, die alle Projekte sehen. Ändern: wer schreiben darf UND Mitglied ist.
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'name', titel: 'Projektname', art: 'text', pflicht: true, inListe: true, breite: 280, gruppe: 'Projekt' },
    { name: 'nummer', titel: 'Projektnummer', art: 'text', inListe: true, breite: 130, gruppe: 'Projekt' },
    { name: 'status', titel: 'Status', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Projekt', optionen: [
      { wert: 'aktiv', titel: 'Aktiv' },
      { wert: 'ruht', titel: 'Ruht' },
      { wert: 'archiviert', titel: 'Archiviert' },
    ] },
    { name: 'bauherr', titel: 'Bauherr:in', art: 'text', inListe: true, breite: 200, gruppe: 'Projekt' },
    { name: 'strasse', titel: 'Straße und Hausnummer', art: 'text', gruppe: 'Baustelle' },
    { name: 'plz', titel: 'PLZ', art: 'text', gruppe: 'Baustelle' },
    { name: 'ort', titel: 'Ort', art: 'text', inListe: true, breite: 150, gruppe: 'Baustelle' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
  ],
};

export const projektMitglied: ObjektModell = {
  name: 'projekt_mitglied',
  titel: 'Projektmitglied',
  titelMehrzahl: 'Projektmitglieder',
  anzeigeFeld: 'benutzer',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'benutzer', titel: 'Benutzer', art: 'verweis', ziel: 'benutzer', pflicht: true },
  ],
};

export const projekte: Beipackzettel = {
  id: 'projekte',
  name: 'Projekte',
  version: '0.1.0',
  beschreibung: 'Projekte und wer daran mitarbeitet. Daran hängen später Bautagebuch, Termine und Kosten.',
  braucht: ['verwaltung'],
  objekte: [projekt, projektMitglied],
  ansichten: [{ id: 'projekte', titel: 'Projekte', objekt: 'projekt' }],
};
