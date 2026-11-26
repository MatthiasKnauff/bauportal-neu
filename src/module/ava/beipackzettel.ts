// Modul Ausschreibung (AVA): Leistungsverzeichnisse je Projekt mit Positionen, Angebote der Bieter:innen mit Preisen
// (Preisspiegel, Vergabe), Rechnungen je Auftrag. Fachlich wie im bisherigen Bauportal: ein LV ist eine Vergabeeinheit
// (Gewerk), die Positionen sind nach Ordnungszahl (OZ) gegliedert – Titel enthalten Positionen.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] };

export const LV_STATUS = [
  { wert: 'bearbeitung', titel: 'in Bearbeitung' }, { wert: 'versendet', titel: 'versendet' }, { wert: 'angebote', titel: 'Angebote liegen vor' },
  { wert: 'vergeben', titel: 'vergeben' }, { wert: 'aufgehoben', titel: 'aufgehoben' },
];

export const lv: ObjektModell = {
  name: 'lv', titel: 'Leistungsverzeichnis', titelMehrzahl: 'Leistungsverzeichnisse', anzeigeFeld: 'name', ersatzName: ['nummer'], sortierFeld: 'nummer',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'nummer', titel: 'LV-Nr.', art: 'text', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Leistungsverzeichnis' },
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 260, kartenBreite: 4, gruppe: 'Leistungsverzeichnis' },
    { name: 'gewerk', titel: 'Gewerk nach VOB/C', art: 'verweis', ziel: 'gewerk', inListe: true, breite: 200, gruppe: 'Leistungsverzeichnis' },
    { name: 'kostengruppe', titel: 'Kostengruppe (DIN 276)', art: 'verweis', ziel: 'kostengruppe', gruppe: 'Leistungsverzeichnis' },
    { name: 'status', titel: 'Stand', art: 'auswahl', optionen: LV_STATUS, inListe: true, breite: 150, gruppe: 'Leistungsverzeichnis' },
    { name: 'vergabenummer', titel: 'Vergabenummer', art: 'text', gruppe: 'Vergabe' },
    { name: 'budget', titel: 'Kostenansatz netto in €', art: 'zahl', inListe: true, breite: 130, gruppe: 'Vergabe' },
    { name: 'abgabe', titel: 'Angebotsabgabe bis', art: 'datum', gruppe: 'Vergabe' },
    { name: 'bindefrist', titel: 'Bindefrist bis', art: 'datum', gruppe: 'Vergabe' },
    { name: 'ausfuehrung_beginn', titel: 'Ausführung ab', art: 'datum', gruppe: 'Vergabe' },
    { name: 'ausfuehrung_ende', titel: 'Ausführung bis', art: 'datum', gruppe: 'Vergabe' },
    { name: 'notiz', titel: 'Bemerkung', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

export const POSITIONSARTEN = [
  { wert: 'titel', titel: 'Titel' }, { wert: 'normal', titel: 'Position' }, { wert: 'bedarf', titel: 'Bedarfsposition (ohne GP)' },
  { wert: 'alternativ', titel: 'Alternativposition (ohne GP)' }, { wert: 'pauschal', titel: 'Pauschal' }, { wert: 'stundenlohn', titel: 'Stundenlohn' },
  { wert: 'hinweis', titel: 'Hinweistext' },
];

export const lvPosition: ObjektModell = {
  name: 'lv_position', titel: 'Position', titelMehrzahl: 'Positionen', anzeigeFeld: 'kurztext', ersatzName: ['oz'], sortierFeld: 'oz',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true, breite: 200 },
    { name: 'oz', titel: 'OZ', art: 'text', inListe: true, breite: 100, kartenBreite: 2, gruppe: 'Position' },
    { name: 'art', titel: 'Art', art: 'auswahl', optionen: POSITIONSARTEN, inListe: true, breite: 120, kartenBreite: 4, gruppe: 'Position' },
    { name: 'kurztext', titel: 'Kurztext', art: 'text', pflicht: true, inListe: true, breite: 360, kartenBreite: 6, gruppe: 'Position' },
    { name: 'langtext', titel: 'Langtext', art: 'langtext', gruppe: 'Position' },
    { name: 'menge', titel: 'Menge', art: 'zahl', inListe: true, breite: 90, kartenBreite: 2, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'einheit', titel: 'Einheit', art: 'text', vorschlagen: true, inListe: true, breite: 70, kartenBreite: 1, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'ep', titel: 'EP geschätzt in €', art: 'zahl', inListe: true, breite: 110, kartenBreite: 3, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'bauteil', titel: 'Bauteil im Gebäudemodell', art: 'verweis', ziel: 'bauteil', gruppe: 'Herkunft' },
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

export const angebot: ObjektModell = {
  name: 'angebot', titel: 'Angebot', titelMehrzahl: 'Angebote', anzeigeFeld: 'bieter',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true, inListe: true, breite: 220, gruppe: 'Angebot' },
    { name: 'bieter', titel: 'Bieter:in', art: 'verweis', ziel: 'kontakt', pflicht: true, inListe: true, breite: 220, gruppe: 'Angebot' },
    { name: 'eingang', titel: 'Eingang', art: 'datum', inListe: true, breite: 110, gruppe: 'Angebot' },
    { name: 'nachlass', titel: 'Nachlass in %', art: 'zahl', inListe: true, breite: 100, kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'skonto', titel: 'Skonto in %', art: 'zahl', kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'skonto_tage', titel: 'Skonto binnen Tagen', art: 'zahl', kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'ausgeschlossen', titel: 'Ausgeschlossen (nicht gewertet)', art: 'ja_nein', gruppe: 'Wertung' },
    { name: 'beauftragt', titel: 'Beauftragt', art: 'ja_nein', inListe: true, breite: 100, gruppe: 'Wertung' },
    { name: 'auftragsdatum', titel: 'Auftrag vom', art: 'datum', gruppe: 'Wertung' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

export const angebotPreis: ObjektModell = {
  name: 'angebot_preis', titel: 'Angebotspreis', titelMehrzahl: 'Angebotspreise', anzeigeFeld: 'ep',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'angebot', titel: 'Angebot', art: 'verweis', ziel: 'angebot', pflicht: true },
    { name: 'position', titel: 'Position', art: 'verweis', ziel: 'lv_position', pflicht: true },
    { name: 'ep', titel: 'EP in €', art: 'zahl' },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

/** Aufmaß je Position (kumuliert, wie im bisherigen Bauportal): Menge laut Firma und der eigene Rechenweg; geprüft ist die Summe des Rechenwegs. */
export const aufmass: ObjektModell = {
  name: 'aufmass', titel: 'Aufmaß', titelMehrzahl: 'Aufmaße', anzeigeFeld: 'menge_firma',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true },
    { name: 'position', titel: 'Position', art: 'verweis', ziel: 'lv_position', pflicht: true },
    { name: 'menge_firma', titel: 'Menge laut Firma', art: 'zahl' },
    { name: 'rechenweg', titel: 'Rechenweg (geprüft)', art: 'langtext' },
    { name: 'bemerkung', titel: 'Prüfvermerk', art: 'text' },
  ],
};

