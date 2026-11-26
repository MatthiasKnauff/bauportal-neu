// Modul Ausschreibung (AVA): Leistungsverzeichnisse je Projekt mit Positionen, Angebote der Bieter:innen mit Preisen
// (Preisspiegel, Vergabe), Rechnungen je Auftrag. Fachlich wie im bisherigen Bauportal: ein LV ist eine Vergabeeinheit
// (Gewerk), die Positionen sind nach Ordnungszahl (OZ) gegliedert – Titel enthalten Positionen.
import { AUSSTATTUNG, TUER_WERTE } from './tueren';
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';
import { GRUNDLAGEN } from './besprechung';
import { AG_ARTEN } from './vertrag';

const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] };

export const LV_STATUS = [
  { wert: 'bearbeitung', titel: 'in Bearbeitung' }, { wert: 'versendet', titel: 'versendet' }, { wert: 'angebote', titel: 'Angebote liegen vor' },
  { wert: 'vergeben', titel: 'vergeben' }, { wert: 'aufgehoben', titel: 'aufgehoben' },
];

export const VERTRAGSARTEN = [{ wert: 'vob', titel: 'VOB/B' }, { wert: 'bgb', titel: 'BGB' }];
export const SICHERHEITSFORMEN = [{ wert: 'einbehalt', titel: 'Einbehalt' }, { wert: 'buergschaft', titel: 'Bürgschaft' }];
export const TAGARTEN = [{ wert: 'wt', titel: 'Werktag' }, { wert: 'at', titel: 'Arbeitstag' }, { wert: 'kt', titel: 'Kalendertag' }];

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
    { name: 'rueckmeldung_bis', titel: 'Rückmeldung der Bieter:innen bis', art: 'datum', gruppe: 'Vergabe' },
    { name: 'bindefrist', titel: 'Bindefrist bis', art: 'datum', gruppe: 'Vergabe' },
    { name: 'ausfuehrung_beginn', titel: 'Ausführung ab', art: 'datum', gruppe: 'Vergabe' },
    { name: 'ausfuehrung_ende', titel: 'Ausführung bis', art: 'datum', gruppe: 'Vergabe' },
    // Vertragsbedingungen (wie im bisherigen Bauportal: Zahlen, mit denen die Rechnungen rechnen – Protokoll und Vertrag nehmen den Text daraus)
    { name: 'vertragsart', titel: 'Vertrag nach', art: 'auswahl', optionen: VERTRAGSARTEN, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 've_prozent', titel: 'Sicherheit Vertragserfüllung in %', art: 'zahl', kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 've_form', titel: 'als', art: 'auswahl', optionen: SICHERHEITSFORMEN, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'ma_prozent', titel: 'Sicherheit Mängelansprüche in %', art: 'zahl', kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'ma_form', titel: 'als', art: 'auswahl', optionen: SICHERHEITSFORMEN, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'gewaehrleistung_jahre', titel: 'Mängelansprüche verjähren nach Jahren', art: 'zahl', kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'strafe_prozent', titel: 'Vertragsstrafe in % je Tag', art: 'zahl', kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'strafe_tagart', titel: 'je', art: 'auswahl', optionen: TAGARTEN, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'strafe_max', titel: 'höchstens in %', art: 'zahl', kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'bauabzug', titel: 'Bauabzugsteuer einbehalten (§ 48 EStG)', art: 'ja_nein', kartenBreite: 3, gruppe: 'Vertragsbedingungen' },
    { name: 'freistellung_bis', titel: 'Freistellungsbescheinigung gültig bis', art: 'datum', kartenBreite: 3, gruppe: 'Vertragsbedingungen' },
    { name: 'vorbemerkungen', titel: 'Vorbemerkungen', art: 'langtext', gruppe: 'Vorbemerkungen' },   // stehen vor den Positionen (LV bearbeiten: „Vorbemerkungen“)
    { name: 'oz_maske', titel: 'OZ-Maske', art: 'text', verborgen: true },   // „2.2.2.2:4:10“ = Stellen je Titelebene : Stellen der Position : Schritt (Nummerieren)
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
    { name: 'menge', titel: 'Menge', art: 'zahl', einheit: 'einheit', inListe: true, breite: 90, kartenBreite: 2, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'einheit', titel: 'Einheit', art: 'text', vorschlagen: true, inListe: true, breite: 70, kartenBreite: 1, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'ep', titel: 'EP geschätzt in €', art: 'zahl', inListe: true, breite: 110, kartenBreite: 3, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'nachtrag', titel: 'Nachtrag', art: 'verweis', ziel: 'nachtrag', inListe: true, breite: 160, gruppe: 'Position' },   // leer: Position der Ausschreibung; mit Nachtrag: erst nach der Vergabe, nicht im Preisspiegel
    { name: 'bauteil', titel: 'Bauteil im Gebäudemodell', art: 'verweis', ziel: 'bauteil', gruppe: 'Herkunft' },
    { name: 'tuerliste', titel: 'Aus der Fenster- & Türliste', art: 'text', verborgen: true },   // Schlüssel „Liste|Gruppe|Ausführung“ – hält LV und Liste abgleichbar
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

