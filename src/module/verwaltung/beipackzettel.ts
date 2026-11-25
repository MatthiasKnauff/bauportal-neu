// Modul Verwaltung: Benutzer, Rechte, Bürodaten, Ablage, Druckeinstellungen, KI-Anbindungen, Updates, Aufbau.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE, OHNE_GAST, ROLLEN_OPTIONEN } from '../../kern/rechte';

// Benutzer und Rechte darf nur die Rolle „admin“ ändern – das setzt die Datenbank fest durch,
// unabhängig von den einstellbaren Rechten.
export const benutzer: ObjektModell = {
  name: 'benutzer',
  titel: 'Benutzer',
  titelMehrzahl: 'Benutzer',
  anzeigeFeld: 'name',
  rechte: { lesen: OHNE_GAST, schreiben: [], loeschen: [] },
  felder: [
    { name: 'name', titel: 'Name', art: 'text', pflicht: true, inListe: true, breite: 240, gruppe: 'Benutzer' },
    { name: 'anmeldename', titel: 'Anmeldename', art: 'text', pflicht: true, eindeutig: true, klein: true, inListe: true, breite: 220, gruppe: 'Benutzer' },
    { name: 'rolle', titel: 'Rolle', art: 'auswahl', optionen: ROLLEN_OPTIONEN, inListe: true, breite: 170, gruppe: 'Benutzer' },
    { name: 'gesperrt', titel: 'Gesperrt (kann sich nicht anmelden)', art: 'ja_nein', inListe: true, breite: 110, gruppe: 'Benutzer' },
  ],
};

export const recht: ObjektModell = {
  name: 'recht',
  titel: 'Recht',
  titelMehrzahl: 'Rechte',
  anzeigeFeld: 'objekt',
  rechte: { lesen: ALLE, schreiben: [], loeschen: [] },
  felder: [
    { name: 'rolle', titel: 'Rolle', art: 'auswahl', optionen: ROLLEN_OPTIONEN },
    { name: 'objekt', titel: 'Objekt', art: 'text', pflicht: true },
    { name: 'lesen', titel: 'Sehen', art: 'ja_nein' },
    { name: 'schreiben', titel: 'Anlegen und ändern', art: 'ja_nein' },
    { name: 'loeschen', titel: 'Löschen', art: 'ja_nein' },
  ],
};

export const BUERO_ID = '00000000-0000-4000-8000-0000000b0e01';
export const BUNDESLAENDER = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern',
  'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'];

export const buero: ObjektModell = {
  name: 'buero',
  titel: 'Büro',
  titelMehrzahl: 'Büro',
  anzeigeFeld: 'name',
  einzeln: BUERO_ID,
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: [] },
  felder: [
    { name: 'name', titel: 'Name des Büros', art: 'text', gruppe: 'Büro' },
    { name: 'bundesland', titel: 'Bundesland (Vorgabe, je Bauantrag änderbar)', art: 'auswahl', gruppe: 'Büro',
      optionen: [{ wert: '', titel: 'noch nicht gewählt' }, ...BUNDESLAENDER.map((b) => ({ wert: b, titel: b }))] },
    { name: 'strasse', titel: 'Straße und Hausnummer', art: 'text', gruppe: 'Anschrift' },
    { name: 'plz', titel: 'PLZ', art: 'text', gruppe: 'Anschrift' },
    { name: 'ort', titel: 'Ort', art: 'text', gruppe: 'Anschrift' },
    { name: 'telefon', titel: 'Telefon', art: 'telefon', gruppe: 'Anschrift' },
    { name: 'email', titel: 'E-Mail', art: 'email', gruppe: 'Anschrift' },
  ],
};

// Verbindung zur Ablage auf dem Dateiserver. Das Kennwort steht nicht hier (und nie im Protokoll),
// sondern verschlüsselt in der Datenbank; der Schlüssel dazu liegt im Daten-Volume.
export const ABLAGE_ID = '00000000-0000-4000-8000-0000000ab1a6';
export const ablage: ObjektModell = {
  name: 'ablage',
  titel: 'Ablage',
  titelMehrzahl: 'Ablage',
  anzeigeFeld: 'freigabe',
  einzeln: ABLAGE_ID,
  rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'freigabe', titel: 'Freigabe, z. B. \\\\server\\projekte', art: 'text', gruppe: 'Dateiserver' },
    { name: 'benutzer', titel: 'Benutzer auf dem Dateiserver', art: 'text', gruppe: 'Dateiserver' },
    { name: 'domaene', titel: 'Domäne (meist leer)', art: 'text', gruppe: 'Dateiserver' },
    { name: 'fotos_ordner', titel: 'Unterordner im Projektordner für Fotos des Bautagebuchs (leer: Bautagebuch/Fotos)', art: 'text', gruppe: 'Ordner' },
  ],
};

