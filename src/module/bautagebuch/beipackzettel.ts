// Modul Bautagebuch: Tagesberichte mit Einträgen und Fotos, projektweite Mängel-, Aufgaben- und Weisungslisten, Ausdruck.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] };

// Je Projekt eine Liste nummerierter Berichte mit Datum – ohne Versionen.
// Der Bericht selbst trägt Kopf, Wetter und Kontrollen; was auf der Baustelle war, steht als einzelne Einträge darunter.
export const tagesbericht: ObjektModell = {
  name: 'tagesbericht',
  titel: 'Tagesbericht',
  titelMehrzahl: 'Tagesberichte',
  anzeigeFeld: 'titel',
  ersatzName: ['nummer', 'datum'],
  projektFeld: 'projekt',
  rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'nummer', titel: 'Nr.', art: 'zahl', inListe: true, breite: 70, gruppe: 'Bericht' },
    { name: 'datum', titel: 'Datum', art: 'datum', pflicht: true, inListe: true, breite: 120, gruppe: 'Bericht' },
    { name: 'uhrzeit', titel: 'Uhrzeit', art: 'text', inListe: true, breite: 90, gruppe: 'Bericht' },
    { name: 'titel', titel: 'Kurzbeschreibung', art: 'text', verborgen: true },   // braucht der Tagesbericht nicht (26.11.2026) – bleibt für alte Einträge in der Datenbank
    { name: 'bauleitung', titel: 'Bauleitung', art: 'verweis', ziel: 'benutzer', inListe: true, breite: 160, gruppe: 'Bericht' },
    { name: 'wetter', titel: 'Wetter', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Wetter', optionen: [
      { wert: '', titel: 'keine Angabe' },
      { wert: 'sonnig', titel: 'Sonnig' },
      { wert: 'bewoelkt', titel: 'Bewölkt' },
      { wert: 'regen', titel: 'Regen' },
      { wert: 'schnee', titel: 'Schnee' },
      { wert: 'frost', titel: 'Frost' },
      { wert: 'sturm', titel: 'Sturm' },
    ] },
    { name: 'temperatur', titel: 'Temperatur in °C', art: 'zahl', gruppe: 'Wetter' },
    { name: 'luftfeuchte', titel: 'Luftfeuchte in %', art: 'zahl', gruppe: 'Wetter' },
    { name: 'wind', titel: 'Wind in km/h', art: 'zahl', gruppe: 'Wetter' },
    { name: 'niederschlag', titel: 'Niederschlag in mm', art: 'zahl', gruppe: 'Wetter' },
    { name: 'aufgeraeumt', titel: 'Baustelle aufgeräumt', art: 'ja_nein', gruppe: 'Kontrollen' },
    { name: 'masskontrolle', titel: 'Maßkontrolle', art: 'ja_nein', gruppe: 'Kontrollen' },
    { name: 'fotodoku', titel: 'Fotodokumentation', art: 'ja_nein', gruppe: 'Kontrollen' },
    { name: 'pdf', titel: 'Als PDF exportiert', art: 'text', verborgen: true },
    { name: 'soll_aus', titel: 'Ausgeblendete Vorschläge laut Bauzeitenplan', art: 'langtext', verborgen: true },   // je Zeile eine Firmen-Kennung bzw. „g:Gewerk“
    { name: 'firmen_angesprochen', titel: 'Alle Firmen angesprochen', art: 'ja_nein', gruppe: 'Kontrollen' },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

