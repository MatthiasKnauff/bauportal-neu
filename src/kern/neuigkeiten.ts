// Was ist neu (wie im bisherigen Bauportal, Wunsch 28.11.2026: „bei jedem Push sofort“): je Push ein paar Einträge – was dazukam,
// wo man es findet (App und Ansicht, „Zeigen ›“) und worauf man schauen soll. Jede:r sieht Neues einmal (gemerkt am eigenen Konto,
// also auf allen Geräten); wer zum ersten Mal kommt, bekommt nur, was höchstens 14 Tage alt ist.
// Wird mit jedem Push nachgeführt – neueste zuerst. stand: Kurzkennung des Commits (leer, solange er noch nicht gepusht ist).

export interface Neuigkeit {
  id: string;          // eindeutig, bleibt (z. B. „2026-11-28-bt-fotos“)
  zeit: string;        // JJJJ-MM-TTTHH:MM – wann es auf den Testserver kam
  stand?: string;      // Commit, mit dem es kam
  app?: string;        // Modul (leer: gilt überall)
  ansicht?: string;    // Ansicht im Modul, zu der „Zeigen ›“ springt
  ziel?: string;       // Stelle, auf die der Rundgang den Scheinwerfer richtet (CSS-Auswahl) – ohne: Karte in der Mitte
  titel: string;
  text: string;        // was es ist und worauf man schauen soll
}