// Was das Büro an einem Ausdruck eingestellt hat – je Stelle ein Eintrag (Druckwerk, kern/druck.ts).
export const druckeinstellung: ObjektModell = {
  name: 'druckeinstellung',
  titel: 'Druckeinstellung',
  titelMehrzahl: 'Druckeinstellungen',
  anzeigeFeld: 'stelle',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'ausdruck', titel: 'Ausdruck', art: 'text', pflicht: true },
    { name: 'stelle', titel: 'Stelle', art: 'text', pflicht: true },
    { name: 'wert', titel: 'Wert', art: 'text' },
  ],
};

// KI-Anbindungen: die KI im Büro (Ollama) und KIs außerhalb. Der Zugangsschlüssel steht nicht hier (und nie im
// Protokoll), sondern verschlüsselt in der Datenbank. Einrichten dürfen nur Administrator:innen; Gäste nutzen keine KI.
export const KI_ARTEN = [
  { wert: 'ollama', titel: 'KI im Büro (Ollama)' }, { wert: 'claude', titel: 'Claude (Anthropic)' },
  { wert: 'openai', titel: 'ChatGPT (OpenAI)' }, { wert: 'gemini', titel: 'Gemini (Google)' },
];
export const ki_anbindung: ObjektModell = {
  name: 'ki_anbindung',
  titel: 'KI-Anbindung',
  titelMehrzahl: 'KI-Anbindungen',
  anzeigeFeld: 'name',
  rechte: { lesen: OHNE_GAST, schreiben: [], loeschen: [] },
  felder: [
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 220, gruppe: 'Anbindung' },
    { name: 'art', titel: 'Art', art: 'auswahl', optionen: KI_ARTEN, inListe: true, breite: 190, gruppe: 'Anbindung' },
    { name: 'adresse', titel: 'Adresse von Ollama, z. B. http://192.168.1.20:11434', art: 'text', gruppe: 'Anbindung', wenn: { art: ['ollama'] } },
    { name: 'modell', titel: 'Modell', art: 'text', inListe: true, breite: 220, gruppe: 'Anbindung' },
    { name: 'aktiv', titel: 'Eingeschaltet', art: 'ja_nein', inListe: true, breite: 120, gruppe: 'Anbindung' },
  ],
};

// Prüf-KI: eine andere KI kontrolliert und berät – sie liest Aufbau, Prüfung, Quelltext und Betrieb (nie Projektdaten)
// und schickt Ratschläge zurück. Zugang nur mit eigenem Schlüssel, den die Verwaltung erzeugt und widerrufen kann.
export const pruefzugang: ObjektModell = {
  name: 'pruefzugang',
  titel: 'Prüf-Zugang',
  titelMehrzahl: 'Prüf-Zugänge',
  anzeigeFeld: 'name',
  rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'name', titel: 'Bezeichnung, z. B. „Prüf-KI Gemini“', art: 'text', pflicht: true, inListe: true, breite: 260, gruppe: 'Zugang' },
    { name: 'aktiv', titel: 'Eingeschaltet', art: 'ja_nein', inListe: true, breite: 120, gruppe: 'Zugang' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Zugang' },
  ],
};
export const RAT_STAENDE = [
  { wert: 'offen', titel: 'Offen' }, { wert: 'angenommen', titel: 'Angenommen' }, { wert: 'umgesetzt', titel: 'Umgesetzt' }, { wert: 'abgelehnt', titel: 'Abgelehnt' },
];
export const pruefrat: ObjektModell = {
  name: 'pruefrat',
  titel: 'Ratschlag',
  titelMehrzahl: 'Ratschläge',
  anzeigeFeld: 'titel',
  rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'titel', titel: 'Ratschlag', art: 'text', pflicht: true, inListe: true, breite: 360, gruppe: 'Ratschlag' },
    { name: 'stand', titel: 'Stand', art: 'auswahl', optionen: RAT_STAENDE, inListe: true, breite: 130, gruppe: 'Ratschlag' },
    { name: 'baustein', titel: 'Betrifft (Datei oder Objekt)', art: 'text', inListe: true, breite: 240, gruppe: 'Ratschlag' },
    { name: 'regel', titel: 'Regel', art: 'text', gruppe: 'Ratschlag' },
    { name: 'text', titel: 'Begründung der Prüf-KI', art: 'langtext', gruppe: 'Ratschlag' },
    { name: 'antwort', titel: 'Unsere Antwort (liest die Prüf-KI mit)', art: 'langtext', gruppe: 'Antwort' },
    { name: 'eingang', titel: 'Eingegangen', art: 'datum', inListe: true, breite: 120, gruppe: 'Herkunft' },
    { name: 'zugang', titel: 'Von', art: 'verweis', ziel: 'pruefzugang', inListe: true, breite: 180, gruppe: 'Herkunft' },
  ],
};