/** Rückmeldung einer Bieter:in vor der Abgabe (wie im bisherigen Bauportal); „abgegeben“ ist, wer ein Angebot eingereicht hat. */
export const RUECKMELDUNGEN = [{ wert: 'offen', titel: 'noch offen' }, { wert: 'will_abgeben', titel: 'will abgeben' }, { wert: 'gibt_nicht_ab', titel: 'gibt nicht ab' }];   // eine Auswahl hat immer einen Wert: ab Werk „noch offen“

// Fenster- & Türliste (wie im bisherigen Bauportal): mehrere Listen je Projekt, je Tür bzw. Fenster eine Zeile
export const tuerliste: ObjektModell = {
  name: 'tuerliste', titel: 'Fenster- & Türliste', titelMehrzahl: 'Fenster- & Türlisten', anzeigeFeld: 'name', sortierFeld: 'name',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'name', titel: 'Name der Liste', art: 'text', pflicht: true, inListe: true, breite: 240, gruppe: 'Liste' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Liste' },
  ],
};
const tw = (name: string, titel: string, gruppe: string, breite = 110, inListe = false) => ({ name, titel, art: 'auswahl' as const, optionen: TUER_WERTE[name]!, eigeneWerte: true, inListe, breite, gruppe });
export const tuer: ObjektModell = {
  name: 'tuer', titel: 'Tür / Fenster', titelMehrzahl: 'Türen und Fenster', anzeigeFeld: 'nr', ersatzName: ['raumname', 'art'], sortierFeld: 'nr',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'liste', titel: 'Liste', art: 'verweis', ziel: 'tuerliste', pflicht: true, breite: 180 },
    { name: 'nr', titel: 'Einbaupos. / Tür-Nr.', art: 'text', inListe: true, breite: 110, kartenBreite: 2, gruppe: 'Lage' },
    { name: 'geschoss', titel: 'Geschoss', art: 'text', vorschlagen: true, inListe: true, breite: 80, kartenBreite: 1, gruppe: 'Lage' },
    { name: 'raum', titel: 'Raum-Nr.', art: 'text', inListe: false, breite: 80, kartenBreite: 1, gruppe: 'Lage' },
    { name: 'raumname', titel: 'Raum', art: 'text', vorschlagen: true, inListe: true, breite: 140, kartenBreite: 2, gruppe: 'Lage' },
    { name: 'zu', titel: 'zu Raum', art: 'text', inListe: false, breite: 100, gruppe: 'Lage' },
    { name: 'typ', titel: 'Typ', art: 'text', vorschlagen: true, inListe: true, breite: 60, kartenBreite: 1, gruppe: 'Element' },
    { name: 'anzahl', titel: 'Anzahl', art: 'zahl', inListe: true, breite: 60, kartenBreite: 1, gruppe: 'Element' },
    tw('art', 'Art', 'Element', 130, true), tw('flg', 'Flügel', 'Element', 90), tw('din', 'Öffnungsrichtung (DIN)', 'Element', 80, true),
    { name: 'b', titel: 'Breite (m oder mm)', art: 'zahl', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { name: 'h', titel: 'Höhe (m oder mm)', art: 'zahl', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { name: 'wand', titel: 'Wanddicke', art: 'zahl', inListe: false, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { name: 'bruestung', titel: 'Brüstungshöhe', art: 'zahl', inListe: false, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    tw('oeffnung', 'Öffnungsart', 'Fenster', 110, false), tw('fb_innen', 'Innenfensterbank', 'Fenster', 120, false), tw('fb_aussen', 'Außenfensterbank', 'Fenster', 120, false), tw('rollo', 'Rollo', 'Fenster', 90, false),
    tw('zarge', 'Zarge', 'Ausführung', 150), tw('blatt', 'Türblatt', 'Ausführung', 130), tw('oberfl', 'Oberfläche', 'Ausführung', 110),
    { name: 'farbe', titel: 'Farbe / RAL', art: 'text', vorschlagen: true, inListe: false, breite: 90, gruppe: 'Ausführung' }, tw('glas', 'Verglasung', 'Ausführung', 110, false),
    tw('brand', 'Brandschutz', 'Anforderungen', 90, true), tw('schall', 'Schallschutz', 'Anforderungen', 90, false), tw('rc', 'Einbruch (RC)', 'Anforderungen', 70, false), tw('klima', 'Klimaklasse', 'Anforderungen', 70, false),
    tw('schloss', 'Schloss', 'Beschlag', 80), tw('beschlag', 'Beschlag', 'Beschlag', 150, false),
    { name: 'ausstattung', titel: 'Ausstattung', art: 'mehrfach', optionen: AUSSTATTUNG, inListe: false, breite: 200, gruppe: 'Ausstattung' },
    { name: 'bem', titel: 'Bemerkung', art: 'text', inListe: true, breite: 180, gruppe: 'Hinweis' },
    { name: 'bauteil', titel: 'Bauteil im Gebäudemodell', art: 'verweis', ziel: 'bauteil', gruppe: 'Herkunft' },
  ],
};

export const angebot: ObjektModell = {
  name: 'angebot', titel: 'Angebot', titelMehrzahl: 'Angebote', anzeigeFeld: 'bieter',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true, inListe: true, breite: 220, gruppe: 'Angebot' },
    { name: 'bieter', titel: 'Bieter:in', art: 'verweis', ziel: 'kontakt', pflicht: true, inListe: true, breite: 220, gruppe: 'Angebot' },
    { name: 'angeschrieben', titel: 'Angeschrieben am', art: 'datum', gruppe: 'Versand' },
    { name: 'rueckmeldung', titel: 'Rückmeldung', art: 'auswahl', optionen: RUECKMELDUNGEN, inListe: true, breite: 140, gruppe: 'Versand' },
    { name: 'nachfassen', titel: 'Nachfassen am (Anruf)', art: 'datum', gruppe: 'Versand' },
    { name: 'eingang', titel: 'Angebot eingegangen am', art: 'datum', inListe: true, breite: 110, gruppe: 'Angebot' },
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

export const NACHTRAGSGRUENDE = [
  { wert: 'mengen', titel: 'Mengenänderung (§ 2 Abs. 3 VOB/B)' }, { wert: 'geaendert', titel: 'geänderte Leistung (§ 2 Abs. 5 VOB/B)' },
  { wert: 'zusaetzlich', titel: 'zusätzliche Leistung (§ 2 Abs. 6 VOB/B)' }, { wert: 'ohne_auftrag', titel: 'Leistung ohne Auftrag (§ 2 Abs. 8 VOB/B)' },
  { wert: 'stundenlohn', titel: 'Stundenlohnarbeiten (§ 2 Abs. 10 VOB/B)' }, { wert: 'sonstiges', titel: 'sonstiges' },
];
export const NACHTRAGSSTAENDE = [
  { wert: 'angemeldet', titel: 'angemeldet' }, { wert: 'angeboten', titel: 'Angebot liegt vor' }, { wert: 'geprueft', titel: 'geprüft' },
  { wert: 'beauftragt', titel: 'beauftragt' }, { wert: 'abgelehnt', titel: 'abgelehnt' },
];
/** Nachtrag zu einem vergebenen LV (wie im bisherigen Bauportal: ein eigener Gliederungspunkt, die Positionen darunter). */
export const nachtrag: ObjektModell = {
  name: 'nachtrag', titel: 'Nachtrag', titelMehrzahl: 'Nachträge', anzeigeFeld: 'name', ersatzName: ['nummer'], sortierFeld: 'nummer',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Auftrag (LV)', art: 'verweis', ziel: 'lv', pflicht: true, inListe: true, breite: 200, gruppe: 'Nachtrag' },
    { name: 'nummer', titel: 'Nachtrags-Nr.', art: 'text', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Nachtrag' },
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 260, kartenBreite: 4, gruppe: 'Nachtrag' },
    { name: 'grund', titel: 'Grund', art: 'auswahl', optionen: NACHTRAGSGRUENDE, inListe: true, breite: 200, gruppe: 'Nachtrag' },
    { name: 'stand', titel: 'Stand', art: 'auswahl', optionen: NACHTRAGSSTAENDE, inListe: true, breite: 140, gruppe: 'Nachtrag' },
    { name: 'angemeldet', titel: 'angemeldet am', art: 'datum', gruppe: 'Termine' },
    { name: 'angebot_vom', titel: 'Angebot vom', art: 'datum', gruppe: 'Termine' },
    { name: 'beauftragt_am', titel: 'beauftragt am', art: 'datum', gruppe: 'Termine' },
    { name: 'betrag', titel: 'Betrag netto in € (ohne Positionen)', art: 'zahl', gruppe: 'Betrag' },   // nur ohne Positionen (Pauschale)
    { name: 'begruendung', titel: 'Begründung', art: 'langtext', gruppe: 'Notiz' },
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
    { name: 'einbehalt', titel: 'Sicherheitseinbehalt in % (leer: wie im LV vereinbart)', art: 'zahl', gruppe: 'Beträge' },
    { name: 'abnahme', titel: 'Abnahme am', art: 'datum', gruppe: 'Beträge', wenn: { art: ['schluss'] } },
    { name: 'strafe', titel: 'Vertragsstrafe in €', art: 'zahl', gruppe: 'Beträge', wenn: { art: ['schluss'] } },
    { name: 'status', titel: 'Stand', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Prüfung', optionen: [{ wert: 'offen', titel: 'offen' }, { wert: 'geprueft', titel: 'geprüft' }, { wert: 'bezahlt', titel: 'bezahlt' }] },
    { name: 'faellig', titel: 'Zahlung fällig am', art: 'datum', gruppe: 'Prüfung' },
    { name: 'notiz', titel: 'Prüfvermerk', art: 'langtext', gruppe: 'Prüfung' },
  ],
};


// Angebotsbesprechung (Protokoll) je Angebot – die Felder kommen aus den Daten (besprechung.ts), bis jemand sie ändert
export const besprechung: ObjektModell = {
  name: 'besprechung', titel: 'Angebotsbesprechung', titelMehrzahl: 'Angebotsbesprechungen', anzeigeFeld: 'bieter', ersatzName: ['datum'], sortierFeld: 'datum',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true, inListe: true, breite: 220, gruppe: 'Besprechung' },
    { name: 'angebot', titel: 'Angebot (Bieter:in)', art: 'verweis', ziel: 'angebot', pflicht: true, inListe: true, breite: 220, gruppe: 'Besprechung' },
    { name: 'stand', titel: 'Stand', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Besprechung', optionen: [{ wert: 'entwurf', titel: 'Entwurf' }, { wert: 'abgeschlossen', titel: 'abgeschlossen' }] },
    { name: 'datum', titel: 'Datum', art: 'datum', inListe: true, breite: 110, kartenBreite: 2, gruppe: 'Besprechung' },
    { name: 'uhrzeit', titel: 'Uhrzeit', art: 'text', kartenBreite: 1, gruppe: 'Besprechung' },
    { name: 'ort', titel: 'Ort', art: 'text', vorschlagen: true, kartenBreite: 3, gruppe: 'Besprechung' },
    { name: 'teilnehmer', titel: 'Teilnehmer:innen', art: 'langtext', gruppe: 'Besprechung' },
    { name: 'bauvorhaben', titel: 'Bauvorhaben', art: 'langtext', gruppe: 'Beteiligte' },
    { name: 'bauherr', titel: 'Bauherr:in / AG', art: 'langtext', gruppe: 'Beteiligte' },
    { name: 'architekt', titel: 'Architekt:in', art: 'langtext', gruppe: 'Beteiligte' },
    { name: 'bieter', titel: 'Bieter:in / AN', art: 'langtext', inListe: true, breite: 260, gruppe: 'Beteiligte' },
    { name: 'rechtsform', titel: 'Rechtsform / Sitz', art: 'text', gruppe: 'Angaben der Bieter:in' },
    { name: 'mitarbeiter', titel: 'Mitarbeiter:innen', art: 'text', kartenBreite: 3, gruppe: 'Angaben der Bieter:in' },
    { name: 'mitarbeiter_projekt', titel: 'Mitarbeiter:innen fürs Projekt', art: 'text', kartenBreite: 3, gruppe: 'Angaben der Bieter:in' },
    { name: 'bauleiter', titel: 'Bauleiter:in', art: 'text', gruppe: 'Angaben der Bieter:in' },
    { name: 'subunternehmer', titel: 'Subunternehmer', art: 'text', gruppe: 'Angaben der Bieter:in' },
    { name: 'gueltig', titel: 'Gültigkeit', art: 'text', gruppe: 'Angebot' },
    { name: 'angebot_vom', titel: 'Angebot vom', art: 'text', kartenBreite: 2, gruppe: 'Angebot' },
    { name: 'gewerke', titel: 'Gewerke', art: 'text', kartenBreite: 4, gruppe: 'Angebot' },
    { name: 'nachlass', titel: 'Nachlass', art: 'text', kartenBreite: 2, gruppe: 'Angebot' },
    { name: 'skonto', titel: 'Skonto', art: 'text', kartenBreite: 4, gruppe: 'Angebot' },
    { name: 'preis', titel: 'Preis', art: 'langtext', gruppe: 'Angebot' },
    { name: 'klaerung', titel: 'Klärungen zum Angebot', art: 'langtext', gruppe: 'Angebot' },
    { name: 'beginn', titel: 'Beginn', art: 'text', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'fertig', titel: 'Fertigstellung', art: 'text', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'unterbrechung', titel: 'Unterbrechung', art: 'text', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'bauzeitenplan', titel: 'Bauzeitenplan', art: 'text', gruppe: 'Termine' },
    ...GRUNDLAGEN.map(([name, titel]): ObjektModell['felder'][number] => ({ name, titel, art: 'text', gruppe: 'Vertragsgrundlagen' })),
    { name: 'ergebnis', titel: 'Ergebnis / Vereinbarungen', art: 'langtext', gruppe: 'Ergebnis' },
    { name: 'quellen', titel: 'Stand der Quellen beim letzten Abgleich', art: 'langtext', verborgen: true },
  ],
};


// Bauvertrag je Auftrag: einmal aus Auftrag und Protokoll angelegt (vertrag.ts), danach ein eigenes Schriftstück
export const bauvertrag: ObjektModell = {
  name: 'bauvertrag', titel: 'Bauvertrag', titelMehrzahl: 'Bauverträge', anzeigeFeld: 'gegenstand', ersatzName: ['datum'], sortierFeld: 'datum',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Auftrag (LV)', art: 'verweis', ziel: 'lv', pflicht: true, inListe: true, breite: 220, gruppe: 'Vertrag' },
    { name: 'angebot', titel: 'Angebot (Auftragnehmer:in)', art: 'verweis', ziel: 'angebot', pflicht: true, inListe: true, breite: 220, gruppe: 'Vertrag' },
    { name: 'datum', titel: 'Datum', art: 'datum', inListe: true, breite: 110, gruppe: 'Vertrag' },
    { name: 'ag_art', titel: 'Auftraggeber:in ist', art: 'auswahl', optionen: AG_ARTEN, gruppe: 'Vertrag' },
    { name: 'gegenstand', titel: '§ 1 Gegenstand', art: 'text', gruppe: 'Vertrag' },
    { name: 'ag', titel: 'Auftraggeber:in', art: 'langtext', gruppe: 'Parteien' },
    { name: 'an', titel: 'Auftragnehmer:in', art: 'langtext', gruppe: 'Parteien' },
    { name: 'bestandteile', titel: '§ 2 Vertragsbestandteile', art: 'langtext', gruppe: 'Regelungen' },
    { name: 'verguetung', titel: '§ 3 Vergütung', art: 'langtext', gruppe: 'Regelungen' },
    { name: 'termine', titel: '§ 4 Ausführungsfristen', art: 'langtext', gruppe: 'Regelungen' },
    { name: 'zahlung', titel: '§ 5 Abrechnung und Zahlung', art: 'langtext', gruppe: 'Regelungen' },
    { name: 'sicherheiten', titel: '§ 6 Sicherheiten', art: 'langtext', gruppe: 'Regelungen' },
    { name: 'abnahme', titel: '§ 7 Abnahme und Mängelansprüche', art: 'langtext', gruppe: 'Regelungen' },
    { name: 'weiteres', titel: '§ 8 Weitere Vereinbarungen', art: 'langtext', gruppe: 'Regelungen' },
  ],
};

