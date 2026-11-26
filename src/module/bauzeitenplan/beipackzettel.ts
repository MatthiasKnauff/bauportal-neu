// Modul Bauzeitenplan: Vorgänge eines Projekts mit Dauer in Arbeitstagen und Verknüpfungen, in benannten Versionen.
// Anfang und Ende werden nicht gespeichert, sondern gerechnet (rechnung.ts) – aus Projektanfang, Kalender und Kette.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';
import { BUNDESLAENDER } from './kalender';
import { ARTEN } from './rechnung';

const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung', 'bauleitung'] };
const basis = { projektFeld: 'projekt', versionsBereich: 'bauzeitenplan', rechte };
const zusammenhang = [
  { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
  { name: 'version', titel: 'Version', art: 'verweis', ziel: 'version', pflicht: true },
] as const;

/** Angaben zum Plan einer Version: Projektanfang und Kalender. Je Version genau einer (legt die Oberfläche an). */
export const zeitplan: ObjektModell = {
  ...basis, name: 'zeitplan', titel: 'Kalender', titelMehrzahl: 'Kalender', anzeigeFeld: 'anfang',
  felder: [
    ...zusammenhang,
    { name: 'anfang', titel: 'Projektanfang', art: 'datum', pflicht: true, inListe: true, gruppe: 'Plan' },
    { name: 'arbeitswoche', titel: 'Arbeitswoche', art: 'auswahl', inListe: true, gruppe: 'Arbeitszeit',
      optionen: [{ wert: '5', titel: '5 Tage (Mo–Fr)' }, { wert: '6', titel: '6 Tage (Mo–Sa)' }, { wert: '7', titel: '7 Tage' }] },
    { name: 'bundesland', titel: 'Feiertage', art: 'auswahl', inListe: true, gruppe: 'Arbeitszeit', optionen: [{ wert: '', titel: 'wie die Baustelle' }, ...BUNDESLAENDER] },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'assistent', titel: 'Angaben des Planungsassistenten', art: 'langtext', verborgen: true },
    { name: 'gewerkfarben', titel: 'Farben der Gewerke', art: 'langtext', verborgen: true },   // {Gewerk: Farbe} – „Gewerke & Farben“
  ],
};

export const freierTag: ObjektModell = {
  ...basis, name: 'freier_tag', titel: 'Freier Tag', titelMehrzahl: 'Freie Tage', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 220, gruppe: 'Freie Tage' },
    { name: 'von', titel: 'von', art: 'datum', pflicht: true, inListe: true, gruppe: 'Freie Tage' },
    { name: 'bis', titel: 'bis', art: 'datum', inListe: true, gruppe: 'Freie Tage' },
    { name: 'jaehrlich', titel: 'jedes Jahr', art: 'ja_nein', inListe: true, gruppe: 'Freie Tage' },
    { name: 'kennung', titel: 'Kennung (Übernahme)', art: 'text', verborgen: true },
  ],
};

