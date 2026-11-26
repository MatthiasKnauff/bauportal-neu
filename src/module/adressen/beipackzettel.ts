// Modul Adressen: Firmen, Personen und Behörden – eine Liste für alle Module.
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
  eingeklappt: ['Firma / Rechnung'],
  felder: [
    // Wie im bisherigen Bauportal: je nach Art die passenden Angaben
    { name: 'name', titel: 'Firma / Name', art: 'text', pflicht: true, inListe: true, breite: 260, gruppe: 'Kontakt' },
    // Art wie im bisherigen Bauportal: fünf feste Arten, dazu eigene (z. B. Planer:in, Versorger) – sie bekommen die Angaben wie eine Firma
    { name: 'art', titel: 'Art', art: 'auswahl', eigeneWerte: true, inListe: true, breite: 120, gruppe: 'Kontakt', optionen: [
      { wert: 'firma', titel: 'Firma' },
      { wert: 'bauherr', titel: 'Bauherr:in' },
      { wert: 'behoerde', titel: 'Behörde' },
      { wert: 'baustelle', titel: 'Baustelle' },
      { wert: 'plotdienst', titel: 'Plotdienst' },
    ] },
    { name: 'ist_firma', titel: 'ist eine Firma (dann Firma und Ansprechpartner:in)', art: 'ja_nein', gruppe: 'Kontakt', wenn: { art: ['bauherr'] } },
    { name: 'gewerk', titel: 'Gewerk bzw. Amt', art: 'text', vorschlagen: true, inListe: true, breite: 170, gruppe: 'Kontakt', wenn: { art: ['firma', 'behoerde', 'plotdienst', 'eigen'] } },
    { name: 'anrede', titel: 'Anrede', art: 'auswahl', kartenBreite: 1, gruppe: 'Ansprechpartner:in', wenn: { art: ['firma', 'bauherr', 'behoerde', 'plotdienst', 'eigen'] }, optionen: [
      { wert: '', titel: '–' }, { wert: 'Herr', titel: 'Herr' }, { wert: 'Frau', titel: 'Frau' },
    ] },
    { name: 'titel', titel: 'Titel', art: 'text', vorschlagen: true, kartenBreite: 1, gruppe: 'Ansprechpartner:in', wenn: { art: ['firma', 'bauherr', 'behoerde', 'plotdienst', 'eigen'] } },
    { name: 'ansprechpartner', titel: 'Vorname Name', art: 'text', kartenBreite: 3, gruppe: 'Ansprechpartner:in', wenn: { art: ['firma', 'bauherr', 'behoerde', 'plotdienst', 'eigen'] } },
    { name: 'zusatz', titel: 'Zusatz', art: 'text', vorschlagen: true, kartenBreite: 1, gruppe: 'Ansprechpartner:in', wenn: { art: ['firma', 'bauherr', 'behoerde', 'plotdienst', 'eigen'] } },
    { name: 'funktion', titel: 'Funktion', art: 'text', vorschlagen: true, gruppe: 'Ansprechpartner:in', wenn: { art: ['firma', 'behoerde', 'plotdienst', 'eigen'] } },
    { name: 'telefon', titel: 'Telefon', art: 'telefon', inListe: true, breite: 160, gruppe: 'Erreichbarkeit' },
    { name: 'mobil', titel: 'Mobil', art: 'telefon', gruppe: 'Erreichbarkeit' },
    { name: 'email', titel: 'E-Mail', art: 'email', inListe: true, breite: 230, gruppe: 'Erreichbarkeit' },
    { name: 'web', titel: 'Internet', art: 'text', gruppe: 'Erreichbarkeit' },
    { name: 'strasse', titel: 'Straße, Nr.', art: 'text', gruppe: 'Anschrift' },
    { name: 'plz', titel: 'PLZ', art: 'text', gruppe: 'Anschrift' },
    { name: 'ort', titel: 'Ort', art: 'text', vorschlagen: true, inListe: true, breite: 150, gruppe: 'Anschrift' },
    { name: 'stichworte', titel: 'Stichwörter', art: 'schlagworte', gruppe: 'Einordnung' },   // was die Firma kann – zum Finden
    { name: 'tags', titel: 'Tags', art: 'schlagworte', gruppe: 'Einordnung' },                                        // eure Einschätzung (z. B. Stammfirma)
    { name: 'rechtsform', titel: 'Rechtsform', art: 'text', vorschlagen: true, gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'plotdienst'] } },
    { name: 'sitz', titel: 'Sitz / Registergericht', art: 'text', vorschlagen: true, gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'plotdienst'] } },
    { name: 'hrb', titel: 'Handelsregister', art: 'text', gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'plotdienst'] } },
    { name: 'mitarbeiter', titel: 'Mitarbeiter:innen', art: 'zahl', gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'plotdienst'] } },
    { name: 'ustid', titel: 'USt-IdNr. / Steuernummer', art: 'text', gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'plotdienst'] } },
    { name: 'rechnung', titel: 'Rechnungsanschrift (falls abweichend)', art: 'langtext', gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'plotdienst'] } },
    { name: 'oeffentlich', titel: 'Öffentliche:r Auftraggeber:in (Vergabe nach VOB/A bzw. UVgO)', art: 'ja_nein', gruppe: 'Firma / Rechnung', wenn: { art: ['firma', 'bauherr', 'behoerde'] } },
    { name: 'notiz', titel: 'Notizen', art: 'langtext', gruppe: 'Notizen' },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