// Was in einem Bericht steht: Anwesende, Notizen, Mängel, Aufgaben, Weisungen – je ein Eintrag.
// Mängel, Aufgaben und Weisungen sind zugleich die projektweiten Listen (Ansichten unten).
export const EINTRAGSARTEN = [
  { wert: 'anwesend', titel: 'Anwesend', mehrzahl: 'Anwesende' }, { wert: 'notiz', titel: 'Notiz', mehrzahl: 'Notizen' }, { wert: 'mangel', titel: 'Mangel', mehrzahl: 'Mängel' },
  { wert: 'aufgabe', titel: 'Zu erledigen', mehrzahl: 'Zu erledigen' }, { wert: 'weisung', titel: 'Weisung', mehrzahl: 'Weisungen' },
];
const MIT_FRIST = ['notiz', 'mangel', 'aufgabe', 'weisung'];
/** Einträge, die sich abhaken lassen (Schalter „Erledigt“) – überall dieselbe Liste. */
export const MIT_ERLEDIGT = ['mangel', 'aufgabe', 'weisung'];
export const berichtEintrag: ObjektModell = {
  name: 'bericht_eintrag',
  titel: 'Eintrag',
  titelMehrzahl: 'Einträge',
  anzeigeFeld: 'text',
  projektFeld: 'projekt',
  rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'bericht', titel: 'Tagesbericht', art: 'verweis', ziel: 'tagesbericht', pflicht: true, inListe: true, breite: 220, gruppe: 'Eintrag' },
    { name: 'art', titel: 'Art', art: 'auswahl', optionen: EINTRAGSARTEN.map(({ wert, titel }) => ({ wert, titel })), gruppe: 'Eintrag' },
    { name: 'text', titel: 'Text', art: 'langtext', inListe: true, breite: 380, gruppe: 'Eintrag' },
    { name: 'firma', titel: 'Firma', art: 'verweis', ziel: 'kontakt', inListe: true, breite: 220, gruppe: 'Eintrag', wenn: { art: ['anwesend', 'mangel', 'weisung'] } },
    { name: 'personen', titel: 'Personen', art: 'zahl', gruppe: 'Eintrag', wenn: { art: ['anwesend'] } },
    // erwartet laut Bauzeitenplan, aber nicht gekommen – der Text ist dann die Begründung; zählt für die Terminrüge
    { name: 'nicht_da', titel: 'Nicht da', art: 'ja_nein', gruppe: 'Eintrag', wenn: { art: ['anwesend'] } },
    { name: 'frist', titel: 'Frist', art: 'datum', inListe: true, breite: 120, gruppe: 'Erledigung', wenn: { art: MIT_FRIST } },
    { name: 'erledigt', titel: 'Erledigt', art: 'ja_nein', inListe: true, breite: 100, gruppe: 'Erledigung', wenn: { art: MIT_ERLEDIGT } },
    { name: 'reihe', titel: 'Reihenfolge im Bericht', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

// Fotos zum Bericht. Das Original liegt im Projektordner auf dem Dateiserver (oder, wo das nicht geht, im Speicher des
// Bauportals); im Bauportal selbst liegt nur ein Vorschaubild. Angelegt werden Fotos über das Hochladen (server/foto.ts).
export const foto: ObjektModell = {
  name: 'foto',
  titel: 'Foto',
  titelMehrzahl: 'Fotos',
  anzeigeFeld: 'name',
  projektFeld: 'projekt',
  rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'bericht', titel: 'Tagesbericht', art: 'verweis', ziel: 'tagesbericht', pflicht: true, inListe: true, breite: 220, gruppe: 'Foto' },
    { name: 'name', titel: 'Dateiname', art: 'text', pflicht: true, inListe: true, breite: 260, gruppe: 'Foto' },
    { name: 'beschriftung', titel: 'Beschriftung', art: 'text', inListe: true, breite: 300, gruppe: 'Foto' },
    { name: 'ort', titel: 'Original liegt', art: 'auswahl', inListe: true, breite: 170, gruppe: 'Ablage', optionen: [{ wert: 'ablage', titel: 'im Projektordner' }, { wert: 'bauportal', titel: 'im Bauportal' }] },
    { name: 'pfad', titel: 'Pfad des Originals', art: 'text', gruppe: 'Ablage' },
    { name: 'reihe', titel: 'Reihenfolge im Bericht', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

const liste = (art: string, spalten: string[]) => ({ id: art, art: 'liste' as const, objekt: 'bericht_eintrag', ueber: 'bericht', filter: { art }, titel: EINTRAGSARTEN.find((e) => e.wert === art)!.mehrzahl, spalten });

export const bautagebuch: Beipackzettel = {
  id: 'bautagebuch',
  handy: 'eigen',
  zeichen: 'bericht',
  name: 'Bautagebuch',
  version: '0.2.0',
  beschreibung: 'Nummerierte Tagesberichte je Projekt: Wetter, Anwesende, Notizen, Mängel, Aufgaben, Weisungen – mit Ausdruck.',
  braucht: ['projekte', 'adressen'],
  objekte: [tagesbericht, berichtEintrag, foto],
  ansichten: [
    { id: 'berichte', titel: 'Berichte', abschnitt: 'Bautagebuch', zeichen: 'bericht', objekt: 'tagesbericht', brauchtProjekt: true },
    { id: 'maengel', titel: 'Mängel', abschnitt: 'Im Projekt', zeichen: 'mangel', objekt: 'bericht_eintrag', brauchtProjekt: true, filter: { art: 'mangel' }, baum: ['erledigt', 'firma'] },
    { id: 'aufgaben', titel: 'Zu erledigen', abschnitt: 'Im Projekt', zeichen: 'aufgabe', objekt: 'bericht_eintrag', brauchtProjekt: true, filter: { art: 'aufgabe' }, baum: ['erledigt'] },
    { id: 'weisungen', titel: 'Weisungen', abschnitt: 'Im Projekt', zeichen: 'weisung', objekt: 'bericht_eintrag', brauchtProjekt: true, filter: { art: 'weisung' }, baum: ['firma'] },
    { id: 'fotos', titel: 'Fotos', abschnitt: 'Im Projekt', zeichen: 'foto', objekt: 'foto', brauchtProjekt: true, baum: ['bericht'] },
  ],
  ausdrucke: [{
    id: 'bautagebuch.tagesbericht', titel: 'Tagesbericht', objekt: 'tagesbericht',
    dateiname: 'Tagesbericht {nummer} {datum} {projekt}', fuss: '{buero} · Tagesbericht Nr. {nummer} vom {datum}', ordner: 'Bautagebuch/Berichte', vermerk: 'pdf',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Tagesbericht Nr. {nummer}', unter: '{datum}' },
      { id: 'angaben', art: 'felder', felder: ['datum', 'uhrzeit', 'nummer', 'bauleitung', 'wetter', 'temperatur', 'luftfeuchte', 'wind', 'niederschlag'] },
      { id: 'kontrollen', art: 'felder', felder: ['aufgeraeumt', 'masskontrolle', 'fotodoku', 'firmen_angesprochen'] },
      liste('anwesend', ['firma', 'text', 'personen']),
      liste('notiz', ['text', 'frist']),
      liste('mangel', ['text', 'firma', 'frist', 'erledigt']),
      liste('aufgabe', ['text', 'frist', 'erledigt']),
      liste('weisung', ['text', 'firma', 'frist', 'erledigt']),
      { id: 'fotos', art: 'bilder', objekt: 'foto', ueber: 'bericht', titel: 'Fotos', beschriftung: 'beschriftung' },
    ],
  }],
};