export const RECHNUNGSARTEN = [{ wert: 'abschlag', titel: 'Abschlagsrechnung' }, { wert: 'schluss', titel: 'Schlussrechnung' }, { wert: 'nachtrag', titel: 'Nachtrag' }, { wert: 'stundenlohn', titel: 'Stundenlohnrechnung' }];

export const rechnung: ObjektModell = {
  name: 'rechnung', titel: 'Rechnung', titelMehrzahl: 'Rechnungen', anzeigeFeld: 'nummer', ersatzName: ['datum'],
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Auftrag (LV)', art: 'verweis', ziel: 'lv', inListe: true, breite: 220, gruppe: 'Rechnung' },
    { name: 'firma', titel: 'Firma', art: 'verweis', ziel: 'kontakt', inListe: true, breite: 200, gruppe: 'Rechnung' },
    { name: 'art', titel: 'Art', art: 'auswahl', optionen: RECHNUNGSARTEN, inListe: true, breite: 160, gruppe: 'Rechnung' },
    { name: 'nummer', titel: 'Rechnungsnummer', art: 'text', inListe: true, breite: 140, gruppe: 'Rechnung' },
    { name: 'datum', titel: 'Rechnungsdatum', art: 'datum', inListe: true, breite: 110, gruppe: 'Rechnung' },
    { name: 'eingang', titel: 'Eingang', art: 'datum', gruppe: 'Rechnung' },
    { name: 'betrag', titel: 'Leistungsstand netto, angefordert (kumuliert) in €', art: 'zahl', inListe: true, breite: 140, gruppe: 'Beträge' },
    { name: 'geprueft', titel: 'Leistungsstand netto, geprüft (kumuliert) in €', art: 'zahl', inListe: true, breite: 140, gruppe: 'Beträge' },
    { name: 'einbehalt', titel: 'Sicherheitseinbehalt in %', art: 'zahl', gruppe: 'Beträge' },
    { name: 'status', titel: 'Stand', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Prüfung', optionen: [{ wert: 'offen', titel: 'offen' }, { wert: 'geprueft', titel: 'geprüft' }, { wert: 'bezahlt', titel: 'bezahlt' }] },
    { name: 'faellig', titel: 'Zahlung fällig am', art: 'datum', gruppe: 'Prüfung' },
    { name: 'notiz', titel: 'Prüfvermerk', art: 'langtext', gruppe: 'Prüfung' },
  ],
};