// Weitere Nummern, E-Mails, Anschriften und Ansprechpartner:innen eines Kontakts – Zeilen in seiner Karte
// Ansprechperson wie im Kontakt: Anrede · Titel · Vorname Name · Zusatz in einer Zeile (kartenBreite in Sechsteln)
export const kontaktweg: ObjektModell = {
  name: 'kontaktweg',
  titel: 'Kontaktweg',
  titelMehrzahl: 'Kontaktwege',
  anzeigeFeld: 'wert',
  rechte: kontakt.rechte,
  felder: [
    { name: 'kontakt', titel: 'Kontakt', art: 'verweis', ziel: 'kontakt', pflicht: true, verborgen: true },
    // Wie im bisherigen Bauportal: je Art die passenden Felder – Nummer, E-Mail, Anschrift oder eine Ansprechperson mit eigenem Telefon
    { name: 'art', titel: 'Art', art: 'auswahl', optionen: [
      { wert: 'telefon', titel: '☎ Telefon' }, { wert: 'email', titel: '✉ E-Mail' }, { wert: 'anschrift', titel: '📍 Anschrift' }, { wert: 'person', titel: '👤 Ansprechpartner:in' },
    ] },
    { name: 'anrede', kartenBreite: 1, titel: 'Anrede', art: 'auswahl', wenn: { art: ['person'] }, optionen: [{ wert: '', titel: '–' }, { wert: 'Herr', titel: 'Herr' }, { wert: 'Frau', titel: 'Frau' }] },
    { name: 'titel', kartenBreite: 1, titel: 'Titel', art: 'text', vorschlagen: true, wenn: { art: ['person'] } },
    { name: 'wert', kartenBreite: 3, titel: 'Nummer, E-Mail oder Name', art: 'text', wenn: { art: ['telefon', 'email', 'person'] } },
    { name: 'zusatz', kartenBreite: 1, titel: 'Zusatz', art: 'text', vorschlagen: true, wenn: { art: ['person'] } },
    { name: 'bezeichnung', kartenBreite: 3, titel: 'Bezeichnung', art: 'text', vorschlagen: true },   // z. B. Zentrale, Rechnungen, Lager – bei Ansprechpartner:innen die Funktion
    { name: 'amt', kartenBreite: 3, titel: 'Amt / Abteilung', art: 'text', vorschlagen: true, wenn: { art: ['person'] } },
    { name: 'telefon', kartenBreite: 3, titel: 'Telefon', art: 'telefon', wenn: { art: ['person'] } },
    { name: 'email', kartenBreite: 3, titel: 'E-Mail (leer = die der Firma)', art: 'email', wenn: { art: ['person'] } },
    { name: 'strasse', kartenBreite: 3, titel: 'Straße, Nr.', art: 'text', wenn: { art: ['anschrift'] } },
    { name: 'plz', kartenBreite: 1, titel: 'PLZ', art: 'text', wenn: { art: ['anschrift'] } },
    { name: 'ort', kartenBreite: 2, titel: 'Ort', art: 'text', vorschlagen: true, wenn: { art: ['anschrift'] } },
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
  ],
};

export const adressen: Beipackzettel = {
  id: 'adressen',
  handy: 'voll',
  zeichen: 'adressen',
  farbe: '#7048e8',
  name: 'Adressen',
  version: '0.1.0',
  beschreibung: 'Firmen, Personen und Behörden – eine Liste für alle Module.',
  braucht: [],
  objekte: [kontakt, kontaktweg],
  // Adressverzeichnis wie im bisherigen Bauportal: die gefilterte Liste oder die Auswahl, die Filterbeschreibung oben
  ausdrucke: [{
    id: 'adressen.verzeichnis', titel: 'Adressverzeichnis', objekt: 'kontakt', verzeichnis: true, format: 'quer',
    dateiname: 'Adressverzeichnis {datum}', fuss: '{buero} · Adressverzeichnis vom {datum}',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Adressverzeichnis', unter: '{anzahl} · {filter}' },
      { id: 'liste', art: 'verzeichnis', titel: 'Kontakte', spalten: ['name', 'gewerk', 'ansprechpartner', 'telefon', 'mobil', 'email', 'strasse', 'plz', 'ort'] },
    ],
  }],
  ansichten: [{ id: 'kontakte', titel: 'Kontakte', abschnitt: 'Kontakte', zeichen: 'adressen', objekt: 'kontakt',
    // links wie im bisherigen Bauportal: Kontakte nach Art, Gewerke (mit Suche), Ämter der Behörden – je mit Anzahl
    linksFilter: [
      { feld: 'art', titel: 'Kontakte', art: 'Art', alle: 'Alle',
        mehrzahl: { firma: 'Firmen', bauherr: 'Bauherr:innen', behoerde: 'Behörden', baustelle: 'Baustellen', plotdienst: 'Plotdienste' },
        zeichen: { firma: 'gebaeude', bauherr: 'start', behoerde: 'pruefung', baustelle: 'standort', plotdienst: 'drucken' } },
      { titel: 'Projekte', art: 'Projekt', suche: true, beteiligt: { objekt: 'projekt_kontakt', feld: 'kontakt', titel: 'Beteiligte' } },
      { feld: 'gewerk', titel: 'Gewerke', art: 'Gewerk', suche: true, nur: { art: ['firma', 'plotdienst', 'bauherr', 'eigen'] } },
      { feld: 'gewerk', titel: 'Ämter der Behörden', art: 'Amt', nur: { art: ['behoerde'] } },
    ],
    // dazu im Suchfeld: Vorschläge nach Art – wie im bisherigen Bauportal
    suchArten: [{ titel: 'Name', felder: ['name', 'ansprechpartner'] }, { titel: 'Ort', felder: ['ort'] }, { titel: 'Funktion', felder: ['funktion'] },
      { titel: 'Stichwort', felder: ['stichworte'] }, { titel: 'Tag', felder: ['tags'] }] }],
};
