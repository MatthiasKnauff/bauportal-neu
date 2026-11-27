// Modul Verwaltung: Benutzer, Rechte, Bürodaten, Ablage, Druckeinstellungen, KI-Anbindungen, Updates, Aufbau.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE, OHNE_GAST, ROLLEN_OPTIONEN } from '../../kern/rechte';
import { STIL } from '../../kern/design';

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
    { name: 'logo', titel: 'Logo', art: 'text', verborgen: true },   // Stand des Logos (Zeit) – das Bild selbst: Verwaltung → Büro, /api/logo
    // Debugging-Modus (Entscheidung 25.11.2026): nur diese Rollen sehen in Verwaltung → Aufbau den Quelltext eines Bausteins
    // Ausschreibung (bisher AVA → Einstellungen → Vergabe- und Auftragsnummern): Vorschlag an der LV-Karte
    { name: 'vergabenummer_schema', titel: 'Schema der Vergabenummer ({projekt} {lv} {jahr} {gewerk}; leer: {projekt}-{lv}-{jahr})', art: 'text', gruppe: 'Ausschreibung' },
    // Abrechnung (bisher AVA → Einstellungen → Abrechnung): gilt für alle Rechnungsprüfungen und das Aufmaß
    { name: 'nachtraege_leistung', titel: 'Nachträge in der Rechnungsprüfung', art: 'auswahl', gruppe: 'Abrechnung', optionen: [
      { wert: 'alle', titel: 'Angemeldete und beauftragte zählen als Leistung' }, { wert: 'beauftragt', titel: 'Nur beauftragte zählen als Leistung' }] },
    { name: 'aufmass_gelb_ab', titel: 'Aufmaß: Hinweis (gelb) ab % über der LV-Menge', art: 'zahl', kartenBreite: 3, gruppe: 'Abrechnung' },
    { name: 'aufmass_rot_ab', titel: 'rot ab % (VOB/B § 2 Abs. 3: 10)', art: 'zahl', kartenBreite: 3, gruppe: 'Abrechnung' },
    { name: 'nicht_aehnlich', titel: 'Adressen aufräumen: als nicht ähnlich gemerkte Werte', art: 'langtext', verborgen: true },   // {feld: ["a|b", …]}
    { name: 'debugging', titel: 'Debugging-Modus: Quelltext im Aufbau sehen dürfen', art: 'mehrfach', optionen: ROLLEN_OPTIONEN, gruppe: 'Entwicklung' },
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
    { name: 'eingang', titel: 'Eingangsordner für Scans (Pfad in der Freigabe, z. B. _Eingang/Kopierer)', art: 'text', gruppe: 'Eingangsordner' },
    { name: 'eingang_fertig', titel: 'Unterordner für verarbeitete Scans (leer: „verarbeitet“)', art: 'text', gruppe: 'Eingangsordner' },
  ],
};

// Zentrale Versandstelle (Regel „Nie zu viele Meldungen“): jede Mail des Bauportals geht als Nachricht in den Postausgang
// und von dort über den Mailserver – Erinnerungen gebündelt (ab Werk einmal am Tag), Mitteilungen gleich. Das Kennwort steht
// wie bei der Ablage nicht hier, sondern verschlüsselt in der Datenbank. Der Testserver verschickt nie etwas.
export const MAILSERVER_ID = '00000000-0000-4000-8000-0000000e0a11';
export const BUENDELN = [{ wert: 'tag', titel: 'einmal am Tag (empfohlen)' }, { wert: 'stunde', titel: 'einmal in der Stunde' }, { wert: 'sofort', titel: 'sofort' }];
export const mailserver: ObjektModell = {
  name: 'mailserver',
  titel: 'Mailserver',
  titelMehrzahl: 'Mailserver',
  anzeigeFeld: 'host',
  einzeln: MAILSERVER_ID,
  rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'host', titel: 'Server für ausgehende Mails (SMTP), z. B. smtp.office365.com', art: 'text', gruppe: 'Mailserver' },
    { name: 'port', titel: 'Port (meist 587)', art: 'zahl', kartenBreite: 2, gruppe: 'Mailserver' },
    { name: 'sicherheit', titel: 'Verschlüsselung', art: 'auswahl', kartenBreite: 4, gruppe: 'Mailserver',
      optionen: [{ wert: 'starttls', titel: 'STARTTLS (Port 587)' }, { wert: 'ssl', titel: 'SSL/TLS (Port 465)' }] },
    { name: 'benutzer', titel: 'Benutzer am Mailserver', art: 'text', gruppe: 'Mailserver' },
    { name: 'absender_name', titel: 'Absender (Name), z. B. GK3 Bauportal', art: 'text', gruppe: 'Absender' },
    { name: 'absender', titel: 'Absender (E-Mail-Adresse)', art: 'email', gruppe: 'Absender' },
    { name: 'buendeln', titel: 'Erinnerungen bündeln', art: 'auswahl', optionen: BUENDELN, kartenBreite: 4, gruppe: 'Zurückhaltend' },
    { name: 'uhrzeit', titel: 'täglich um (z. B. 07:00)', art: 'text', kartenBreite: 2, gruppe: 'Zurückhaltend' },
    { name: 'letzter_lauf', titel: 'Zuletzt gebündelt', art: 'text', verborgen: true },   // „2026-11-27“ bzw. „2026-11-27T07“ – führt die Versandstelle selbst
  ],
};
export const NACHRICHT_STAENDE = [{ wert: 'wartet', titel: 'wartet' }, { wert: 'verschickt', titel: 'verschickt' }, { wert: 'zurueckgehalten', titel: 'zurückgehalten (Testserver)' },
  { wert: 'fehler', titel: 'Fehler' }, { wert: 'verworfen', titel: 'verworfen' }];
