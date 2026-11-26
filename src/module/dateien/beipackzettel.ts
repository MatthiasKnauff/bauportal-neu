// Modul Pläne und Dateien: der Projektordner auf dem Dateiserver – die Ansicht dazu bringt die Oberfläche mit (ui/dateien.tsx).
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
  objekte: [dokument],
  dokumentarten: [{ art: 'dokument', titel: 'Sonstiges Dokument', ordner: 'Eingang', ansichten: ['dateien', 'alle', 'dokumente'], merkmale: [] }],
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