// Designs des Büros (eingefügt im shadcn-Format, übersetzt in kern/design) und die Wahl je Benutzer
export const design: ObjektModell = {
  name: 'design', titel: 'Design', titelMehrzahl: 'Designs', anzeigeFeld: 'name',
  rechte: { lesen: ALLE, schreiben: ALLE, loeschen: ['bueroleitung'] },
  felder: [
    { name: 'name', titel: 'Name', art: 'text', pflicht: true, inListe: true, breite: 220 },
    { name: 'hell', titel: 'Variablen hell (JSON)', art: 'langtext' },
    { name: 'dunkel', titel: 'Variablen dunkel (JSON)', art: 'langtext' },
    { name: 'quelle', titel: 'Herkunft', art: 'text', inListe: true, breite: 220 },
  ],
};

export const designWahl: ObjektModell = {
  name: 'design_wahl', titel: 'Design-Wahl', titelMehrzahl: 'Design-Wahlen', anzeigeFeld: 'benutzer', eigenFeld: 'benutzer',
  rechte: { lesen: ALLE, schreiben: ALLE, loeschen: ALLE },
  felder: [
    { name: 'benutzer', titel: 'Benutzer', art: 'verweis', ziel: 'benutzer', pflicht: true },
    { name: 'design', titel: 'Design', art: 'verweis', ziel: 'design' },   // leer = Standard
    { name: 'modus', titel: 'Hell oder dunkel', art: 'auswahl', optionen: [{ wert: 'system', titel: 'Wie das Gerät' }, { wert: 'hell', titel: 'Hell' }, { wert: 'dunkel', titel: 'Dunkel' }] },
    { name: 'rund', titel: 'Rundung der Ecken', art: 'zahl' },   // leer = wie das Design
  ],
};

export const verwaltung: Beipackzettel = {
  id: 'verwaltung',
  zeichen: 'einstellungen',
  name: 'Verwaltung',
  version: '0.1.0',
  beschreibung: 'Benutzer, Rollen und Rechte, Bürodaten, Ablage, KI, Updates, Aufbau und Prüf-KI.',
  braucht: [],
  objekte: [benutzer, recht, buero, ablage, druckeinstellung, ki_anbindung, pruefzugang, pruefrat, design, designWahl],
  ansichten: [
    // „Für mich“: für jede:n – eigenes Konto und Darstellung (wie im bisherigen Bauportal)
    { id: 'konto', titel: 'Mein Konto', abschnitt: 'Für mich', zeichen: 'schluessel' },
    { id: 'darstellung', titel: 'Darstellung', abschnitt: 'Für mich', zeichen: 'kacheln' },
    { id: 'buero', titel: 'Büro & Standort', abschnitt: 'Büro', zeichen: 'einstellungen' },
    { id: 'projekte', titel: 'Projekte', abschnitt: 'Büro', zeichen: 'projekte', objekt: 'projekt', baum: ['status'] },
    { id: 'benutzer', titel: 'Benutzer', abschnitt: 'Einstellungen', zeichen: 'personen', objekt: 'benutzer', baum: ['rolle'] },
    { id: 'rechte', titel: 'Rechte', abschnitt: 'Einstellungen', zeichen: 'schluessel', nurAdmin: true },
    { id: 'ablage', titel: 'Ablage & Server', abschnitt: 'Einstellungen', zeichen: 'dateien', nurAdmin: true },
    { id: 'ki', titel: 'KI', abschnitt: 'Einstellungen', zeichen: 'assistent', objekt: 'ki_anbindung', nurAdmin: true },
    { id: 'ratschlaege', titel: 'Ratschläge', abschnitt: 'Prüfung', zeichen: 'liste_aufgaben', objekt: 'pruefrat', nurAdmin: true, baum: ['stand'] },
    { id: 'pruefki', titel: 'Prüf-KI', abschnitt: 'Prüfung', zeichen: 'pruefung', objekt: 'pruefzugang', nurAdmin: true },
    { id: 'updates', titel: 'Updates', abschnitt: 'System', zeichen: 'aktualisieren', nurAdmin: true },
    { id: 'aufbau', titel: 'Aufbau', abschnitt: 'System', zeichen: 'bausteine', nurAdmin: true },
    { id: 'uebernahme', titel: 'Übernahme', abschnitt: 'System', zeichen: 'import', nurAdmin: true },
  ],
};
