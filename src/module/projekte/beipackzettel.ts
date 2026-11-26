// Modul Projekte: Projekte, ihre Mitglieder (wer sieht was), Beteiligte aus den Adressen und die Versionen aller Module.
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
    { name: 'ordner', titel: 'Ordner auf dem Dateiserver', art: 'text', gruppe: 'Ablage' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

// Favoriten und „Zuletzt benutzt“ der Projektwahl – je Benutzer, nur für ihn sichtbar
export const projektMerker: ObjektModell = {
  name: 'projekt_merker',
  titel: 'Projekt-Merker',
  titelMehrzahl: 'Projekt-Merker',
  anzeigeFeld: 'projekt',
  projektFeld: 'projekt',
  eigenFeld: 'benutzer',
  rechte: { lesen: ALLE, schreiben: ALLE, loeschen: ALLE },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'benutzer', titel: 'Benutzer', art: 'verweis', ziel: 'benutzer', pflicht: true },
    { name: 'favorit', titel: 'Favorit', art: 'ja_nein' },
    { name: 'zuletzt', titel: 'Zuletzt benutzt', art: 'text' },   // Zeitpunkt (ISO) – sortiert richtig
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

export const projektKontakt: ObjektModell = {
  name: 'projekt_kontakt',
  titel: 'Beteiligte:r',
  titelMehrzahl: 'Projektbeteiligte',
  anzeigeFeld: 'kontakt',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'kontakt', titel: 'Kontakt', art: 'verweis', ziel: 'kontakt', pflicht: true },
    { name: 'aufgabe', titel: 'Aufgabe im Projekt (z. B. das Gewerk)', art: 'text' },
    { name: 'vergabe', titel: 'Vergabe', art: 'auswahl', optionen: [
      { wert: '', titel: '–' }, { wert: 'offen', titel: 'offen' }, { wert: 'angefragt', titel: 'angefragt' }, { wert: 'angebot', titel: 'Angebot liegt vor' },
      { wert: 'beauftragt', titel: 'beauftragt' }, { wert: 'abgeschlossen', titel: 'abgeschlossen' },
    ] },
    { name: 'notiz', titel: 'Notiz', art: 'text' },
  ],
};

// Versionen: benannte, unabhängig bearbeitbare Stände je Projekt und Bereich (z. B. Bauzeitenplan „Startversion“).
// Genau eine Version je Projekt und Bereich ist gültig – darauf zeigen später die Verknüpfungen.
export const version: ObjektModell = {
  name: 'version',
  titel: 'Version',
  titelMehrzahl: 'Versionen',
  anzeigeFeld: 'name',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'bereich', titel: 'Bereich', art: 'text', pflicht: true },
    { name: 'name', titel: 'Name der Version', art: 'text', pflicht: true },
    { name: 'gueltig', titel: 'Gültige Version', art: 'ja_nein' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext' },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

export const projekte: Beipackzettel = {
  id: 'projekte',
  zeichen: 'projekte',
  name: 'Projekte',
  version: '0.1.0',
  beschreibung: 'Projekte und wer daran mitarbeitet. Daran hängen später Bautagebuch, Termine und Kosten.',
  braucht: ['verwaltung', 'adressen'],
  objekte: [projekt, projektMitglied, projektKontakt, projektMerker, version],
  ansichten: [],   // Projekte stehen wie im bisherigen Bauportal in der Verwaltung (Büro → Projekte), gewählt wird oben in der Kopfleiste
};