export const nachricht: ObjektModell = {
  name: 'nachricht',
  titel: 'Nachricht',
  titelMehrzahl: 'Postausgang',
  anzeigeFeld: 'betreff',
  sortierFeld: 'faellig',
  rechte: { lesen: OHNE_GAST, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'an', titel: 'An (E-Mail)', art: 'email', pflicht: true, inListe: true, breite: 220, gruppe: 'Nachricht' },
    { name: 'kontakt', titel: 'Kontakt', art: 'verweis', ziel: 'kontakt', spalte: true, breite: 200, gruppe: 'Nachricht' },
    { name: 'betreff', titel: 'Betreff', art: 'text', pflicht: true, inListe: true, breite: 320, gruppe: 'Nachricht' },
    { name: 'text', titel: 'Text', art: 'langtext', gruppe: 'Nachricht' },
    { name: 'art', titel: 'Art', art: 'auswahl', inListe: true, breite: 110, kartenBreite: 2, gruppe: 'Versand',
      optionen: [{ wert: 'mitteilung', titel: 'Mitteilung (gleich)' }, { wert: 'erinnerung', titel: 'Erinnerung (gebündelt)' }] },
    { name: 'faellig', titel: 'Fällig ab (leer: gleich)', art: 'datum', inListe: true, breite: 110, kartenBreite: 2, gruppe: 'Versand' },
    { name: 'stand', titel: 'Stand', art: 'auswahl', optionen: NACHRICHT_STAENDE, inListe: true, breite: 130, kartenBreite: 2, gruppe: 'Versand' },
    { name: 'verschickt_am', titel: 'Verschickt am', art: 'text', spalte: true, breite: 150, gruppe: 'Versand' },
    { name: 'fehler', titel: 'Fehler beim Versand', art: 'text', spalte: true, breite: 220, gruppe: 'Versand' },
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', spalte: true, breite: 180, gruppe: 'Herkunft' },
    { name: 'quelle', titel: 'Aus (Objekt|Kennung)', art: 'text', verborgen: true },
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
const EXTERN = KI_ARTEN.map((a) => a.wert).filter((w) => w !== 'ollama');
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
    // Kosten (Anbieter außerhalb): Preise laut Anbieter, Kostendeckel je Monat (danach lehnt der KI-Ausgang ab), aufgeladenes Guthaben
    { name: 'preis_ein', titel: 'Preis Eingabe in € je 1 Mio. Tokens', art: 'zahl', gruppe: 'Kosten', wenn: { art: EXTERN } },
    { name: 'preis_aus', titel: 'Preis Ausgabe in € je 1 Mio. Tokens', art: 'zahl', gruppe: 'Kosten', wenn: { art: EXTERN } },
    { name: 'deckel', titel: 'Kostendeckel je Monat in € (leer: keiner)', art: 'zahl', gruppe: 'Kosten', wenn: { art: EXTERN } },
    { name: 'aufgeladen', titel: 'Guthaben zuletzt aufgeladen in €', art: 'zahl', gruppe: 'Kosten', wenn: { art: EXTERN } },
    { name: 'aufgeladen_am', titel: 'aufgeladen am', art: 'datum', gruppe: 'Kosten', wenn: { art: EXTERN } },
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
    { name: 'gruppe', titel: 'Gruppe in der Auswahl', art: 'text' },
    { name: 'beschreibung', titel: 'Beschreibung', art: 'text' },
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
    { name: 'akzent', titel: 'Akzentfarbe', art: 'text' },   // leer = wie das Design, sonst #rrggbb
    // Schrift und Stil wie im bisherigen Bauportal (Werte: kern/design SCHRIFTWAHL, GROESSEN, STIL) – leer = Vorgabe
    { name: 'schrift', titel: 'Schrift', art: 'auswahl', optionen: [{ wert: '', titel: 'wie das Design' }, { wert: 'system', titel: 'Systemschrift' }, { wert: 'arial', titel: 'Arial' }, { wert: 'verdana', titel: 'Verdana' }, { wert: 'calibri', titel: 'Calibri' }, { wert: 'georgia', titel: 'Georgia' }] },
    { name: 'schriftmass', titel: 'Schriftgröße in Prozent', art: 'zahl' },   // leer = 100 %
    ...STIL.map((x): ObjektModell['felder'][number] => ({ name: x.feld, titel: x.titel, art: 'auswahl', optionen: x.werte.map(([wert, titel]) => ({ wert, titel })) })),
    { name: 'handyleiste', titel: 'Leiste unten am Handy', art: 'text' },   // bis zu fünf Plätze, z. B. „start,bautagebuch,adressen,dateien,suche“ – leer = Vorgabe
  ],
};