export const ava: Beipackzettel = {
  id: 'ava',
  handy: 'ansicht',
  zeichen: 'ausschreibung',
  farbe: '#f08c00',
  name: 'Ausschreibung',
  version: '0.1.0',
  beschreibung: 'Leistungsverzeichnisse je Projekt, Angebote mit Preisspiegel und Vergabe, Rechnungen je Auftrag.',
  braucht: ['projekte', 'adressen', 'kataloge'],
  objekte: [lv, lvPosition, tuerliste, tuer, angebot, angebotPreis, nachtrag, aufmass, rechnung, besprechung, bauvertrag],
  // Ins Fenster ziehen (PDF, Scan, Foto): vorbelegt nach der Seite, auf der man steht – erkannt am Text
  dokumentarten: [
    { art: 'angebot', titel: 'Angebot', objekt: 'angebot', ansichten: ['angebote', 'preisspiegel', 'versand', 'nachverfolgen', 'besprechungen'], ordner: 'Ausschreibung/{lv}/Angebote',
      merkmale: ['\\bangebot\\b', 'angebotsnummer', 'angebot\\s*nr', 'unser angebot', 'bindefrist', 'angebotssumme'], nummerWort: 'angebot',
      felder: { lv: 'lv', firma: 'bieter', eingang: 'eingang' }, vorhanden: ['lv', 'bieter'], vorgaben: { rueckmeldung: 'angebot' } },
    { art: 'rechnung', titel: 'Abschlagsrechnung', objekt: 'rechnung', ansichten: ['rechnungen', 'aufmass', 'auftraege'], ordner: 'Ausschreibung/{lv}/Rechnungen',
      merkmale: ['abschlagsrechnung', 'teilrechnung', '\\brechnung\\b', 'rechnungsnummer', 'rechnung\\s*nr', 'rechnungsdatum', 'zahlbar bis'], nummerWort: 'rechnung',
      felder: { lv: 'lv', firma: 'firma', nummer: 'nummer', datum: 'datum', betrag: 'betrag', eingang: 'eingang' }, vorgaben: { art: 'abschlag', status: 'offen' } },
    { art: 'schlussrechnung', titel: 'Schlussrechnung', objekt: 'rechnung', ordner: 'Ausschreibung/{lv}/Rechnungen',
      merkmale: ['schlussrechnung', 'rechnungsnummer', 'rechnung\\s*nr', 'rechnungsdatum', 'zahlbar bis', 'schlusszahlung'], nummerWort: 'rechnung',
      felder: { lv: 'lv', firma: 'firma', nummer: 'nummer', datum: 'datum', betrag: 'betrag', eingang: 'eingang' }, vorgaben: { art: 'schluss', status: 'offen' } },
    { art: 'nachtragsangebot', titel: 'Nachtragsangebot', objekt: 'nachtrag', ansichten: ['nachtraege'], ordner: 'Ausschreibung/{lv}/Nachträge',
      merkmale: ['nachtragsangebot', 'nachtrag\\s*nr', 'nachtragsnummer', 'mehrkosten', 'zusätzliche leistung'], nummerWort: 'nachtrag',
      felder: { lv: 'lv', nummer: 'nummer', datum: 'angebot_vom', betrag: 'betrag' }, vorgaben: { stand: 'angeboten', name: 'Nachtragsangebot' } },
    { art: 'aufmass', titel: 'Aufmaß der Firma', ordner: 'Ausschreibung/{lv}/Aufmaß', merkmale: ['aufmaß', 'aufmass', 'massenermittlung', 'mengenermittlung'] },
    { art: 'buergschaft', titel: 'Bürgschaft', ordner: 'Ausschreibung/{lv}/Bürgschaften', merkmale: ['bürgschaft', 'bürgin', 'bürge\\b', 'gewährleistungsbürgschaft', 'vertragserfüllungsbürgschaft'] },
    { art: 'lv', titel: 'Leistungsverzeichnis', ordner: 'Ausschreibung/{lv}', ansichten: ['lvs', 'positionen'], merkmale: ['leistungsverzeichnis', 'leistungsbeschreibung', 'vorbemerkungen'] },
  ],
  ausdrucke: [{
    // Das LV zum Versand an die Bieter:innen: Angaben zur Ausschreibung, Vorbemerkungen, Positionen mit EP/GP zum Ausfüllen,
    // Zusammenstellung, Angebotssumme und Unterschrift (einstellbar: mit den geschätzten Preisen, nur Kurztexte)
    id: 'ava.lv', titel: 'Leistungsverzeichnis', objekt: 'lv',
    dateiname: 'LV {nummer} {name}', fuss: '{buero} · Leistungsverzeichnis {nummer} {name}', ordner: 'AVA/Ausschreibung',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Leistungsverzeichnis', unter: '{nummer} {name}' },
      { id: 'angaben', art: 'felder', felder: ['vergabenummer', 'gewerk', 'abgabe', 'bindefrist', 'ausfuehrung_beginn', 'ausfuehrung_ende'] },
      { id: 'vorbemerkungen', art: 'text', feld: 'vorbemerkungen' },
      { id: 'positionen', art: 'lv', objekt: 'lv_position', ueber: 'lv', ohne: 'nachtrag', titel: 'Leistungen' },
      { id: 'unterschrift', art: 'unterschriften', parteien: ['Bieter:in (Firma, Stempel, Unterschrift)'] },
    ],
  }, {
    id: 'ava.bauvertrag', titel: 'Bauvertrag', objekt: 'bauvertrag',
    dateiname: 'Bauvertrag {lv} {datum}', fuss: '{buero} · Bauvertrag {lv}', ordner: 'AVA/Vergabe',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Bauvertrag', unter: '{gegenstand}' },
      { id: 'parteien', art: 'felder', felder: ['ag', 'an'] },
      { id: 'gegenstand', art: 'felder', felder: ['gegenstand'] },
      ...(['bestandteile', 'verguetung', 'termine', 'zahlung', 'sicherheiten', 'abnahme', 'weiteres'] as const).map((feld) => ({ id: feld, art: 'text' as const, feld })),
      { id: 'unterschriften', art: 'unterschriften', parteien: ['Auftraggeber:in', 'Auftragnehmer:in'] },
    ],
  }, {
    id: 'ava.besprechung', titel: 'Protokoll Angebotsbesprechung', objekt: 'besprechung',
    dateiname: 'Angebotsbesprechung {lv} {datum}', fuss: '{buero} · Angebotsbesprechung {lv} vom {datum}', ordner: 'AVA/Vergabe',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Protokoll Angebotsbesprechung', unter: '{lv} · {datum}' },
      { id: 'besprechung', art: 'felder', felder: ['datum', 'uhrzeit', 'ort'] },
      { id: 'teilnehmer', art: 'text', feld: 'teilnehmer' },
      { id: 'beteiligte', art: 'felder', felder: ['bauvorhaben', 'bauherr', 'architekt', 'bieter'] },
      { id: 'bieterangaben', art: 'felder', felder: ['rechtsform', 'mitarbeiter', 'mitarbeiter_projekt', 'bauleiter', 'subunternehmer'] },
      { id: 'angebot', art: 'felder', felder: ['gueltig', 'angebot_vom', 'gewerke', 'nachlass', 'skonto', 'preis'] },
      { id: 'klaerung', art: 'text', feld: 'klaerung' },
      { id: 'termine', art: 'felder', felder: ['beginn', 'fertig', 'unterbrechung', 'bauzeitenplan'] },
      { id: 'grundlagen', art: 'felder', felder: GRUNDLAGEN.map(([n]) => n) },
      { id: 'ergebnis', art: 'text', feld: 'ergebnis' },
    ],
  }],
  ansichten: [
    { id: 'lvs', titel: 'Leistungsverzeichnisse', abschnitt: 'Ausschreibung', zeichen: 'liste_aufgaben', objekt: 'lv', baum: ['status'], brauchtProjekt: true,
      hilfe: 'Je Gewerk ein Leistungsverzeichnis (Vergabeeinheit) mit Stand, Kostenansatz und Terminen. Die Positionen stehen unter „Positionen“; rechts in der Karte die Summen: geschätzt, Angebote, Auftrag, abgerechnet.' },
    { id: 'lv', titel: 'LV bearbeiten', abschnitt: 'Ausschreibung', zeichen: 'ausschreibung', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: Titel und Positionen als Baum. Zelle anklicken und lostippen oder doppelklicken; Enter eine Zeile tiefer, Tab zur nächsten Spalte. Art: N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext. ¶ klappt den Langtext auf. Einfg legt eine Position unter der markierten an (Alt+Einfg einen Titel), Entf löscht. „Nummerieren“ vergibt die OZ neu. Nach der Vergabe gesperrt – 🔒 schaltet frei.' },
    { id: 'tueren', titel: 'Fenster- & Türliste', abschnitt: 'Ausschreibung', zeichen: 'tuer', objekt: 'tuer', baum: ['liste', 'geschoss'], brauchtProjekt: true,
      hilfe: 'Je Tür bzw. Fenster eine Zeile – direkt in der Tabelle bearbeiten. „Aus dem Gebäudemodell“ legt die Türen und Fenster des Modells an; „Ins LV“ macht aus gleicher Ausführung eine Position (Menge = Stückzahl) mit Systembeschreibung je Gruppe und gleicht ein LV mit Positionen aus dieser Liste ab.' },
    { id: 'positionen', titel: 'Positionen', abschnitt: 'Ausschreibung', zeichen: 'liste', objekt: 'lv_position', baum: ['lv', 'nachtrag'], brauchtProjekt: true,
      hilfe: 'Die Positionen aller LVs, links nach LV gegliedert. Ordnungszahl (OZ) wie 01.02.0010: Titel enthalten Positionen. Rechts in der Karte der Gesamtpreis (Menge × EP).' },
    { id: 'versand', titel: 'Versand & Rücklauf', abschnitt: 'Vergabe', zeichen: 'senden', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: die angeschriebenen Bieter:innen mit Rückmeldung (will abgeben · gibt nicht ab), Nachfassen und Eingang des Angebots; oben Fristen und Zähler, die Unterlagen (LV als GAEB X83).' },
    { id: 'nachverfolgen', titel: 'Nachverfolgen', abschnitt: 'Vergabe', zeichen: 'telefon', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Alle Bieter:innen der LVs, die noch nicht vergeben sind: fällige Anrufe, Abgaben in den nächsten drei Tagen, wie viele Angebote da sind.' },
    { id: 'angebote', titel: 'Angebote', abschnitt: 'Vergabe', zeichen: 'personen', objekt: 'angebot', baum: ['lv'], brauchtProjekt: true },
    { id: 'preisspiegel', titel: 'Preisspiegel', abschnitt: 'Vergabe', zeichen: 'preisspiegel', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: die Positionen mit den Preisen aller Bieter:innen nebeneinander, das günstigste Angebot je Position markiert, unten die Summen mit Nachlass und der Rang. Preise direkt eintragen; „Vergeben an …“ beauftragt das Angebot.' },
    { id: 'besprechungen', titel: 'Angebotsbesprechung', abschnitt: 'Vergabe', zeichen: 'vertrag', objekt: 'besprechung', baum: ['lv'], brauchtProjekt: true,
      hilfe: 'Protokoll der Angebotsbesprechung je Angebot – anlegen im Preisspiegel oder an der Karte des Angebots. Jedes Feld kommt aus den Daten (Projekt, Büro, Adressen, Angebot, LV, Bauzeitenplan, Vertragsgrundlagen); solange das Protokoll ein Entwurf ist, folgt es ihnen. Von Hand Geändertes bleibt, mit Hinweis, wenn sich die Quelle ändert. Drucken als PDF.' },
    { id: 'bauvertraege', titel: 'Bauverträge', abschnitt: 'Vergabe', zeichen: 'vertrag', objekt: 'bauvertrag', baum: ['lv'], brauchtProjekt: true,
      hilfe: 'Bauvertrag je Auftrag – anlegen an der Karte des beauftragten Angebots. Er entsteht einmal aus Auftrag und Protokoll der Angebotsbesprechung (alle Regelungen ausgeschrieben) und lässt sich danach ändern. Drucken als PDF zum Unterschreiben.' },
    { id: 'auftraege', titel: 'Aufträge', abschnitt: 'Abrechnung', zeichen: 'vertrag', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein vergebenes LV wählen: Hauptauftrag und Nachträge mit Stand und Betrag, darunter Prognose (Auftrag + Nachträge) und abgerechnet. Nachtragspositionen mit EP direkt eintragen.' },
    { id: 'nachtraege', titel: 'Nachträge', abschnitt: 'Abrechnung', zeichen: 'nachtrag', objekt: 'nachtrag', baum: ['lv', 'stand'], brauchtProjekt: true },
    { id: 'aufmass', titel: 'Aufmaßprüfung', abschnitt: 'Abrechnung', zeichen: 'aufmass', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: je Position Menge laut Firma und dein Rechenweg (z. B. „Wand Nord: 2,5*3,1 - 0,8*2“, je Zeile ein Ansatz). Daneben ✓ stimmt, ✗ weicht ab, ○ noch offen, und der Betrag mit dem EP des Auftrags. „Übernehmen“ setzt die Menge der Firma als Rechenweg.' },
    { id: 'rechnungen', titel: 'Rechnungen', abschnitt: 'Abrechnung', zeichen: 'rechnung', objekt: 'rechnung', baum: ['lv', 'firma'], brauchtProjekt: true },
    { id: 'kostenkontrolle', titel: 'Kostenkontrolle', abschnitt: 'Kostenübersicht', zeichen: 'kosten', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Alle Vergabeeinheiten des Projekts in einer Tabelle: Schätzung, bestes Angebot, Auftrag, beauftragte Nachträge, abgerechnet, noch offen und die Abweichung zur Schätzung.' },
  ],
};