export const vorgang: ObjektModell = {
  ...basis, name: 'vorgang', titel: 'Leistung', titelMehrzahl: 'Leistungen', anzeigeFeld: 'name',
  felder: [
    ...zusammenhang,
    { name: 'name', titel: 'Leistung', art: 'text', pflicht: true, inListe: true, breite: 280, gruppe: 'Leistung' },
    { name: 'dauer', titel: 'Dauer in Arbeitstagen', art: 'zahl', inListe: true, breite: 90, gruppe: 'Termine' },
    { name: 'anfang_nicht_vor', titel: 'Anfang nicht früher als', art: 'datum', gruppe: 'Termine' },
    { name: 'unterbrechung', titel: 'Abschnitte (z. B. 3+(2)+4: 3 Tage, 2 Tage Pause, 4 Tage)', art: 'text', gruppe: 'Termine' },
    { name: 'fortschritt', titel: '% abgeschlossen', art: 'zahl', inListe: true, breite: 80, gruppe: 'Termine' },
    { name: 'gewerk', titel: 'Gewerk', art: 'text', inListe: true, breite: 150, gruppe: 'Ausführung', vorschlagen: true },
    { name: 'vob', titel: 'Gewerk nach VOB/C', art: 'verweis', ziel: 'gewerk', gruppe: 'Ausführung' },
    { name: 'unternehmer', titel: 'Unternehmer', art: 'text', gruppe: 'Ausführung', vorschlagen: true },
    { name: 'firma', titel: 'Firma', art: 'verweis', ziel: 'kontakt', gruppe: 'Ausführung' },
    { name: 'farbe', titel: 'Eigene Balkenfarbe', art: 'text', gruppe: 'Ausführung' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'ebene', titel: 'Gliederungsebene', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung (Übernahme, Assistent)', art: 'text', verborgen: true },
  ],
};

export const verknuepfung: ObjektModell = {
  ...basis, name: 'verknuepfung', titel: 'Verknüpfung', titelMehrzahl: 'Verknüpfungen', anzeigeFeld: 'art',
  felder: [
    ...zusammenhang,
    { name: 'von', titel: 'Vorgänger', art: 'verweis', ziel: 'vorgang', pflicht: true, inListe: true, gruppe: 'Verknüpfung' },
    { name: 'nach', titel: 'Nachfolger', art: 'verweis', ziel: 'vorgang', pflicht: true, inListe: true, gruppe: 'Verknüpfung' },
    { name: 'art', titel: 'Art', art: 'auswahl', optionen: ARTEN, inListe: true, gruppe: 'Verknüpfung' },
    { name: 'abstand', titel: 'Zeitabstand in Arbeitstagen', art: 'zahl', inListe: true, gruppe: 'Verknüpfung' },
    { name: 'von_abschnitt', titel: 'ab Abschnitt des Vorgängers', art: 'zahl', verborgen: true },
    { name: 'nach_abschnitt', titel: 'zum Abschnitt des Nachfolgers', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung', art: 'text', verborgen: true },
  ],
};

// Leistungskatalog des Planungsassistenten: über den Katalog-Kanal, vom Büro ergänzbar (eigene Leistungen, eigene Dauern).
const katalogRechte = { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] };
export const leistungsvorlage: ObjektModell = {
  name: 'leistungsvorlage', titel: 'Leistung im Katalog', titelMehrzahl: 'Leistungskatalog', anzeigeFeld: 'name', rechte: katalogRechte,
  felder: [
    { name: 'name', titel: 'Leistung', art: 'text', pflicht: true, inListe: true, breite: 320, gruppe: 'Leistung' },
    { name: 'abschnitt', titel: 'Abschnitt', art: 'text', inListe: true, breite: 200, gruppe: 'Leistung' },
    { name: 'gewerk', titel: 'Gewerk', art: 'text', inListe: true, breite: 150, gruppe: 'Leistung' },
    { name: 'din', titel: 'VOB/C (ATV DIN)', art: 'text', inListe: true, breite: 110, gruppe: 'Leistung' },
    { name: 'bezug', titel: 'Bezug', art: 'auswahl', inListe: true, breite: 130, gruppe: 'Leistung', optionen: [{ wert: 'bau', titel: 'je Gebäude' }, { wert: 'we', titel: 'je Einheit' }] },
    { name: 'dauer', titel: 'Richtdauer in Arbeitstagen', art: 'zahl', inListe: true, breite: 100, gruppe: 'Dauer' },
    { name: 'fest', titel: 'Dauer nicht hochrechnen', art: 'ja_nein', gruppe: 'Dauer' },
    { name: 'meilenstein', titel: 'Meilenstein', art: 'ja_nein', gruppe: 'Dauer' },
    { name: 'bezugsgroesse', titel: 'Menge aus', art: 'auswahl', gruppe: 'Dauer', optionen: [{ wert: '', titel: '–' }, { wert: 'wf', titel: 'Wohnfläche' }, { wert: 'bgf', titel: 'Brutto-Grundfläche' }, { wert: 'gr', titel: 'Grundfläche' }, { wert: 'fas', titel: 'Fassadenfläche' }, { wert: 'dach', titel: 'Dachfläche' }, { wert: 'wand', titel: 'Wandfläche innen' }, { wert: 'u', titel: 'Umfang' }, { wert: 'g', titel: 'Geschosse' }] },
    { name: 'leistungswert', titel: 'Leistung je Kolonne und Tag', art: 'zahl', gruppe: 'Dauer' },
    { name: 'kolonnen', titel: 'höchstens Kolonnen', art: 'zahl', gruppe: 'Dauer' },
    { name: 'wartezeit', titel: 'Wartezeit (läuft in allen Einheiten zugleich)', art: 'ja_nein', gruppe: 'Dauer' },
    { name: 'vorgaenger', titel: 'folgt auf (Kennungen, z. B. „mauer dach:aa:2“)', art: 'text', gruppe: 'Ablauf' },
    { name: 'ohne_bruecke', titel: 'nicht überbrücken, wenn nicht gewählt', art: 'ja_nein', gruppe: 'Ablauf' },
    { name: 'voraussetzung', titel: 'setzt voraus (Kennung)', art: 'text', gruppe: 'Ablauf' },
    { name: 'info', titel: 'Hinweis', art: 'langtext', gruppe: 'Hinweis' },
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung', art: 'text', gruppe: 'Aus dem Katalog' },
  ],
};
/** Regeln des Assistenten: Abschnitte, Gebäudetypen, Bauweisen, Gebäudearten und Maßnahmen – Daten, kein Programm. */
export const planregel: ObjektModell = {
  name: 'planregel', titel: 'Regel des Planungsassistenten', titelMehrzahl: 'Regeln des Planungsassistenten', anzeigeFeld: 'name', rechte: katalogRechte,
  felder: [
    { name: 'art', titel: 'Art', art: 'text', inListe: true, breite: 140, gruppe: 'Regel' },
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 320, gruppe: 'Regel' },
    { name: 'daten', titel: 'Daten', art: 'langtext', gruppe: 'Regel' },
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung', art: 'text', gruppe: 'Aus dem Katalog' },
  ],
};