export const verwaltung: Beipackzettel = {
  id: 'verwaltung',
  handy: 'keine',
  zeichen: 'einstellungen',
  farbe: '#868e96',
  name: 'Verwaltung',
  version: '0.1.0',
  beschreibung: 'Benutzer, Rollen und Rechte, Bürodaten, Ablage, KI, Updates, Aufbau und Prüf-KI.',
  braucht: [],
  objekte: [benutzer, recht, buero, ablage, mailserver, nachricht, druckeinstellung, ki_anbindung, pruefzugang, pruefrat, design, designWahl],
  abgesetzt: ['Für mich'],   // wie im bisherigen Bauportal: „Für mich – <Name>“ farbig abgesetzt
  ansichten: [
    // „Für mich“: für jede:n – eigenes Konto und Darstellung (wie im bisherigen Bauportal)
    { id: 'konto', titel: 'Mein Konto', abschnitt: 'Für mich', zeichen: 'schluessel', hilfe: 'Dein Name, deine Anmeldung und dein Kennwort. Kennwort ändern: altes und neues Kennwort eintragen.' },
    { id: 'darstellung', titel: 'Darstellung', abschnitt: 'Für mich', zeichen: 'kacheln', hilfe: 'Wie das Bauportal für dich aussieht: hell oder dunkel, Akzentfarbe (auch eine eigene Farbe), Design, Schrift und Schriftgröße, Ecken, Handyleiste. Gilt sofort und nur für dich.' },
    { id: 'buero', titel: 'Büro & Standort', abschnitt: 'Büro', zeichen: 'einstellungen', einstellungen: 'buero', hilfe: 'Name, Anschrift, Telefon und E-Mail des Büros, Bundesland für die Feiertage und das Logo für den Briefkopf der Ausdrucke.' },
    { id: 'projekte', titel: 'Projekte', abschnitt: 'Büro', zeichen: 'projekte', objekt: 'projekt', baum: ['status'] },
    { id: 'benutzer', titel: 'Benutzer', abschnitt: 'Einstellungen', zeichen: 'personen', objekt: 'benutzer', baum: ['rolle'] },
    { id: 'rechte', titel: 'Rechte', abschnitt: 'Einstellungen', zeichen: 'schluessel', nurAdmin: true, hilfe: 'Wer darf was: je Rolle sehen, ändern, löschen – für jede Art von Eintrag.' },
    { id: 'ablage', titel: 'Ablage & Server', abschnitt: 'Einstellungen', zeichen: 'dateien', nurAdmin: true, einstellungen: 'ablage', hilfe: 'Verbindung zum Dateiserver (Freigabe, Benutzer, Kennwort) für Pläne & Dateien und die Projektordner.' },
    { id: 'mail', titel: 'Mail & Versand', abschnitt: 'Einstellungen', zeichen: 'senden', nurAdmin: true, einstellungen: 'mailserver', hilfe: 'Die zentrale Versandstelle: Mailserver (SMTP, Kennwort), Absender und wie zurückhaltend Erinnerungen gebündelt werden.' },
    { id: 'postausgang', titel: 'Postausgang', abschnitt: 'Büro', zeichen: 'senden', objekt: 'nachricht', baum: ['stand'], hilfe: 'Alle Mails des Bauportals – was wartet, was verschickt ist, was nicht ging. Nichts verlässt das Bauportal an dieser Stelle vorbei.' },
    { id: 'ki', titel: 'KI', abschnitt: 'Einstellungen', zeichen: 'assistent', objekt: 'ki_anbindung', nurAdmin: true },
    { id: 'ratschlaege', titel: 'Ratschläge', abschnitt: 'Prüfung', zeichen: 'liste_aufgaben', objekt: 'pruefrat', nurAdmin: true, baum: ['stand'] },
    { id: 'pruefki', titel: 'Prüf-KI', abschnitt: 'Prüfung', zeichen: 'pruefung', objekt: 'pruefzugang', nurAdmin: true },
    { id: 'updates', titel: 'Updates', abschnitt: 'System', zeichen: 'aktualisieren', nurAdmin: true, hilfe: 'Kataloge einspielen und aktualisieren (Leistungen, Positionen, Gewerke, Baupreisindex) und der Stand des Programms.' },
    { id: 'aufbau', titel: 'Aufbau', abschnitt: 'System', zeichen: 'bausteine', nurAdmin: true },
    { id: 'uebernahme', titel: 'Übernahme', abschnitt: 'System', zeichen: 'import', nurAdmin: true },
  ],
};
