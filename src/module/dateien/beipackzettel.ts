// Modul Pläne und Dateien: der Projektordner auf dem Dateiserver – die Ansicht dazu bringt die Oberfläche mit (ui/dateien.tsx).
import type { Ablagerolle } from '../../kern/ablageordner';
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] };

/** Ein abgelegtes Dokument (PDF, Scan, Foto): Das Original liegt im Projektordner (auf dem Testserver im Speicher des Bauportals),
 *  im Bauportal nur das Vorschaubild. Gehört es zu einem Eintrag (Rechnung, Angebot …), steht der als Bezug dabei. */
export const dokument: ObjektModell = {
  name: 'dokument', titel: 'Dokument', titelMehrzahl: 'Dokumente', anzeigeFeld: 'name', projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'name', titel: 'Dateiname', art: 'text', pflicht: true, inListe: true, breite: 320, gruppe: 'Dokument' },
    { name: 'art', titel: 'Art', art: 'text', inListe: true, breite: 160, gruppe: 'Dokument' },
    { name: 'eingang', titel: 'Eingang', art: 'datum', inListe: true, breite: 110, gruppe: 'Dokument' },
    { name: 'ort', titel: 'Original liegt', art: 'auswahl', inListe: true, breite: 170, gruppe: 'Ablage', optionen: [{ wert: 'ablage', titel: 'im Projektordner' }, { wert: 'bauportal', titel: 'im Bauportal' }] },
    { name: 'pfad', titel: 'Pfad des Originals', art: 'text', gruppe: 'Ablage' },
    { name: 'quelle', titel: 'Aus dem Eingangsordner', art: 'text', verborgen: true },
    { name: 'bezug_objekt', titel: 'Gehört zu (Art)', art: 'text', verborgen: true },
    { name: 'bezug', titel: 'Gehört zu', art: 'text', verborgen: true },
  ],
};

// Rollen im Projektordner (Entscheidung 27.11.2026): ab Werk wie im Projektordner A481 des bisherigen Bauportals –
// „{projekt}“ ist die Projektnummer, mit der dort jeder Hauptordner beginnt. Alle Apps nennen diese Rollen.
export const ABLAGEROLLEN: Ablagerolle[] = [
  { id: 'baugenehmigung', titel: 'Baugenehmigung und Bescheide', ordner: '{projekt} 1. Leistungsphasen 1-4/Baugenehmigung' },
  { id: 'lv', titel: 'Leistungsverzeichnisse je Gewerk', ordner: '{projekt} 2. Ausschreibung/Leistungsverzeichnisse/LV {gewerk}' },
  { id: 'ausschreibung', titel: 'Ausschreibung (Listen)', ordner: '{projekt} 2. Ausschreibung' },
  { id: 'angebote', titel: 'Angebote je Gewerk', ordner: '{projekt} 2. Ausschreibung/Angebote/Angebote {gewerk}' },
  { id: 'vertraege', titel: 'Aufträge und Bauverträge', ordner: '{projekt} 3. Aufträge -Bauverträge' },
  { id: 'rechnungspruefung', titel: 'Rechnungsprüfung je Firma', ordner: '{projekt} 4. Durchführung/Rechnungsprüfung/{firma}' },
  { id: 'nachtraege', titel: 'Nachträge je Firma', ordner: '{projekt} 4. Durchführung/Rechnungsprüfung/{firma}/Nachträge' },
  { id: 'abnahmen', titel: 'Abnahmen und Mängel', ordner: '{projekt} 4. Durchführung/Abnahmen + Mängel' },
  { id: 'brandschutz', titel: 'Brandschutzunterlagen je Firma', ordner: '{projekt} 4. Durchführung/Brandschutzunterlagen/{firma}' },
  { id: 'bauzeitenplan', titel: 'Bauzeitenplan', ordner: '{projekt} 4. Durchführung/Bauzeitenplan' },
  { id: 'protokolle', titel: 'Protokolle', ordner: '{projekt} 5. Protokolle' },
  { id: 'bautagebuch', titel: 'Bautagebuch', ordner: '{projekt} 8. Fotos + Bautagebuch/Bautagebuch' },
  { id: 'plaene', titel: 'Pläne', ordner: '{projekt} 9. Pläne' },
  { id: 'statik', titel: 'Statik und Bescheinigungen', ordner: '{projekt} 10. Statik, Bodengutachten, EnEV/Statik/Bescheinigungen' },
  { id: 'eingang', titel: 'Sonstiges (Eingang)', ordner: 'Eingang' },
];