export const ava: Beipackzettel = {
  id: 'ava',
  zeichen: 'ausschreibung',
  name: 'Ausschreibung',
  version: '0.1.0',
  beschreibung: 'Leistungsverzeichnisse je Projekt, Angebote mit Preisspiegel und Vergabe, Rechnungen je Auftrag.',
  braucht: ['projekte', 'adressen', 'kataloge'],
  objekte: [lv, lvPosition, angebot, angebotPreis, aufmass, rechnung],
  ansichten: [
    { id: 'lvs', titel: 'Leistungsverzeichnisse', abschnitt: 'Ausschreibung', zeichen: 'liste_aufgaben', objekt: 'lv', baum: ['status'], brauchtProjekt: true,
      hilfe: 'Je Gewerk ein Leistungsverzeichnis (Vergabeeinheit) mit Stand, Kostenansatz und Terminen. Die Positionen stehen unter „Positionen“; rechts in der Karte die Summen: geschätzt, Angebote, Auftrag, abgerechnet.' },
    { id: 'positionen', titel: 'Positionen', abschnitt: 'Ausschreibung', zeichen: 'liste', objekt: 'lv_position', baum: ['lv'], brauchtProjekt: true,
      hilfe: 'Die Positionen aller LVs, links nach LV gegliedert. Ordnungszahl (OZ) wie 01.02.0010: Titel enthalten Positionen. Rechts in der Karte der Gesamtpreis (Menge × EP).' },
    { id: 'angebote', titel: 'Angebote', abschnitt: 'Vergabe', zeichen: 'personen', objekt: 'angebot', baum: ['lv'], brauchtProjekt: true },
    { id: 'preisspiegel', titel: 'Preisspiegel', abschnitt: 'Vergabe', zeichen: 'preisspiegel', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: die Positionen mit den Preisen aller Bieter:innen nebeneinander, das günstigste Angebot je Position markiert, unten die Summen mit Nachlass und der Rang. Preise direkt eintragen; „Vergeben an …“ beauftragt das Angebot.' },
    { id: 'aufmass', titel: 'Aufmaßprüfung', abschnitt: 'Abrechnung', zeichen: 'aufmass', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: je Position Menge laut Firma und dein Rechenweg (z. B. „Wand Nord: 2,5*3,1 - 0,8*2“, je Zeile ein Ansatz). Daneben ✓ stimmt, ✗ weicht ab, ○ noch offen, und der Betrag mit dem EP des Auftrags. „Übernehmen“ setzt die Menge der Firma als Rechenweg.' },
    { id: 'rechnungen', titel: 'Rechnungen', abschnitt: 'Abrechnung', zeichen: 'rechnung', objekt: 'rechnung', baum: ['lv', 'firma'], brauchtProjekt: true },
  ],
};