export const bauzeitenplan: Beipackzettel = {
  id: 'bauzeitenplan',
  handy: 'ansicht',
  zeichen: 'plan',
  name: 'Bauzeitenplan',
  version: '0.2.0',
  beschreibung: 'Balkenplan eines Projekts: Leistungen mit Dauer in Arbeitstagen, Verknüpfungen, Gruppen, Unterbrechungen, Arbeitskalender mit Feiertagen, kritischer Weg – in benannten Versionen.',
  braucht: ['projekte', 'kataloge', 'adressen'],
  objekte: [zeitplan, freierTag, vorgang, verknuepfung, leistungsvorlage, planregel],
  ansichten: [
    { id: 'plan', titel: 'Balkenplan', abschnitt: 'Terminplan', zeichen: 'plan', objekt: 'vorgang', brauchtProjekt: true, hilfe: `Links die Leistungen, rechts die Balken. Anfang und Ende rechnet das Bauportal aus Projektanfang, Arbeitswoche, Feiertagen und den Vorgängern.

Eingeben wie gewohnt: Zelle anklicken und lostippen oder F2; Enter übernimmt, Tab geht zur nächsten Spalte, Esc bricht ab. Dauer „5“, „5t“, „2w“, „0“ = Meilenstein. Vorgänger „3;4AA+2t;5EE-1t“ (Zeilennummer, Art EA/AA/EE/AE, Abstand). Ein Datum bei Anfang setzt „nicht früher als“.

Einfg fügt unter der Markierung ein, ebenso „Leistung“ in der Menüleiste; auf freier Fläche im Balkenplan ziehen legt eine Leistung genau dort an, Entf löscht – mit „Autom. verknüpfen“ rückt die Kette nach. Alt+Umschalt+→/← gliedert ein und aus, Alt+Umschalt+↑/↓ verschiebt.

Mit der Maus: Balken ziehen verschiebt, rechte Kante ziehen ändert die Dauer, den Punkt am Balkenende auf eine andere Leistung ziehen verknüpft. Rechtsklick auf einen Balken: unterbrechen, Anfang wieder automatisch; auf einen Pfeil: Art ändern, löschen. Strg+Mausrad zoomt.

„✦ Assistent“ macht einen Plan aus dem Gebäudemodell; „Drucken / PDF“ bis A0; „Export / Import“ für Excel, MS Project und Sicherungen.` },
    { id: 'beteiligte', titel: 'Gewerke & Firmen', abschnitt: 'Beteiligte', zeichen: 'personen', objekt: 'projekt_kontakt', brauchtProjekt: true },
    { id: 'leistungen', titel: 'Leistungskatalog', abschnitt: 'Vorlagen', zeichen: 'katalog', objekt: 'leistungsvorlage', baum: ['abschnitt'] },
    { id: 'abhaengigkeiten', titel: 'Abhängigkeiten', abschnitt: 'Vorlagen', zeichen: 'ablauf', objekt: 'leistungsvorlage',
      hilfe: 'Eine Leistung des Katalogs in der Mitte – links ihre Vorgänger, rechts ihre Nachfolger. Eine Leistung aus der Liste links auf eine Seite ziehen oder „＋ Vorgänger …“ / „＋ Nachfolger …“ verknüpft; ✕ löst; ein Klick auf den Pfeil wechselt Ende → Anfang / Anfang → Anfang. Unten die Probe: die Gesamtbauzeit für ein Beispielgebäude.' },
    { id: 'frei', titel: 'Arbeitszeit & Feiertage', abschnitt: 'Projekt', zeichen: 'arbeitszeit', objekt: 'freier_tag', brauchtProjekt: true },
  ],
  kataloge: [{ id: 'leistungen', titel: 'Leistungen für den Bauzeitenplan', objekt: 'leistungsvorlage' }, { id: 'planregeln', titel: 'Regeln des Planungsassistenten', objekt: 'planregel' }],
  versionen: [{ bereich: 'bauzeitenplan', titel: 'Bauzeitenplan', wege: ['kopie', 'leer', 'projekt'] }],
};
