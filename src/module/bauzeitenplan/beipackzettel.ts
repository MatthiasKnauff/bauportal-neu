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
    { name: 'gewerk', titel: 'Gewerk', art: 'text', inListe: true, breite: 150, gruppe: 'Ausführung' },
    { name: 'vob', titel: 'Gewerk nach VOB/C', art: 'verweis', ziel: 'gewerk', gruppe: 'Ausführung' },
    { name: 'unternehmer', titel: 'Unternehmer', art: 'text', gruppe: 'Ausführung' },
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

export const bauzeitenplan: Beipackzettel = {
  id: 'bauzeitenplan',
  name: 'Bauzeitenplan',
  version: '0.2.0',
  beschreibung: 'Balkenplan eines Projekts: Leistungen mit Dauer in Arbeitstagen, Verknüpfungen, Gruppen, Unterbrechungen, Arbeitskalender mit Feiertagen, kritischer Weg – in benannten Versionen.',
  braucht: ['projekte', 'kataloge', 'adressen'],
  objekte: [zeitplan, freierTag, vorgang, verknuepfung],
  ansichten: [
    { id: 'plan', titel: 'Balkenplan', objekt: 'vorgang', brauchtProjekt: true },
    { id: 'frei', titel: 'Freie Tage', objekt: 'freier_tag', brauchtProjekt: true },
  ],
  versionen: [{ bereich: 'bauzeitenplan', titel: 'Bauzeitenplan', wege: ['kopie', 'leer', 'projekt'] }],
};