/** Was die Verwaltung je Rolle eingestellt hat: eigener Ordner (Platzhalter wie ab Werk), auf Wunsch fest. */
export const ablageregel: ObjektModell = {
  name: 'ablageregel', titel: 'Ablageordner', titelMehrzahl: 'Ablageordner', anzeigeFeld: 'rolle',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'rolle', titel: 'Rolle', art: 'text', pflicht: true, inListe: true, breite: 220 },
    { name: 'ordner', titel: 'Ordner im Projektordner', art: 'text', inListe: true, breite: 360 },
    { name: 'fest', titel: 'fest (nicht nur Vorschlag)', art: 'ja_nein', inListe: true, breite: 90 },
  ],
};
/** Eine andere Wahl beim Ablegen: das Projekt merkt sie sich je Dokumentart (und je Firma/Gewerk) und schlägt sie wieder vor. */
export const ablagewahl: ObjektModell = {
  name: 'ablagewahl', titel: 'Gemerkter Ablageordner', titelMehrzahl: 'Gemerkte Ablageordner', anzeigeFeld: 'ordner', projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'art', titel: 'Dokumentart', art: 'text', pflicht: true, inListe: true, breite: 160 },
    { name: 'bezug', titel: 'Firma bzw. Gewerk', art: 'text', inListe: true, breite: 160 },
    { name: 'ordner', titel: 'Ordner', art: 'text', pflicht: true, inListe: true, breite: 360 },
  ],
};

// Die Originale bleiben auf dem Dateiserver. Dieses Modul zeigt den Ordner des gewählten Projekts;
// es bringt keine eigenen Objekte mit. Sichtbar ist, was der Benutzer am Projekt sehen darf.
export const dateien: Beipackzettel = {
  id: 'dateien',
  handy: 'ansicht',
  zeichen: 'dateien',
  farbe: '#0c9c8c',
  name: 'Pläne und Dateien',
  version: '0.1.0',
  beschreibung: 'Der Projektordner auf dem Dateiserver: durchblättern, ansehen, herunterladen.',
  braucht: ['projekte'],
  objekte: [dokument, ablageregel, ablagewahl],
  ablagerollen: ABLAGEROLLEN,
  // Arten ohne eigene App (Entscheidung E2, 27.11.2026) – „Schaden / Versicherung“ bleibt Sonstiges Dokument mit Ordnerwahl
  dokumentarten: [
    { art: 'dokument', titel: 'Sonstiges Dokument', rolle: 'eingang', ansichten: ['dateien', 'alle', 'dokumente'], merkmale: [] },
    { art: 'bescheid', titel: 'Bescheid der Behörde', rolle: 'baugenehmigung',
      merkmale: ['baugenehmigung', 'gebührenbescheid', 'bescheid', 'zwangsgeld', 'bauzustandsbesichtigung', 'bauaufsicht', 'rechtsbehelfsbelehrung'] },
    { art: 'protokoll', titel: 'Protokoll', rolle: 'protokolle', merkmale: ['protokoll', 'baubesprechung', 'niederschrift', 'teilnehmer', 'verteiler'] },
    { art: 'pruefbericht', titel: 'Prüfbericht / Bescheinigung Statik', rolle: 'statik',
      merkmale: ['prüfbericht', 'standsicherheit', 'stichprobenhafte kontrolle', 'prüfingenieur', 'prüfsachverständig', 'tragwerk'] },
    { art: 'skizze', titel: 'Skizze / Detail der Firma', rolle: 'plaene', merkmale: ['skizze', '\\bdetail\\b', 'werkplan', 'montageplan', 'maßstab'] },
  ],
  ansichten: [
    { id: 'dateien', titel: 'Ordner', abschnitt: 'Dateien', zeichen: 'dateien', brauchtProjekt: true },
    { id: 'alle', titel: 'Alle Dateien', abschnitt: 'Dateien', zeichen: 'liste', brauchtProjekt: true,
      hilfe: 'Alle Dateien des Projektordners mit allen Unterordnern – links filtern nach Art, Zeitraum und Ordner – mehrere Werte verknüpfen (ODER, UND), ein Klick auf einen Filter im Kasten schließt ihn aus (NICHT); oben suchen (Name oder Ordner) oder beim Tippen einen Filter vorschlagen lassen. Neueste zuerst. Ein Klick zeigt rechts die Datei, ein Doppelklick öffnet sie.' },
    { id: 'eingang', titel: 'Eingang (Scans)', abschnitt: 'Dateien', zeichen: 'datei_hoch',
      hilfe: 'Der Eingangsordner auf dem Dateiserver (Verwaltung → Ablage), z. B. Scans vom Kopierer: je Datei „Ablegen“ – erkannt wird wie beim Hineinziehen; danach wandert der Scan in den Unterordner „verarbeitet“.' },
    { id: 'dokumente', titel: 'Abgelegte Dokumente', abschnitt: 'Dateien', zeichen: 'datei_hoch', objekt: 'dokument', baum: ['art'], brauchtProjekt: true,
      hilfe: 'Alles, was ins Fenster gezogen oder aus dem Eingangsordner übernommen wurde – mit Vorschau und Original.' },
  ],
};