export const NEUIGKEITEN: Neuigkeit[] = [
  { id: '2026-11-28-mitglied', zeit: '2026-11-28T21:00', app: 'verwaltung', ansicht: 'projekte', titel: 'Fehler behoben: Projekt blieb nach Entfernen der Mitgliedschaft sichtbar',
    text: 'Wurde jemandem die Mitgliedschaft entzogen, stand das Projekt bei ihr/ihm noch in der Liste, bis die Seite neu geladen war. Jetzt verschwindet es sofort.' },
  { id: '2026-11-28-bsp-vorlage', zeit: '2026-11-28T20:00', stand: '5e603a0', app: 'ava', ansicht: 'besprechungen', titel: 'Angebotsbesprechung wie dein Protokoll',
    text: 'Das Protokoll steht wieder wie die Vorlage (Tischlerei Blank): eine Angabe je Zeile mit den Abschnitten „Angaben zur Bieter:in“, „Angaben zum Angebot“, „Termine“, „Grundlagen“, dazu „Angebotssumme nach Prüfung“ (netto zuzüglich MwSt., brutto), der Satz „Dieses Protokoll wird bei einer Auftragserteilung Bestandteil des Vertrages!“ und drei Unterschriften: Bauherr:in, Architekt:in, Bieter:in.' },
  { id: '2026-11-28-kleinigkeiten', zeit: '2026-11-28T20:00', stand: '5e603a0', app: '', titel: 'Kleinigkeiten nach deinen Bildern',
    text: 'Bauzeitenplan: „Drucken“ mit Drucker statt „PDF“, „In einem Satz“ mit eigenem Symbol. Adressen als Kacheln: der Auswahl-Haken liegt nicht mehr als Schalter über dem Namen.' },
  { id: '2026-11-28-terminplan-durch', zeit: '2026-11-28T19:30', stand: 'bf3fe95', app: 'bauzeitenplan', ansicht: 'plan', titel: 'Terminplan durch – bitte ansehen',
    text: 'Inventur aus dem alten Quelltext abgehakt, Bildvergleich gemacht. Bewusst später: 3D-Baukasten (mit dem Gebäudemodell), Teilen-Link (mit dem Bauherrenportal), Terminrüge (mit Post & Vorgänge).' },
  { id: '2026-11-28-kat-ausprojekten', zeit: '2026-11-28T19:30', stand: 'bf3fe95', app: 'bauzeitenplan', ansicht: 'leistungen', ziel: '[role=toolbar][aria-label="Menüleiste"] [aria-label="Aus Projekten …"]', titel: 'Leistungskatalog: Aus Projekten … und Import',
    text: 'Wie bisher: Leistungen aus vorhandenen Bauzeitenplänen als eigene Leistungen in den Katalog übernehmen (mit Abschnitt, Gewerk, Dauer). Dazu Import aus Excel/CSV mit Spaltenzuordnung.' },
  { id: '2026-11-28-bzp-darstellung', zeit: '2026-11-28T19:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', ziel: '[role=toolbar][aria-label="Menüleiste"] [aria-label="Darstellung"]', titel: 'Darstellung wie bisher',
    text: 'Unter „Darstellung“: Beschriftung der Balken links · im Balken · rechts (Leistung, Firma, Gewerk, Dauer, Termine, %), Pfeile, Dauer der Gruppen (Zeitspanne, Summe oder beides), Zeilen (farbig, Bänderung, nur aktive Zeile), alle auf-/zuklappen und „beim Löschen fragen“.' },
  { id: '2026-11-28-bzp-satz', zeit: '2026-11-28T19:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', ziel: '[role=toolbar][aria-label="Menüleiste"] [aria-label="In einem Satz"]', titel: 'Plan in einem Satz ändern',
    text: 'Wie bisher unter „Fragen und Antworten“, jetzt als „In einem Satz“ in der Menüleiste: „Malerarbeiten 5 Tage länger“, „Estrich auf 8 AT“, „Fliesen 1 Woche später“, „Maler nach Fliesen“, „Estrich 50 % fertig“ – mit Vorschau und neuem Projektende, ausgeführt als ein Schritt.' },
  { id: '2026-11-28-bzp-ablauf', zeit: '2026-11-28T19:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'ablauf', ziel: '.ablauf-flaeche', titel: 'Ablauf der Teile',
    text: 'Neue Seite links unter Terminplan: je Gebäudeteil eine Kiste mit Zeitraum, Pfeile zeigen die Reihenfolge. Vom Punkt rechts auf eine andere Kiste ziehen verknüpft, Rechtsklick auf den Pfeil löst.' },
  { id: '2026-11-28-bzp-mehrere', zeit: '2026-11-28T19:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', titel: 'Mehrere Leistungen auf einmal ändern',
    text: 'Mehrere Zeilen markieren (Strg/Umschalt), Rechtsklick → „n ändern …“: Gewerk, Firma, Dauer, Fortschritt usw. für alle zugleich – dieselbe Maske wie überall.' },
  { id: '2026-11-28-katalog-zurueck', zeit: '2026-11-28T19:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'leistungen', titel: 'Leistungskatalog: Zurücksetzen …',
    text: 'Für Administrator:innen: setzt die Leistungen auf den Stand ab Werk zurück – erst die Vorschau, dann übernehmen. Eigene Leistungen des Büros bleiben; Rückgängig nimmt alles zurück.' },
  { id: '2026-11-28-hilfemenue', zeit: '2026-11-28T17:00', stand: '3fdf7b1', app: '', ziel: '.kopf-hilfe', titel: '„?“ wieder als Menü – mit Fehler melden und Frage stellen',
    text: 'Wie bisher: Hilfe zu dieser App · Was ist neu · Frage stellen · Erkenntnis fürs Wiki (kommt mit der Wiki-App) · Fehler melden. Beim Melden kurz beschreiben und gern ein Bildschirmfoto dazu (aufnehmen, wählen oder Strg+V). Alles landet in Verwaltung → Fehler & Fragen; eine Antwort steht dann bei der Frage und kommt per Mail.' },
  { id: '2026-11-28-meldungen', zeit: '2026-11-28T17:00', stand: '3fdf7b1', app: 'verwaltung', ansicht: 'meldungen', titel: 'Verwaltung: Fehler & Fragen',
    text: 'Alle Meldungen mit Bildschirmfoto und den automatisch mitgeschickten Angaben (Adresse, App, Projekt, Browser, letzte Fehler). Antwort eintragen – die Fragende sieht sie am „?“ und bekommt sie über den Postausgang per Mail.' },
  { id: '2026-11-28-bzp-teilung', zeit: '2026-11-28T17:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', ziel: '.bzp-teiler', titel: 'Bauzeitenplan: Tabelle | Diagramm wie bisher',
    text: 'Tabelle und Balken stehen wieder nebeneinander, die Trennung lässt sich ziehen (Doppelklick: ganze Tabelle). Die Tabelle rollt in ihrem Teil mit Umschalt+Mausrad. Vorher liefen die Zeilen beim Rollen unter den Balken weg.' },
  { id: '2026-11-28-bzp-ueberzug', zeit: '2026-11-28T17:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', titel: 'Später fertig um … AT, mit Grund',
    text: 'Wie bisher „Zeit und Stand“: in der Karte der Leistung „Später fertig um … Arbeitstage“ und den Grund (Wetter, Firma, Bauherrschaft … oder eigener Text). Der Überzug steht schraffiert am Balken, die Nachfolger rücken mit.' },
  { id: '2026-11-28-bzp-loeschen', zeit: '2026-11-28T17:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', titel: 'Löschen: Dauer umlegen oder Gesamtzeit verkürzen',
    text: 'Wie bisher fragt das Löschen, ob die Dauer auf eine Hauptleistung (gleiches Gewerk in der Gruppe, sonst Vorgänger) umgelegt wird – abschaltbar. Im Kontextmenü neu: Duplizieren … und Unterbrechungen entfernen.' },
  { id: '2026-11-28-kacheln', zeit: '2026-11-28T17:00', stand: '3fdf7b1', app: 'bauzeitenplan', ansicht: 'plan', titel: 'Gebäudeart als Kacheln',
    text: 'Im Planungsassistenten (und im Gebäudemodell) wählst du die Gebäudeart wieder grafisch – mit Zeichen und kurzer Beschreibung wie bisher; darunter die Gebäudeteile.' },
  { id: '2026-11-28-rueckgaengig', zeit: '2026-11-28T15:26', stand: '8433c22', app: 'adressen', ansicht: 'kontakte', ziel: '[aria-label="Letzte Schritte"]', titel: 'Rückgängig ▾: mehrere Schritte und ältere Stände',
    text: 'Wie bisher steht neben Zurück/Wieder „▾ n“: die letzten Schritte – ein Klick nimmt alles bis dorthin zurück. Darunter „Ältere Stände …“: alle Änderungen an den Einträgen dieser Ansicht, Gelöschtes lässt sich wiederherstellen. Gilt in jeder App.' },
  { id: '2026-11-28-adr-netz', zeit: '2026-11-28T15:26', stand: '8433c22', app: 'adressen', ansicht: 'kontakte', ziel: '.platz-rechts', titel: 'Adressen: Schriftverkehr und „Im Netz“',
    text: 'Rechts am Kontakt der Reiter Schriftverkehr (alle Mails an ihn). „🔎 Im Netz“ sucht den Kontakt bei OpenStreetMap und ergänzt Anschrift, Telefon, E-Mail und Internet – nur, was noch leer ist. „Einlesen“ steht wieder unter Datei. Bitte einen Kontakt wählen und ansehen.' },
  { id: '2026-11-28-rundgang', zeit: '2026-11-28T15:26', stand: '8433c22', app: '', titel: 'Rundgang zu „Was ist neu“',
    text: '„Zeigen ›“ führt jetzt durch die Neuigkeiten einer App, Schritt für Schritt mit Scheinwerfer auf der Stelle (wie bisher).' },
  { id: '2026-11-28-neu', zeit: '2026-11-28T14:19', stand: 'a999dcc', app: '', titel: 'Was ist neu – bei jedem Push',
    text: 'Wie im bisherigen Bauportal: Was dazukam, steht hier – je Stand, mit „Zeigen ›“ zur Stelle. Neues für dich ist markiert und kommt nach dem Anmelden einmal von selbst; jederzeit über „?“ oder das Benutzermenü.' },
  { id: '2026-11-28-rechte', zeit: '2026-11-28T14:19', stand: 'a999dcc', app: 'verwaltung', ansicht: 'rechte', ziel: 'table.rechte', titel: 'Rollen & Rechte wie besprochen',
    text: 'Rollen selbst anlegen (als Kopie), umbenennen, löschen, solange niemand sie hat · je Rolle und App „an · nur lesen · aus“, aufklappbar je Art · „Wer darf was?“ mit Ausnahmen je Person (＋/−) · „Verwaltung“: je Bereich – · sehen · ändern, Zugänge „neu setzen“. Oben auf jeder Seite der Verwaltung: „Wer darf hier hinein?“. Bitte ansehen: die drei Ansichten und eine Probe-Rolle.' },
  { id: '2026-11-28-bt-durch', zeit: '2026-11-28T12:30', stand: '2245440', app: 'bautagebuch', ansicht: 'berichte', ziel: '.bt-kopf', titel: 'Bautagebuch durch – bitte ansehen',
    text: 'Bildvergleich mit dem alten Bautagebuch abgeschlossen. Am Handy wählst du den Bericht wieder oben (Nr. · Datum ▾). Leeres Wetter druckt nichts mehr („keine Angabe“).' },
  { id: '2026-11-28-bt-druck', zeit: '2026-11-28T11:26', stand: '197b757', app: 'bautagebuch', ansicht: 'berichte', ziel: '[role=toolbar][aria-label="Menüleiste"] [aria-label="PDF"]', titel: 'Drucken mit oder ohne Fotos, per Mail senden',
    text: 'In der Druckvorschau: Schalter „mit Fotos“ (nur für diesen Ausdruck) und „Per Mail senden …“ an Beteiligte des Projekts; dazu Teilen → Senden in der Menüleiste. Eingaben in den Listen mit × oder Esc verwerfen – Rückgängig bringt Text und Fotos zurück. Ein Bericht ohne Wetter bekommt es automatisch (Projektadresse, Datum).' },
  { id: '2026-11-28-postfach', zeit: '2026-11-28T10:29', stand: 'ab58f60', app: 'verwaltung', ansicht: 'mail', ziel: '.platz-mitte', titel: 'Postfächer: Büro und eigene Adresse',
    text: 'Projektmails gehen über die Büroadresse, wahlweise „von mir“. Je Adresse SMTP/IMAP oder Microsoft 365 (Anmeldung mit Microsoft, kein gespeichertes Kennwort). Das eigene Postfach richtest du unter Mein Konto ein. „Kopie an mich“ geht an die eigene Adresse, sonst ans Büro.' },
  { id: '2026-11-28-ablage', zeit: '2026-11-28T09:52', stand: '900ffca', app: 'dateien', ansicht: 'dateien', titel: 'Ablegen: Ordnerbaum des Projektordners',
    text: 'Im Ablegen-Dialog steht unten immer der Baum des Projektordners, der vorgeschlagene Ordner ist gewählt und aufgeklappt. In den Adressen wählst du die Projekte eines Kontakts aus der Projektliste.' },
  { id: '2026-11-28-bt-bauleitung', zeit: '2026-11-28T09:45', stand: '9847f5f', app: 'bautagebuch', ansicht: 'berichte', ziel: '.bt-kopf', titel: 'Bauleitung vor Ort, Schritte wählen, Foto zuordnen',
    text: 'Mehrere Personen in „Bauleitung vor Ort“ · bei „Schritt für Schritt“ ⚙ Schritte wählen (je Person gemerkt) · am Handy ＋ Foto aufnehmen und zuordnen · im Kalender mit Umschalt+Klick einen Zeitraum markieren und drucken · Erinnerung zur Frist per Mail.' },
];

/** Was für diese Person neu ist: nach dem, was sie zuletzt gesehen hat; beim ersten Mal nur die letzten 14 Tage. */
export function neuFuer(liste: Neuigkeit[], gesehen: string, jetzt = new Date()): Neuigkeit[] {
  const grenze = gesehen || new Date(jetzt.getTime() - 14 * 86400000).toISOString().slice(0, 16);
  return liste.filter((n) => n.zeit > grenze);
}
export const neuesteZeit = (liste: Neuigkeit[]) => liste.reduce((m, n) => (n.zeit > m ? n.zeit : m), '');
