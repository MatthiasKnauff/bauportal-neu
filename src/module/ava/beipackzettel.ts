// Modul Ausschreibung (AVA): Leistungsverzeichnisse je Projekt mit Positionen, Angebote der Bieter:innen mit Preisen
// (Preisspiegel, Vergabe), Rechnungen je Auftrag. Fachlich wie im bisherigen Bauportal: ein LV ist eine Vergabeeinheit
// (Gewerk), die Positionen sind nach Ordnungszahl (OZ) gegliedert – Titel enthalten Positionen.
import { AUSSTATTUNG, TUER_WERTE } from './tueren';
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';
import { GRUNDLAGEN } from './besprechung';
import { AG_ARTEN } from './vertrag';
import { vorgabeFelder } from '../../kern/erben';
import { ABGABEORTE, AUFFORDERUNGEN, AUSTAUSCHFORMATE, ENERGIE, NACHUNTERNEHMER, NACHWEISE, RECHNUNGSSTELLUNG, UHRZEITEN, VERGABEARTEN, VEREINBARUNGEN, ZAHLUNGSFRISTEN } from './ausschreibungsdaten';

const rechte = { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] };

export const NICHT_GRUENDE = [{ wert: '', titel: '– ohne Angabe –' }, { wert: 'entfallen', titel: 'Leistung entfällt' }, { wert: 'aufgehoben', titel: 'Ausschreibung aufgehoben' },
  { wert: 'anderweitig', titel: 'anderweitig vergeben' }, { wert: 'zurueckgestellt', titel: 'zurückgestellt' }];
export const LV_STATUS = [
  { wert: 'bearbeitung', titel: 'in Bearbeitung' }, { wert: 'versendet', titel: 'versendet' }, { wert: 'angebote', titel: 'Angebote liegen vor' },
  { wert: 'vergeben', titel: 'vergeben' }, { wert: 'aufgehoben', titel: 'aufgehoben' },
];

export const VERTRAGSARTEN = [{ wert: 'vob', titel: 'VOB/B' }, { wert: 'bgb', titel: 'BGB' }];
export const SICHERHEITSFORMEN = [{ wert: 'einbehalt', titel: 'Einbehalt' }, { wert: 'buergschaft', titel: 'Bürgschaft' }];
export const TAGARTEN = [{ wert: 'wt', titel: 'Werktag' }, { wert: 'at', titel: 'Arbeitstag' }, { wert: 'kt', titel: 'Kalendertag' }];
/** Wie eine Skontofrist gezählt wird (wie im bisherigen Bauportal). */
export const FRISTARTEN = [{ wert: 'kt', titel: 'Kalendertagen (Mo–So)' }, { wert: 'wt', titel: 'Werktagen (Mo–Sa)' }, { wert: 'at', titel: 'Arbeitstagen (Mo–Fr)' }, { wert: 'wo', titel: 'Wochen' }];

export const lv: ObjektModell = {
  name: 'lv', titel: 'Leistungsverzeichnis', titelMehrzahl: 'Leistungsverzeichnisse', anzeigeFeld: 'name', ersatzName: ['nummer'], sortierFeld: 'nummer',
  projektFeld: 'projekt', rechte,
  eingeklappt: ['Angebotsaufforderung', 'Vertragsbedingungen', 'Sicherheiten'],
  erben: { praefix: 'lv_', ebenen: [{ objekt: 'projekt', ueber: 'projekt', titel: 'vom Projekt' }, { objekt: 'buero', titel: 'vom Büro' }] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'nummer', titel: 'LV-Nr.', art: 'text', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Leistungsverzeichnis' },
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 260, kartenBreite: 4, gruppe: 'Leistungsverzeichnis' },
    { name: 'gewerk', titel: 'Gewerk nach VOB/C', art: 'verweis', ziel: 'gewerk', inListe: true, breite: 200, gruppe: 'Leistungsverzeichnis' },
    { name: 'kostengruppe', titel: 'Kostengruppe (DIN 276)', art: 'verweis', ziel: 'kostengruppe', gruppe: 'Leistungsverzeichnis' },
    { name: 'status', titel: 'Stand', art: 'auswahl', optionen: LV_STATUS, inListe: true, breite: 150, gruppe: 'Leistungsverzeichnis' },
    // „Nicht vergeben“ wie bisher mit Grund und Tag (zurücknehmen im Preisspiegel)
    { name: 'nicht_vergeben_grund', titel: 'Nicht vergeben, weil', art: 'auswahl', optionen: NICHT_GRUENDE, kartenBreite: 4, gruppe: 'Leistungsverzeichnis', wenn: { status: ['aufgehoben'] } },
    { name: 'versand_ohne_x83', titel: 'GAEB-Datei nicht mitschicken', art: 'ja_nein', verborgen: true },
    { name: 'versand_ohne', titel: 'Unterlagen, die nicht mitgehen', art: 'text', verborgen: true },   // Kennungen der Dokumente „a,b“
    { name: 'versand_texte', titel: 'Eigene Versandtexte (je Lauf)', art: 'langtext', verborgen: true },   // JSON {lauf: {betreff, text}} – „Text für dieses LV merken“
    { name: 'nicht_vergeben_am', titel: 'am', art: 'datum', kartenBreite: 2, gruppe: 'Leistungsverzeichnis', wenn: { status: ['aufgehoben'] } },
    { name: 'archiviert', titel: 'Im Archiv (aus den Listen genommen, alles bleibt erhalten)', art: 'ja_nein', gruppe: 'Leistungsverzeichnis' },
    // Ausschreibung (wie im bisherigen Bauportal): „erbt“ = leer gilt die Angabe am Projekt bzw. die Vorgabe des Büros
    { name: 'vergabeart', titel: 'Vergabeart', art: 'auswahl', optionen: VERGABEARTEN, eigeneWerte: true, erbt: true, gruppe: 'Ausschreibung' },
    { name: 'vergabenummer', spalte: true, titel: 'Vergabenummer', art: 'text', gruppe: 'Ausschreibung' },
    { name: 'budget', titel: 'Kostenansatz netto in €', art: 'zahl', inListe: true, breite: 130, gruppe: 'Ausschreibung' },
    // Auftrag ohne LV und Angebot (bisher „Zettelwirtschaft“): nur Firma (das beauftragte Angebot ohne Preise) und Auftragssumme;
    // abgerechnet wird mit Einzelrechnungen (Betrag oder Positionen von Hand)
    { name: 'ohne_lv', spalte: true, titel: 'Auftrag ohne LV (nur Firma und Summe)', art: 'ja_nein', gruppe: 'Ausschreibung' },
    { name: 'auftragssumme', spalte: true, titel: 'Auftragssumme netto in € (ohne LV)', art: 'zahl', gruppe: 'Ausschreibung' },
    { name: 'versand', spalte: true, titel: 'Versand an die Bieter:innen', art: 'datum', kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'rueckmeldung_bis', titel: 'Rückmeldung der Bieter:innen bis', art: 'datum', datumVorschlaege: [{ titel: '+3 Tage', tage: 3 }, { titel: '+1 Woche', wochen: 1 }, { titel: '1 Woche vor Abgabe', tage: -7, ab: 'abgabe' }], kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'abgabe', spalte: true, titel: 'Angebotsabgabe bis', art: 'datum', datumVorschlaege: [{ titel: '+2 Wochen', wochen: 2 }, { titel: '+3 Wochen', wochen: 3 }, { titel: '+4 Wochen', wochen: 4 }], kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'abgabe_zeit', titel: 'Uhrzeit', art: 'auswahl', optionen: UHRZEITEN, eigeneWerte: true, erbt: true, kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'abgabeort', titel: 'Abgabeort', art: 'auswahl', optionen: ABGABEORTE, eigeneWerte: true, erbt: true, gruppe: 'Ausschreibung' },
    { name: 'eroeffnung', spalte: true, titel: 'Eröffnungstermin (Submission)', art: 'datum', datumVorschlaege: [{ titel: 'am Abgabetag', tage: 0, ab: 'abgabe' }, { titel: '+1 Tag nach Abgabe', tage: 1, ab: 'abgabe' }, { titel: '+1 Woche nach Abgabe', wochen: 1, ab: 'abgabe' }], kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'bindefrist', spalte: true, titel: 'Zuschlags- und Bindefrist bis', art: 'datum', datumVorschlaege: [{ titel: '4 Wochen nach Abgabe', wochen: 4, ab: 'abgabe' }, { titel: '6 Wochen nach Abgabe', wochen: 6, ab: 'abgabe' }, { titel: '8 Wochen nach Abgabe', wochen: 8, ab: 'abgabe' }], kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'zuschlag', spalte: true, titel: 'Zuschlag erteilt am', art: 'datum', kartenBreite: 3, gruppe: 'Ausschreibung' },
    { name: 'nebenangebote', titel: 'Nebenangebote zugelassen', art: 'ja_nein', erbt: true, kartenBreite: 3, gruppe: 'Ausschreibung' },
    // Angebotsaufforderung: Deckblatt des LV
    { name: 'aufforderung', titel: 'Text der Angebotsaufforderung', art: 'auswahl', optionen: AUFFORDERUNGEN, eigeneWerte: true, erbt: true, gruppe: 'Angebotsaufforderung' },
    { name: 'austauschformat', titel: 'Austauschformat', art: 'auswahl', optionen: AUSTAUSCHFORMATE, eigeneWerte: true, erbt: true, gruppe: 'Angebotsaufforderung' },
    { name: 'vereinbarungen', titel: 'Sonstige Vereinbarungen', art: 'mehrfach', optionen: VEREINBARUNGEN, erbt: true, gruppe: 'Angebotsaufforderung' },
    { name: 'vereinbarungen_weitere', titel: 'Weitere Vereinbarungen (je Zeile eine)', art: 'langtext', erbt: true, gruppe: 'Angebotsaufforderung' },
    // Vertragsbedingungen (wie im bisherigen Bauportal: Zahlen, mit denen die Rechnungen rechnen – Protokoll und Vertrag nehmen den Text daraus)
    { name: 'vertragsart', spalte: true, titel: 'Vertrag nach', art: 'auswahl', optionen: VERTRAGSARTEN, erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 've_prozent', titel: 'Sicherheit Vertragserfüllung in %', art: 'zahl', erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 've_form', titel: 'als', art: 'auswahl', optionen: SICHERHEITSFORMEN, erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'ma_prozent', titel: 'Sicherheit Mängelansprüche in %', art: 'zahl', erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'ma_form', titel: 'als', art: 'auswahl', optionen: SICHERHEITSFORMEN, erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'ma_abloesbar', titel: 'Einbehalt ablösbar gegen Bürgschaft', art: 'ja_nein', erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'gewaehrleistung_jahre', titel: 'Mängelansprüche verjähren nach Jahren', art: 'zahl', erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'strafe_prozent', titel: 'Vertragsstrafe in % je Tag', art: 'zahl', erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'strafe_tagart', titel: 'je', art: 'auswahl', optionen: TAGARTEN, erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'strafe_max', titel: 'höchstens in %', art: 'zahl', erbt: true, kartenBreite: 2, gruppe: 'Vertragsbedingungen' },
    { name: 'vb_rechnungsstellung', titel: 'Rechnungsstellung', art: 'auswahl', optionen: RECHNUNGSSTELLUNG, eigeneWerte: true, erbt: true, gruppe: 'Vertragsbedingungen' },
    { name: 'vb_zahlungsfrist', titel: 'Zahlungsfrist', art: 'auswahl', optionen: ZAHLUNGSFRISTEN, eigeneWerte: true, erbt: true, gruppe: 'Vertragsbedingungen' },
    { name: 'vb_nachweise', titel: 'Nachweise', art: 'auswahl', optionen: NACHWEISE, eigeneWerte: true, erbt: true, gruppe: 'Vertragsbedingungen' },
    { name: 'vb_nachunternehmer', titel: 'Nachunternehmer', art: 'auswahl', optionen: NACHUNTERNEHMER, eigeneWerte: true, erbt: true, gruppe: 'Vertragsbedingungen' },
    { name: 'vb_energie', titel: 'Energie- / Medienkosten', art: 'auswahl', optionen: ENERGIE, eigeneWerte: true, erbt: true, gruppe: 'Vertragsbedingungen' },
    { name: 'bauabzug', titel: 'Bauabzugsteuer einbehalten (§ 48 EStG)', art: 'ja_nein', kartenBreite: 3, gruppe: 'Vertragsbedingungen' },
    { name: 'freistellung_bis', titel: 'Freistellungsbescheinigung gültig bis', art: 'datum', kartenBreite: 3, gruppe: 'Vertragsbedingungen' },
    // Ausführung
    { name: 'ausfuehrung_beginn', spalte: true, titel: 'Ausführungsbeginn', art: 'datum', kartenBreite: 3, gruppe: 'Ausführung' },
    { name: 'ausfuehrung_ende', spalte: true, titel: 'Fertigstellung der Leistung', art: 'datum', kartenBreite: 3, gruppe: 'Ausführung' },
    // Sicherheiten im Lauf des Auftrags (wie im bisherigen Bauportal): Bürgschaft eingegangen = kein Einbehalt mehr; Abnahme → Ende der Verjährung
    { name: 've_eingang', titel: 'Bürgschaft Vertragserfüllung eingegangen am', art: 'datum', kartenBreite: 3, gruppe: 'Sicherheiten', wenn: { ve_form: ['buergschaft'] } },
    { name: 've_rueckgabe', titel: 'zurückgegeben am', art: 'datum', kartenBreite: 3, gruppe: 'Sicherheiten', wenn: { ve_form: ['buergschaft'] } },
    { name: 'abnahme', spalte: true, titel: 'Abnahme am', art: 'datum', kartenBreite: 3, gruppe: 'Sicherheiten' },
    { name: 'ma_eingang', titel: 'Bürgschaft Mängelansprüche eingegangen am', art: 'datum', kartenBreite: 3, gruppe: 'Sicherheiten', wenn: { ma_form: ['buergschaft'] } },
    { name: 'ma_rueckgabe', titel: 'zurückgegeben am', art: 'datum', kartenBreite: 3, gruppe: 'Sicherheiten', wenn: { ma_form: ['buergschaft'] } },
    { name: 'vorbemerkungen', titel: 'Vorbemerkungen', art: 'langtext', gruppe: 'Vorbemerkungen' },   // stehen vor den Positionen (LV bearbeiten: „Vorbemerkungen“)
    { name: 'oz_maske', titel: 'OZ-Maske', art: 'text', verborgen: true },   // „2.2.2.2:4:10“ = Stellen je Titelebene : Stellen der Position : Schritt (Nummerieren)
    { name: 'notiz', titel: 'Bemerkung', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

export const POSITIONSARTEN = [
  { wert: 'titel', titel: 'Titel' }, { wert: 'normal', titel: 'Position' }, { wert: 'bedarf', titel: 'Bedarfsposition (ohne GP)' },
  { wert: 'alternativ', titel: 'Alternativposition (ohne GP)' }, { wert: 'pauschal', titel: 'Pauschal' }, { wert: 'stundenlohn', titel: 'Stundenlohn' },
  { wert: 'hinweis', titel: 'Hinweistext' }, { wert: 'vorbemerkung', titel: 'Vorbemerkung' },
  { wert: 'zuschlag', titel: 'Zuschlag (% auf Positionen)' },
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
    { name: 'langtext', titel: 'Langtext', art: 'langtext', gruppe: 'Position', ki: { aufgaben: ['langtext_mittel', 'langtext_kurz', 'langtext_lang'], aus: ['kurztext', 'einheit'] } },
    { name: 'kostengruppe', titel: 'Kostengruppe (DIN 276, leer: wie das LV)', art: 'verweis', ziel: 'kostengruppe', spalte: true, breite: 200, kartenBreite: 6, gruppe: 'Position' },
    { name: 'menge', titel: 'Menge', art: 'zahl', einheit: 'einheit', inListe: true, breite: 90, kartenBreite: 2, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'einheit', titel: 'Einheit', art: 'text', vorschlagen: true, inListe: true, breite: 70, kartenBreite: 1, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'ep', titel: 'EP geschätzt in € (Zuschlag: Satz in %)', art: 'zahl', inListe: true, breite: 110, kartenBreite: 3, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn', 'zuschlag'] } },
    { name: 'mengen_rechenweg', titel: 'Rechenweg der Menge (z. B. 2 × 12,40 × 2,75 – 3 × 1,01 × 2,13)', art: 'text', kartenBreite: 6, gruppe: 'Menge und Preis', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'mit_gp', titel: 'Mit Gesamtpreis (zählt in die Summe)', art: 'ja_nein', spalte: true, kartenBreite: 6, gruppe: 'Menge und Preis', wenn: { art: ['bedarf'] } },
    // Weiteres (wie bisher Reiter „Weiteres“ der Eigenschaften)
    { name: 'entfaellt', titel: 'Position entfällt', art: 'ja_nein', spalte: true, kartenBreite: 3, gruppe: 'Weiteres', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn', 'zuschlag'] } },
    { name: 'schwerpunkt', titel: 'Schwerpunktposition ([S] im Ausdruck)', art: 'ja_nein', spalte: true, kurz: 'S', kartenBreite: 3, gruppe: 'Weiteres', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'leistungsbereich', titel: 'Leistungsbereich (leer: wie das LV)', art: 'verweis', ziel: 'gewerk', spalte: true, breite: 200, kartenBreite: 4, gruppe: 'Weiteres' },
    { name: 'kg_1981', titel: 'KG DIN 276 (1981)', art: 'text', spalte: true, breite: 80, kartenBreite: 2, gruppe: 'Weiteres' },
    { name: 'bezug', titel: 'Bezug auf Position', art: 'verweis', ziel: 'lv_position', gleich: ['lv'], kartenBreite: 6, gruppe: 'Weiteres', wenn: { art: ['normal', 'bedarf', 'alternativ', 'pauschal', 'stundenlohn'] } },
    { name: 'neue_seite_vor', titel: 'Neue Seite vorher', art: 'ja_nein', kartenBreite: 3, gruppe: 'Druck' },
    { name: 'neue_seite_nach', titel: 'Neue Seite nachher', art: 'ja_nein', kartenBreite: 3, gruppe: 'Druck' },
    { name: 'zuschlag_auf', titel: 'Zuschlag auf (Positionen)', art: 'text', verborgen: true },   // Kennungen „a,b,c“ – gewählt an der Karte (kern/lvarten.ts)
    { name: 'nachtrag', titel: 'Nachtrag', art: 'verweis', ziel: 'nachtrag', inListe: true, breite: 160, gruppe: 'Position' },   // leer: Position der Ausschreibung; mit Nachtrag: erst nach der Vergabe, nicht im Preisspiegel
    { name: 'quelle', titel: 'Aus Liste oder Modell', art: 'text', verborgen: true },   // Schlüssel „Quelle|Gruppe|…“ (module/ava/lvplan.ts) – hält LV und Quelle abgleichbar
    { name: 'reihe', titel: 'Reihenfolge', art: 'zahl', verborgen: true },
    { name: 'kennung', titel: 'Kennung (GAEB)', art: 'text', verborgen: true },
  ],
};

// Telefonnotiz zu einer Bieter:in (wie bisher höchstens 10 je Firma): wann, wer, was – „📞 angerufen“ legt eine mit jetzt an
export const telefonnotiz: ObjektModell = {
  name: 'telefonnotiz', titel: 'Telefonnotiz', titelMehrzahl: 'Telefonnotizen', anzeigeFeld: 'text', sortierFeld: 'zeit',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'angebot', titel: 'Bieter:in (Angebot)', art: 'verweis', ziel: 'angebot', pflicht: true, inListe: true, breite: 220 },
    { name: 'zeit', titel: 'Zeit', art: 'text', inListe: true, breite: 130 },   // JJJJ-MM-TTThh:mm – sortiert richtig
    { name: 'wer', titel: 'Wer', art: 'text', inListe: true, breite: 140 },
    { name: 'text', titel: 'Notiz', art: 'text', pflicht: true, inListe: true, breite: 320 },
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
    // wie die Liste ins LV geht (bisher im Fenster „Ins LV übernehmen“) – an der Liste gemerkt, damit ein späterer Abgleich dieselben Regeln nimmt
    { name: 'lv_text', titel: 'Textform', art: 'auswahl', alsListe: true, gruppe: 'Ins LV', optionen: [
      { wert: '', titel: 'Systembeschreibung je Titel + Positionen „… gemäß vorangegangener Systembeschreibung“' }, { wert: 'lang', titel: 'ausführlicher Langtext je Position' }] },
    { name: 'din_zusammen', titel: 'Links und rechts angeschlagene zusammen (eine Position)', art: 'ja_nein', gruppe: 'Ins LV' },
    { name: 'obertitel', titel: 'Obertitel (leer: Titel Fenster / Außentüren / Innentüren direkt)', art: 'text', gruppe: 'Ins LV' },
  ],
};
const tw = (name: string, titel: string, gruppe: string, breite = 110, inListe = false) => ({ name, titel, art: 'auswahl' as const, optionen: TUER_WERTE[name]!, eigeneWerte: true, inListe, spalte: true, breite, gruppe });   // in der Türliste ist jedes Merkmal eine Spalte (wie bisher)
export const tuer: ObjektModell = {
  name: 'tuer', titel: 'Tür / Fenster', titelMehrzahl: 'Türen und Fenster', anzeigeFeld: 'nr', ersatzName: ['raumname', 'art'], sortierFeld: 'nr',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'liste', titel: 'Liste', art: 'verweis', ziel: 'tuerliste', pflicht: true, breite: 180 },
    { name: 'nr', kurz: 'Nr.', titel: 'Einbaupos. / Tür-Nr.', art: 'text', inListe: true, breite: 110, kartenBreite: 2, gruppe: 'Lage' },
    { name: 'geschoss', kurz: 'Geschoss', titel: 'Geschoss', art: 'text', vorschlagen: true, inListe: true, breite: 80, kartenBreite: 1, gruppe: 'Lage' },
    { name: 'raum', kurz: 'Raum-Nr.', spalte: true, titel: 'Raum-Nr.', art: 'text', inListe: false, breite: 80, kartenBreite: 1, gruppe: 'Lage' },
    { name: 'raumname', kurz: 'Raum', titel: 'Raum', art: 'text', vorschlagen: true, inListe: true, breite: 140, kartenBreite: 2, gruppe: 'Lage' },
    { name: 'zu', kurz: 'zu Raum', titel: 'zu Raum', art: 'text', inListe: false, breite: 100, gruppe: 'Lage' },
    { name: 'typ', titel: 'Typ', art: 'text', vorschlagen: true, inListe: true, breite: 60, kartenBreite: 1, gruppe: 'Element' },
    { name: 'anzahl', kurz: 'Anz.', titel: 'Anzahl', art: 'zahl', inListe: true, breite: 60, kartenBreite: 1, gruppe: 'Element' },
    tw('art', 'Art', 'Element', 130, true), tw('flg', 'Flügel', 'Element', 90), { ...tw('din', 'Öffnungsrichtung (DIN)', 'Element', 80, true), kurz: 'DIN' },
    { name: 'b', kurz: 'Breite', titel: 'Breite (m oder mm)', art: 'zahl', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { name: 'h', kurz: 'Höhe', titel: 'Höhe (m oder mm)', art: 'zahl', inListe: true, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { name: 'wand', kurz: 'Wand', titel: 'Wanddicke', art: 'zahl', inListe: false, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { name: 'bruestung', kurz: 'Brüstung', titel: 'Brüstungshöhe', art: 'zahl', inListe: false, breite: 80, kartenBreite: 2, gruppe: 'Maße' },
    { ...tw('oeffnung', 'Öffnungsart', 'Fenster', 110, false), kurz: 'Öffnung' }, { ...tw('fb_innen', 'Innenfensterbank', 'Fenster', 120, false), kurz: 'Fensterbank innen' }, { ...tw('fb_aussen', 'Außenfensterbank', 'Fenster', 120, false), kurz: 'Fensterbank außen' }, tw('rollo', 'Rollo', 'Fenster', 90, false),
    tw('zarge', 'Zarge', 'Ausführung', 150), tw('blatt', 'Türblatt', 'Ausführung', 130), { ...tw('oberfl', 'Oberfläche', 'Ausführung', 110), kurz: 'Oberfläche' },
    { name: 'farbe', kurz: 'Farbe/RAL', titel: 'Farbe / RAL', art: 'text', vorschlagen: true, inListe: false, breite: 90, gruppe: 'Ausführung' }, tw('glas', 'Verglasung', 'Ausführung', 110, false),
    { ...tw('brand', 'Brandschutz', 'Anforderungen', 90, true), kurz: 'Brand' }, { ...tw('schall', 'Schallschutz', 'Anforderungen', 90, false), kurz: 'Schall' }, { ...tw('rc', 'Einbruch (RC)', 'Anforderungen', 70, false), kurz: 'RC' }, { ...tw('klima', 'Klimaklasse', 'Anforderungen', 70, false), kurz: 'Klima' },
    tw('schloss', 'Schloss', 'Beschlag', 80), tw('beschlag', 'Beschlag', 'Beschlag', 150, false),
    { name: 'ausstattung', titel: 'Ausstattung', art: 'mehrfach', optionen: AUSSTATTUNG, inListe: false, breite: 200, gruppe: 'Ausstattung' },
    { name: 'bem', titel: 'Bemerkung', art: 'text', inListe: true, breite: 180, gruppe: 'Hinweis' },
    { name: 'bauteil', titel: 'Bauteil im Gebäudemodell', art: 'verweis', ziel: 'bauteil', gruppe: 'Herkunft' },
  ],
};

export const angebot: ObjektModell = {
  name: 'angebot', titel: 'Angebot', titelMehrzahl: 'Angebote', anzeigeFeld: 'bieter',
  projektFeld: 'projekt', rechte,
  erben: { praefix: '', ebenen: [{ objekt: 'lv', ueber: 'lv', titel: 'aus dem LV' }] },   // gebunden bis ← Zuschlags- und Bindefrist des LV
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true, inListe: true, breite: 220, gruppe: 'Angebot' },
    { name: 'bieter', titel: 'Bieter:in', art: 'verweis', ziel: 'kontakt', pflicht: true, inListe: true, breite: 220, gruppe: 'Angebot' },
    { name: 'angeschrieben', spalte: true, titel: 'Angeschrieben am', art: 'datum', gruppe: 'Versand' },
    { name: 'rueckmeldung', titel: 'Rückmeldung', art: 'auswahl', optionen: RUECKMELDUNGEN, inListe: true, breite: 140, gruppe: 'Versand' },
    { name: 'zusage_bis', spalte: true, titel: 'Abgabe zugesagt bis', art: 'datum', kartenBreite: 3, gruppe: 'Versand', wenn: { rueckmeldung: ['will_abgeben'] } },
    { name: 'absage_grund', titel: 'Grund der Absage', art: 'text', vorschlagen: true, kartenBreite: 3, gruppe: 'Versand', wenn: { rueckmeldung: ['gibt_nicht_ab'] } },
    // An wen die Mails gehen (wie bisher je Firma aufklappbar): leer = die E-Mail-Adresse der Firma und die Anrede aus den Adressen
    { name: 'an_email', titel: 'E-Mail an', art: 'email', kartenBreite: 3, gruppe: 'Versand' },
    { name: 'anrede', titel: 'Anrede (nur für diese Firma)', art: 'text', kartenBreite: 3, gruppe: 'Versand' },
    { name: 'nachfassen', spalte: true, titel: 'Nachfassen am (Anruf)', art: 'datum', gruppe: 'Versand' },
    { name: 'eingang', titel: 'Angebot eingegangen am', art: 'datum', inListe: true, breite: 110, gruppe: 'Angebot' },
    // Angaben zum Angebot (wie bisher ⓘ je Spalte im Preisspiegel)
    { name: 'nummer', spalte: true, titel: 'Angebotsnummer', art: 'text', kartenBreite: 3, gruppe: 'Angebot' },
    { name: 'angebot_vom', spalte: true, titel: 'Angebot vom', art: 'datum', kartenBreite: 3, gruppe: 'Angebot' },
    { name: 'bindefrist', spalte: true, titel: 'gebunden bis', art: 'datum', erbt: true, kartenBreite: 3, gruppe: 'Angebot' },   // leer: Zuschlags- und Bindefrist des LV
    { name: 'ansprechpartner', titel: 'Ansprechpartner:in', art: 'text', vorschlagen: true, kartenBreite: 3, gruppe: 'Angebot' },
    { name: 'nebenangebote', titel: 'enthält Nebenangebote', art: 'ja_nein', kartenBreite: 3, gruppe: 'Angebot' },
    { name: 'rechnerisch_geprueft', titel: 'rechnerisch geprüft', art: 'ja_nein', kartenBreite: 3, gruppe: 'Angebot' },
    { name: 'vorbehalte', titel: 'Vorbehalte / Abweichungen', art: 'langtext', gruppe: 'Angebot' },
    { name: 'nachlass', titel: 'Nachlass in %', art: 'zahl', inListe: true, breite: 100, kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'nachlass_eur', titel: 'und/oder Nachlass in €', art: 'zahl', spalte: true, kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'skonto', spalte: true, titel: 'Skonto in %', art: 'zahl', kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'skonto_tage', titel: 'Skonto binnen', art: 'zahl', kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'skonto_art', titel: 'gezählt in', art: 'auswahl', optionen: FRISTARTEN, kartenBreite: 2, gruppe: 'Konditionen' },
    { name: 'ausgeschlossen', titel: 'Ausgeschlossen (nicht gewertet)', art: 'ja_nein', gruppe: 'Wertung' },
    { name: 'beauftragt', titel: 'Beauftragt', art: 'ja_nein', inListe: true, breite: 100, gruppe: 'Wertung' },
    { name: 'auftragsdatum', spalte: true, titel: 'Auftrag vom', art: 'datum', gruppe: 'Wertung' },
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
    { name: 'angaben', titel: 'Angaben der Bieter:in (Fabrikat, Typ …)', art: 'text' },   // aus den Bietertextergänzungen des X84
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
    { name: 'angemeldet', spalte: true, titel: 'angemeldet am', art: 'datum', gruppe: 'Termine' },
    { name: 'angebot_vom', spalte: true, titel: 'Angebot vom', art: 'datum', gruppe: 'Termine' },
    { name: 'beauftragt_am', spalte: true, titel: 'beauftragt am', art: 'datum', gruppe: 'Termine' },
    { name: 'betrag', spalte: true, titel: 'Betrag netto in € (ohne Positionen)', art: 'zahl', gruppe: 'Betrag' },   // nur ohne Positionen (Pauschale)
    { name: 'begruendung', titel: 'Begründung', art: 'langtext', gruppe: 'Notiz' },
  ],
};

/** Aufmaß je Position (kumuliert, wie im bisherigen Bauportal): Menge laut Firma und der eigene Rechenweg; geprüft ist die Summe des Rechenwegs. */
// Aufmaß: je Eintrag eine Rechenzeile einer Position (module/ava/aufmass.ts) – ohne Rechnung „laufend“, beim Abschluss der Prüfung
// bekommt sie die Rechnung und steht fest. Rechenweg ohne Zeichen = Stand (basis: Stand davor), mit „+“ = Zuwachs.
export const aufmass: ObjektModell = {
  name: 'aufmass', titel: 'Aufmaßzeile', titelMehrzahl: 'Aufmaß', anzeigeFeld: 'rechenweg', sortierFeld: 'datum',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'lv', titel: 'Leistungsverzeichnis', art: 'verweis', ziel: 'lv', pflicht: true },
    { name: 'position', titel: 'Position', art: 'verweis', ziel: 'lv_position', pflicht: true, inListe: true, breite: 220 },
    { name: 'rechnung', titel: 'Rechnung (leer: laufend)', art: 'verweis', ziel: 'rechnung', inListe: true, breite: 160 },
    { name: 'datum', titel: 'Datum', art: 'text', inListe: true, breite: 100, kartenBreite: 2 },
    { name: 'ort', titel: 'Ort / Bauteil', art: 'text', inListe: true, breite: 160, kartenBreite: 4 },
    { name: 'rechenweg', titel: 'Rechenweg (Stand, oder „+ …“ als Zuwachs)', art: 'text', pflicht: true, inListe: true, breite: 240 },
    { name: 'basis', titel: 'Stand davor', art: 'zahl', verborgen: true },
    { name: 'quelle', titel: 'Herkunft', art: 'auswahl', optionen: [{ wert: 'eigen', titel: 'eigenes Aufmaß' }, { wert: 'firma', titel: 'lt. Firma übernommen' }], spalte: true, breite: 130 },
  ],
};

/** Menge laut Firma je Rechnung und Position (aus ihrer Rechnung, ihrem Aufmaß oder von Hand) – Vergleich in der Aufmaßprüfung. */
export const rechnungsmenge: ObjektModell = {
  name: 'rechnungsmenge', titel: 'Menge laut Firma', titelMehrzahl: 'Mengen laut Firma', anzeigeFeld: 'menge',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'rechnung', titel: 'Rechnung', art: 'verweis', ziel: 'rechnung', pflicht: true, inListe: true, breite: 160 },
    { name: 'position', titel: 'Position', art: 'verweis', ziel: 'lv_position', pflicht: true, inListe: true, breite: 220 },
    { name: 'menge', titel: 'Menge (Stand) laut Firma', art: 'zahl', inListe: true, breite: 120 },
  ],
};

export const RECHNUNGSARTEN = [{ wert: 'abschlag', titel: 'Abschlagsrechnung' }, { wert: 'schluss', titel: 'Schlussrechnung' }, { wert: 'nachtrag', titel: 'Nachtrag' }, { wert: 'stundenlohn', titel: 'Stundenlohnrechnung' }, { wert: 'einzel', titel: 'Einzelrechnung (ohne LV)' }];

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
    { name: 'eingang', spalte: true, titel: 'Eingang', art: 'datum', gruppe: 'Rechnung' },
    { name: 'betrag', titel: 'Leistungsstand netto, angefordert (kumuliert) in €', art: 'zahl', inListe: true, breite: 140, gruppe: 'Beträge' },
    { name: 'geprueft', titel: 'Leistungsstand netto, geprüft (kumuliert) in €', art: 'zahl', inListe: true, breite: 140, gruppe: 'Beträge' },
    { name: 'einbehalt', titel: 'Sicherheitseinbehalt in % (leer: wie im LV vereinbart)', art: 'zahl', gruppe: 'Beträge' },
    { name: 'abnahme', titel: 'Abnahme am', art: 'datum', gruppe: 'Beträge', wenn: { art: ['schluss'] } },
    { name: 'strafe', titel: 'Vertragsstrafe in €', art: 'zahl', gruppe: 'Beträge', wenn: { art: ['schluss'] } },
    // wie geprüft wird (bisher „Wie prüfen?“): nach Aufmaß (Mengen je Position, kumuliert) oder ohne – dann zählt der geprüfte Betrag
    // bzw. die Zeilen von Hand („rechnungszeile“); Stundenlohnrechnungen immer mit Zeilen (Stundenzettel)
    { name: 'pruefweg', titel: 'Prüfen', art: 'auswahl', optionen: [{ wert: 'aufmass', titel: 'nach Aufmaß' }, { wert: 'ohne', titel: 'ohne Aufmaß (Betrag oder Positionen von Hand)' }], spalte: true, breite: 130, gruppe: 'Prüfung', wenn: { art: ['abschlag', 'schluss', 'nachtrag'] } },
    { name: 'status', titel: 'Stand', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Prüfung', optionen: [{ wert: 'offen', titel: 'offen' }, { wert: 'geprueft', titel: 'geprüft' }, { wert: 'bezahlt', titel: 'bezahlt' }] },
    { name: 'geprueft_am', spalte: true, titel: 'Geprüft am', art: 'datum', gruppe: 'Prüfung' },
    // frei festgesetzter Zahlbetrag (bisher „abweichender Zahlbetrag mit Begründung“): steht in der Rechenleiter, im Prüfblatt und in der Freigabe
    { name: 'zahlbetrag_hand', spalte: true, titel: 'Zahlbetrag netto, frei festgesetzt in €', art: 'zahl', gruppe: 'Prüfung' },
    { name: 'hand_grund', titel: 'Begründung des freien Zahlbetrags', art: 'text', gruppe: 'Prüfung' },
    { name: 'abgelegt', spalte: true, titel: 'Geprüft abgelegt (Pfad · Zeitpunkt)', art: 'text', verborgen: true },
    { name: 'faellig', spalte: true, titel: 'Zahlung fällig am', art: 'datum', gruppe: 'Prüfung' },
    // tatsächlich gezahlt (wie im bisherigen Bauportal): weniger als freigegeben → die nächste Rechnung holt den Rest nach; Skonto gilt als bezahlt
    { name: 'bezahlt_am', spalte: true, titel: 'Bezahlt am', art: 'datum', kartenBreite: 3, gruppe: 'Zahlung' },
    { name: 'gezahlt', spalte: true, titel: 'Gezahlt brutto in €', art: 'zahl', kartenBreite: 3, gruppe: 'Zahlung' },
    { name: 'notiz', titel: 'Prüfvermerk', art: 'langtext', gruppe: 'Prüfung' },
  ],
};


/** Zeile einer Rechnung von Hand: Stundenzettel (Lohn, Gerät, Material) oder Positionen einer Rechnung ohne Aufmaß. */
export const rechnungszeile: ObjektModell = {
  name: 'rechnungszeile', titel: 'Rechnungszeile', titelMehrzahl: 'Rechnungszeilen', anzeigeFeld: 'text',
  projektFeld: 'projekt', rechte,
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'rechnung', titel: 'Rechnung', art: 'verweis', ziel: 'rechnung', pflicht: true, inListe: true, breite: 160 },
    { name: 'text', titel: 'Leistung', art: 'text', inListe: true, breite: 260 },
    { name: 'menge', titel: 'Menge', art: 'zahl', inListe: true, breite: 90 },
    { name: 'einheit', titel: 'EH', art: 'text', inListe: true, breite: 60 },
    { name: 'ep', titel: 'EP / Satz in €', art: 'zahl', inListe: true, breite: 100 },
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
    { name: 'uhrzeit', spalte: true, titel: 'Uhrzeit', art: 'text', kartenBreite: 1, gruppe: 'Besprechung' },
    { name: 'ort', spalte: true, titel: 'Ort', art: 'text', vorschlagen: true, kartenBreite: 3, gruppe: 'Besprechung' },
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
    { name: 'nachtrag_vom', titel: 'Nachtrag vom', art: 'text', kartenBreite: 2, gruppe: 'Angebot' },
    { name: 'gewerke', titel: 'Gewerke', art: 'text', kartenBreite: 2, gruppe: 'Angebot' },
    { name: 'nachlass', titel: 'Nachlass', art: 'text', kartenBreite: 2, gruppe: 'Angebot' },
    { name: 'skonto', titel: 'Skonto', art: 'text', kartenBreite: 4, gruppe: 'Angebot' },
    { name: 'preis', titel: 'Preis', art: 'langtext', gruppe: 'Angebot' },
    { name: 'klaerung', titel: 'Klärungen zum Angebot', art: 'langtext', gruppe: 'Angebot' },
    { name: 'beginn', titel: 'Beginn', art: 'text', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'fertig', titel: 'Fertigstellung', art: 'text', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'unterbrechung', titel: 'Unterbrechung', art: 'text', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'bauzeitenplan', titel: 'Bauzeitenplan', art: 'text', gruppe: 'Termine' },
    ...GRUNDLAGEN.map(([name, titel]): ObjektModell['felder'][number] => ({ name, titel, art: 'text', gruppe: 'Vertragsgrundlagen' })),
    { name: 'sonstiges', titel: 'Sonstiges', art: 'langtext', gruppe: 'Sonstiges' },
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
  handy: 'eigen',   // eigene Handyansicht (nur ansehen): LVs, Aufträge, Aufmaß, Rechnungen
  kacheln: [{ ansicht: 'nachverfolgen', titel: 'Nachverfolgen', beschreibung: 'Bieter:innen anrufen und erinnern – alle verschickten LVs', zeichen: 'telefon' }],   // wie bisher eigene Kachel (Entscheidung 28.11.2026: kein eigenes Recht)
  zeichen: 'ausschreibung',
  farbe: '#f08c00',
  name: 'Ausschreibung',
  version: '0.1.0',
  beschreibung: 'Leistungsverzeichnisse je Projekt, Angebote mit Preisspiegel und Vergabe, Rechnungen je Auftrag.',
  braucht: ['projekte', 'adressen', 'kataloge'],
  objekte: [lv, lvPosition, tuerliste, tuer, angebot, angebotPreis, telefonnotiz, nachtrag, aufmass, rechnungsmenge, rechnung, rechnungszeile, besprechung, bauvertrag],
  // Ausschreibungsdaten in drei Ebenen (wie bisher): am Projekt für alle seine LVs, im Büro als Vorgabe – das LV erbt (kern/erben.ts)
  ergaenzt: [
    { objekt: 'projekt', felder: vorgabeFelder(lv, 'Ausschreibung (alle LVs)'), eingeklappt: ['Ausschreibung (alle LVs)'], erben: { praefix: '', ebenen: [{ objekt: 'buero', titel: 'vom Büro' }] } },
    { objekt: 'buero', felder: [...vorgabeFelder(lv, 'Vorgaben für Ausschreibungen'),
      // Grundlagen der Angebotsbesprechung als Vorgabe des Büros (wie bisher „als Vorgabe des Büros merken“) – leer: ab Werk
      ...GRUNDLAGEN.map(([n, t]): ObjektModell['felder'][number] => ({ name: `bv_${n}`, titel: t, art: 'text', gruppe: 'Vorgaben für Angebotsbesprechungen' }))],
      eingeklappt: ['Vorgaben für Ausschreibungen', 'Vorgaben für Angebotsbesprechungen'] },
  ],
  // Ins Fenster ziehen (PDF, Scan, Foto): vorbelegt nach der Seite, auf der man steht – erkannt am Text
  dokumentarten: [
    { art: 'angebot', titel: 'Angebot', objekt: 'angebot', ansichten: ['angebote', 'preisspiegel', 'versand', 'nachverfolgen', 'besprechungen'], rolle: 'angebote',
      merkmale: ['\\bangebot\\b', 'angebotsnummer', 'angebot\\s*nr', 'unser angebot', 'bindefrist', 'angebotssumme'], nummerWort: 'angebot',
      felder: { lv: 'lv', firma: 'bieter', eingang: 'eingang' }, vorhanden: ['lv', 'bieter'], vorgaben: { rueckmeldung: 'angebot' } },
    { art: 'rechnung', titel: 'Abschlagsrechnung', objekt: 'rechnung', ansichten: ['rechnungen', 'aufmass', 'auftraege'], rolle: 'rechnungspruefung',
      merkmale: ['abschlagsrechnung', 'teilrechnung', '\\brechnung\\b', 'rechnungsnummer', 'rechnung\\s*nr', 'rechnungsdatum', 'zahlbar bis'], nummerWort: 'rechnung',
      felder: { lv: 'lv', firma: 'firma', nummer: 'nummer', datum: 'datum', betrag: 'betrag', eingang: 'eingang' }, vorgaben: { art: 'abschlag', status: 'offen' } },
    { art: 'schlussrechnung', titel: 'Schlussrechnung', objekt: 'rechnung', rolle: 'rechnungspruefung',
      merkmale: ['schlussrechnung', 'rechnungsnummer', 'rechnung\\s*nr', 'rechnungsdatum', 'zahlbar bis', 'schlusszahlung'], nummerWort: 'rechnung',
      felder: { lv: 'lv', firma: 'firma', nummer: 'nummer', datum: 'datum', betrag: 'betrag', eingang: 'eingang' }, vorgaben: { art: 'schluss', status: 'offen' } },
    { art: 'nachtragsangebot', titel: 'Nachtragsangebot', objekt: 'nachtrag', ansichten: ['nachtraege'], rolle: 'nachtraege',
      merkmale: ['nachtragsangebot', 'nachtrag\\s*nr', 'nachtragsnummer', 'mehrkosten', 'zusätzliche leistung'], nummerWort: 'nachtrag',
      felder: { lv: 'lv', nummer: 'nummer', datum: 'angebot_vom', betrag: 'betrag' }, vorgaben: { stand: 'angeboten', name: 'Nachtragsangebot' } },
    { art: 'aufmass', titel: 'Aufmaß der Firma', rolle: 'rechnungspruefung', merkmale: ['aufmaß', 'aufmass', 'massenermittlung', 'mengenermittlung'] },
    { art: 'buergschaft', titel: 'Bürgschaft', rolle: 'vertraege', merkmale: ['bürgschaft', 'bürgin', 'bürge\\b', 'gewährleistungsbürgschaft', 'vertragserfüllungsbürgschaft'] },
    // neu aus dem Projektordner A481 (Entscheidung E2, 27.11.2026) – nur ablegen, die Rolle sagt wohin
    { art: 'stundenlohn', titel: 'Stundenlohnbericht', rolle: 'rechnungspruefung', ansichten: ['aufmass'], merkmale: ['stundenlohn', 'tagelohn', 'regiearbeit', 'regiestunden', 'stundenzettel'] },
    { art: 'lieferschein', titel: 'Lieferschein', rolle: 'rechnungspruefung', merkmale: ['lieferschein', 'lieferscheinnummer', 'warenempfang', 'geliefert'] },
    { art: 'honorar', titel: 'Honorarrechnung Fachplaner', rolle: 'rechnungspruefung', merkmale: ['honorarrechnung', '\\bhonorar', '\\bhoai\\b', 'leistungsphase'] },
    { art: 'abnahme', titel: 'Abnahmeniederschrift', rolle: 'abnahmen', merkmale: ['abnahme', 'abnahmeniederschrift', 'technische abnahme', 'abnahmeprotokoll', 'gewährleistung'] },
    { art: 'fachunternehmer', titel: 'Fachunternehmer- / Brandschutzbescheinigung', rolle: 'brandschutz',
      merkmale: ['fachunternehmerbescheinigung', 'übereinstimmungserklärung', 'übereinstimmungsbestätigung', 'brandschutz', 'feuerschutz', 'rauchschutz'] },
    { art: 'bauvertrag', titel: 'Auftrag / Bauvertrag (unterschrieben)', rolle: 'vertraege', merkmale: ['auftragsbestätigung', 'bauvertrag', 'auftragsschreiben', 'unterschrift', 'vertragsbestandteil'] },
    { art: 'kva', titel: 'Kostenvoranschlag', rolle: 'angebote', merkmale: ['kostenvoranschlag', '\\bkva\\b', 'unverbindlich'] },
    { art: 'lvbild', titel: 'Foto / Skizze zur Position', rolle: 'lv', merkmale: [] },
    { art: 'unterlage', titel: 'Unterlage für die Bieter:innen', rolle: 'ausschreibung', merkmale: [] },   // nur über „Versand & Rücklauf → Unterlagen“   // nur über die Karte einer Position (im LV-Ausdruck unter dem Langtext)
    { art: 'lv', titel: 'Leistungsverzeichnis', rolle: 'lv', ansichten: ['lvs', 'positionen'], merkmale: ['leistungsverzeichnis', 'leistungsbeschreibung', 'vorbemerkungen'] },
  ],
  ausdrucke: [{
    // Bieterliste wie bisher (Versand & Rücklauf): die Bieter:innen eines LV, Spalten frei wählbar – auch Telefon, E-Mail der Firma
    id: 'ava.bieterliste', titel: 'Bieterliste', objekt: 'angebot', verzeichnis: true, format: 'quer',
    dateiname: 'Bieterliste {filter} {datum}', fuss: '{buero} · Bieterliste vom {datum}', rolle: 'ausschreibung',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Bieterliste', unter: '{filter} · {anzahl}' },
      { id: 'liste', art: 'verzeichnis', titel: 'Bieter:innen', spalten: ['bieter', 'bieter.ansprechpartner', 'bieter.telefon', 'bieter.email', 'angeschrieben', 'rueckmeldung', 'nachfassen', 'eingang'] },
    ],
  }, {
    // Fenster- & Türliste wie bisher: die gefilterte Liste (z. B. eine Liste, ein Geschoss) als Tabelle quer – auch als Anlage zum LV
    id: 'ava.tuerliste', titel: 'Fenster- & Türliste', objekt: 'tuer', verzeichnis: true, format: 'quer',
    dateiname: 'Fenster- und Türliste {datum}', fuss: '{buero} · Fenster- & Türliste vom {datum}', rolle: 'ausschreibung',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Fenster- & Türliste', unter: '{anzahl} · {filter}' },
      { id: 'liste', art: 'verzeichnis', titel: 'Türen und Fenster', spalten: ['nr', 'geschoss', 'raum', 'raumname', 'zu', 'typ', 'anzahl', 'b', 'h', 'wand', 'bruestung', 'farbe', 'ausstattung', 'bem'] },
    ],
  }, {
    // Rechnungsfreigabe (wie im bisherigen Bauportal): Freigabe mit Zahlbetrag, dazu wählbar Prüfblatt und Massenermittlung –
    // „Im Projektordner ablegen“ legt die geprüfte Rechnung ab und vermerkt das an ihr
    id: 'ava.freigabe', titel: 'Rechnungsfreigabe', objekt: 'rechnung', vermerk: 'abgelegt',
    dateiname: '{datum} Rechnungsfreigabe {firma} Nr. {nummer} GEPRÜFT', fuss: '{buero} · Rechnungsfreigabe {nummer}', rolle: 'rechnungspruefung', ersetzen: true,
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Rechnungsfreigabe', unter: '{firma} · Rechnung Nr. {nummer}' },
      { id: 'angaben', art: 'felder', felder: ['lv', 'firma', 'art', 'nummer', 'datum', 'eingang', 'betrag', 'geprueft_am'] },
      { id: 'zahlbetrag', art: 'berechnet', quelle: 'ava.zahlbetrag', titel: 'Zahlbetrag' },
      { id: 'vermerk', art: 'text', feld: 'notiz' },
      { id: 'unterschrift', art: 'unterschriften', parteien: ['Geprüft (Bauleitung)', 'Freigegeben (Bauherr:in)'] },
      { id: 'pruefblatt', art: 'berechnet', quelle: 'ava.pruefblatt', titel: 'Prüfblatt' },
      { id: 'massen', art: 'berechnet', quelle: 'ava.massen', titel: 'Massenermittlung' },
    ],
  }, {
    // Das LV zum Versand an die Bieter:innen: Angaben zur Ausschreibung, Vorbemerkungen, Positionen mit EP/GP zum Ausfüllen,
    // Zusammenstellung, Angebotssumme und Unterschrift (einstellbar: mit den geschätzten Preisen, nur Kurztexte)
    id: 'ava.lv', titel: 'Leistungsverzeichnis', objekt: 'lv',
    dateiname: 'LV {nummer} {name}', fuss: '{buero} · Leistungsverzeichnis {nummer} {name}', rolle: 'lv',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Leistungsverzeichnis', unter: '{nummer} {name}' },
      // Deckblatt wie bisher: Angebotsaufforderung, Termine, Abgabe, Vereinbarungen (geerbt vom Projekt bzw. Büro, wo das LV nichts eigenes hat)
      { id: 'aufforderung', art: 'text', feld: 'aufforderung' },
      { id: 'angaben', art: 'felder', felder: ['vergabeart', 'vergabenummer', 'gewerk', 'abgabe', 'abgabe_zeit', 'abgabeort', 'eroeffnung', 'bindefrist', 'ausfuehrung_beginn', 'ausfuehrung_ende', 'nebenangebote', 'austauschformat'] },
      { id: 'vereinbarungen', art: 'felder', felder: ['vereinbarungen'] },
      { id: 'vereinbarungen_weitere', art: 'text', feld: 'vereinbarungen_weitere' },
      { id: 'vorbemerkungen', art: 'text', feld: 'vorbemerkungen' },
      { id: 'positionen', art: 'lv', objekt: 'lv_position', ueber: 'lv', ohne: 'nachtrag', titel: 'Leistungen', bilder: { objekt: 'dokument', bezug: 'bezug' } },
      { id: 'unterschrift', art: 'unterschriften', parteien: ['Bieter:in (Firma, Stempel, Unterschrift)'] },
      { id: 'tueren', art: 'berechnet', quelle: 'ava.tueranlage', titel: 'Anlage: Fenster- & Türliste' },   // nur, wenn Positionen aus einer Türliste stammen
    ],
  }, {
    id: 'ava.bauvertrag', titel: 'Bauvertrag', objekt: 'bauvertrag',
    dateiname: 'Bauvertrag {lv} {datum}', fuss: '{buero} · Bauvertrag {lv}', rolle: 'vertraege',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Bauvertrag', unter: '{gegenstand}' },
      { id: 'parteien', art: 'felder', felder: ['ag', 'an'] },
      { id: 'gegenstand', art: 'felder', felder: ['gegenstand'] },
      ...(['bestandteile', 'verguetung', 'termine', 'zahlung', 'sicherheiten', 'abnahme', 'weiteres'] as const).map((feld) => ({ id: feld, art: 'text' as const, feld })),
      { id: 'unterschriften', art: 'unterschriften', parteien: ['Auftraggeber:in', 'Auftragnehmer:in'] },
    ],
  }, {
    // Auftragsschreiben (wie bisher): derselbe Vertrag als kurzer Brief an die Firma – Anrede, die Regelungen ohne §, Bitte um Bestätigung
    id: 'ava.auftragsschreiben', titel: 'Auftragsschreiben', objekt: 'bauvertrag',
    dateiname: 'Auftragsschreiben {lv} {datum}', fuss: '{buero} · Auftragsschreiben {lv}', rolle: 'vertraege',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'an', art: 'felder', felder: ['an'] },
      { id: 'titel', art: 'titel', text: 'Auftragsschreiben', unter: '{gegenstand}' },
      { id: 'anrede', art: 'absatz', text: 'Sehr geehrte Damen und Herren,\n\nauf Grundlage Ihres Angebots erteilen wir Ihnen im Namen und im Auftrag der Auftraggeber:in den Auftrag über: {gegenstand}.' },
      ...([['bestandteile', 'Vertragsbestandteile'], ['verguetung', 'Vergütung'], ['termine', 'Ausführungsfristen'], ['zahlung', 'Abrechnung und Zahlung'], ['sicherheiten', 'Sicherheiten'],
        ['abnahme', 'Abnahme und Mängelansprüche'], ['weiteres', 'Weitere Vereinbarungen']] as const).map(([feld, titel]) => ({ id: feld, art: 'text' as const, feld, titel })),
      { id: 'gruss', art: 'absatz', text: 'Bitte bestätigen Sie den Auftrag durch Ihre Unterschrift und senden Sie uns ein Exemplar zurück.\n\nMit freundlichen Grüßen' },
      { id: 'unterschriften', art: 'unterschriften', parteien: ['Auftraggeber:in / Architekt:in', 'Auftragnehmer:in'] },
    ],
  }, {
    id: 'ava.besprechung', titel: 'Protokoll Angebotsbesprechung', objekt: 'besprechung',
    dateiname: 'Angebotsbesprechung {lv} {datum}', fuss: '{buero} · Angebotsbesprechung {lv} vom {datum}', rolle: 'protokolle',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Protokoll Angebotsbesprechung', unter: '{lv} · {datum}' },
      { id: 'besprechung', art: 'felder', felder: ['datum', 'uhrzeit', 'ort'] },
      { id: 'teilnehmer', art: 'text', feld: 'teilnehmer' },
      { id: 'beteiligte', art: 'felder', felder: ['bauvorhaben', 'bauherr', 'architekt', 'bieter'] },
      { id: 'bieterangaben', art: 'felder', felder: ['rechtsform', 'mitarbeiter', 'mitarbeiter_projekt', 'bauleiter', 'subunternehmer'] },
      { id: 'angebot', art: 'felder', felder: ['gueltig', 'angebot_vom', 'nachtrag_vom', 'gewerke', 'nachlass', 'skonto', 'preis'] },
      { id: 'klaerung', art: 'text', feld: 'klaerung' },
      { id: 'termine', art: 'felder', felder: ['beginn', 'fertig', 'unterbrechung', 'bauzeitenplan'] },
      { id: 'grundlagen', art: 'felder', felder: GRUNDLAGEN.map(([n]) => n) },
      { id: 'sonstiges', art: 'text', feld: 'sonstiges' },
      { id: 'ergebnis', art: 'text', feld: 'ergebnis' },
      { id: 'unterschriften', art: 'unterschriften', parteien: ['Bauleitung', 'Bieter:in'] },
    ],
  }, {
    // Blanko für die Baustelle (wie bisher): Kopf, Bieter:in, Angebot und Klärungspunkte stehen drin, die Gesprächsfelder sind Linien
    id: 'ava.besprechung_blanko', titel: 'Angebotsbesprechung blanko', objekt: 'besprechung',
    dateiname: 'Angebotsbesprechung blanko {lv}', fuss: '{buero} · Angebotsbesprechung {lv}', rolle: 'protokolle',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Protokoll Angebotsbesprechung', unter: '{lv}' },
      { id: 'besprechung', art: 'felder', felder: ['datum', 'uhrzeit', 'ort'], linien: ['datum', 'uhrzeit'] },
      { id: 'teilnehmer', art: 'text', feld: 'teilnehmer', linien: 3 },
      { id: 'beteiligte', art: 'felder', felder: ['bauvorhaben', 'bauherr', 'architekt', 'bieter'] },
      { id: 'bieterangaben', art: 'felder', felder: ['rechtsform', 'mitarbeiter', 'mitarbeiter_projekt', 'bauleiter', 'subunternehmer'], linien: ['rechtsform', 'mitarbeiter', 'mitarbeiter_projekt', 'bauleiter', 'subunternehmer'] },
      { id: 'angebot', art: 'felder', felder: ['gueltig', 'angebot_vom', 'nachtrag_vom', 'gewerke', 'nachlass', 'skonto', 'preis'], linien: ['gueltig', 'nachtrag_vom'] },
      { id: 'klaerung', art: 'text', feld: 'klaerung' },
      { id: 'termine', art: 'felder', felder: ['beginn', 'fertig', 'unterbrechung', 'bauzeitenplan'], linien: ['unterbrechung'] },
      { id: 'grundlagen', art: 'felder', felder: GRUNDLAGEN.map(([n]) => n) },
      { id: 'sonstiges', art: 'text', feld: 'sonstiges', linien: 3 },
      { id: 'ergebnis', art: 'text', feld: 'ergebnis', linien: 6 },
      { id: 'unterschriften', art: 'unterschriften', parteien: ['Bauleitung', 'Bieter:in'] },
    ],
  }],
  ansichten: [
    { id: 'lv', titel: 'Leistungsverzeichnis', abschnitt: 'Ausschreibung', zeichen: 'ausschreibung', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: Titel und Positionen als Baum. Zelle anklicken und lostippen oder doppelklicken; Enter eine Zeile tiefer, Tab zur nächsten Spalte. Art: N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext. ¶ klappt den Langtext auf. Einfg legt eine Position unter der markierten an (Alt+Einfg einen Titel), Entf löscht. „Nummerieren“ vergibt die OZ neu. Nach der Vergabe gesperrt – 🔒 schaltet frei.' },
    { id: 'tueren', titel: 'Fenster- & Türliste', abschnitt: 'Ausschreibung', zeichen: 'tuer', objekt: 'tuer', baum: ['liste', 'geschoss'], brauchtProjekt: true,
      hilfe: 'Je Tür bzw. Fenster eine Zeile – direkt in der Tabelle bearbeiten. „Aus dem Gebäudemodell“ legt die Türen und Fenster des Modells an; „Ins LV“ macht aus gleicher Ausführung eine Position (Menge = Stückzahl) mit Systembeschreibung je Gruppe und gleicht ein LV mit Positionen aus dieser Liste ab.' },
    { id: 'versand', titel: 'Versand & Rücklauf', abschnitt: 'Vergabe', zeichen: 'senden', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: die angeschriebenen Bieter:innen mit Rückmeldung (will abgeben · gibt nicht ab), Nachfassen und Eingang des Angebots; oben Fristen und Zähler, die Unterlagen (LV als GAEB X83).' },
    { id: 'nachverfolgen', titel: 'Nachverfolgen', abschnitt: 'Vergabe', zeichen: 'telefon', objekt: 'lv', brauchtProjekt: false,
      hilfe: 'Alle verschickten LVs über die Projekte (meine oder alle): fällige Anrufe, Abgaben in den nächsten drei Tagen, Rücklauf – je Firma angerufen und erinnern.' },
    { id: 'preisspiegel', titel: 'Angebote & Preisspiegel', abschnitt: 'Vergabe', zeichen: 'preisspiegel', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: die Positionen mit den Preisen aller Bieter:innen nebeneinander, das günstigste Angebot je Position markiert, unten die Summen mit Nachlass und der Rang. Preise direkt eintragen; „Vergeben an …“ beauftragt das Angebot.' },
    { id: 'besprechungen', titel: 'Angebotsbesprechung', abschnitt: 'Vergabe', zeichen: 'vertrag', objekt: 'besprechung', baum: ['lv'], brauchtProjekt: true,
      hilfe: 'Protokoll der Angebotsbesprechung je Angebot – anlegen im Preisspiegel oder an der Karte des Angebots. Jedes Feld kommt aus den Daten (Projekt, Büro, Adressen, Angebot, LV, Bauzeitenplan, Vertragsgrundlagen); solange das Protokoll ein Entwurf ist, folgt es ihnen. Von Hand Geändertes bleibt, mit Hinweis, wenn sich die Quelle ändert. Drucken als PDF.' },
    { id: 'auftraege', titel: 'Aufträge', abschnitt: 'Prüfung und Abrechnung', zeichen: 'vertrag', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein vergebenes LV wählen: Hauptauftrag und Nachträge mit Stand und Betrag, darunter Prognose (Auftrag + Nachträge) und abgerechnet. Nachtragspositionen mit EP direkt eintragen.' },
    { id: 'aufmass', titel: 'Aufmaßprüfung', abschnitt: 'Prüfung und Abrechnung', zeichen: 'aufmass', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein LV wählen: je Position Menge laut Firma und dein Rechenweg (z. B. „Wand Nord: 2,5*3,1 - 0,8*2“, je Zeile ein Ansatz). Daneben ✓ stimmt, ✗ weicht ab, ○ noch offen, und der Betrag mit dem EP des Auftrags. „Übernehmen“ setzt die Menge der Firma als Rechenweg.' },
    { id: 'rechnungen', titel: 'Rechnungen', abschnitt: 'Prüfung und Abrechnung', zeichen: 'rechnung', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Links ein vergebenes LV wählen, oben eine Rechnung: Kopf mit Prüffrist, wie geprüft wird (nach Aufmaß oder ohne), Leistung, Abzüge mit Rechenleiter und Freigabe. „Rechnung“ legt eine neue an – eine offene derselben Kette erst fertig prüfen. „Schritt für Schritt“ führt durch die Prüfung.' },
    { id: 'kostenkontrolle', titel: 'Kostenkontrolle', abschnitt: 'Kostenübersicht', zeichen: 'kosten', objekt: 'lv', brauchtProjekt: true,
      hilfe: 'Alle Vergabeeinheiten des Projekts in einer Tabelle: Schätzung, bestes Angebot, Auftrag, beauftragte Nachträge, abgerechnet, noch offen und die Abweichung zur Schätzung.' },
    { id: 'lvs', imMenue: false, titel: 'Leistungsverzeichnisse', abschnitt: 'Ausschreibung', zeichen: 'liste_aufgaben', objekt: 'lv', baum: ['status'], brauchtProjekt: true,
      hilfe: 'Je Gewerk ein Leistungsverzeichnis (Vergabeeinheit) mit Stand, Kostenansatz und Terminen. Die Positionen stehen unter „Positionen“; rechts in der Karte die Summen: geschätzt, Angebote, Auftrag, abgerechnet.' },
    { id: 'positionen', imMenue: false, titel: 'Positionen', abschnitt: 'Ausschreibung', zeichen: 'liste', objekt: 'lv_position', baum: ['lv', 'nachtrag'], brauchtProjekt: true,
      hilfe: 'Die Positionen aller LVs, links nach LV gegliedert. Ordnungszahl (OZ) wie 01.02.0010: Titel enthalten Positionen. Rechts in der Karte der Gesamtpreis (Menge × EP).' },
    { id: 'angebote', imMenue: false, titel: 'Angebote', abschnitt: 'Vergabe', zeichen: 'personen', objekt: 'angebot', baum: ['lv'], brauchtProjekt: true },
    { id: 'bauvertraege', imMenue: false, titel: 'Bauverträge', abschnitt: 'Vergabe', zeichen: 'vertrag', objekt: 'bauvertrag', baum: ['lv'], brauchtProjekt: true,
      hilfe: 'Bauvertrag je Auftrag – anlegen an der Karte des beauftragten Angebots. Er entsteht einmal aus Auftrag und Protokoll der Angebotsbesprechung (alle Regelungen ausgeschrieben) und lässt sich danach ändern. Drucken als PDF zum Unterschreiben.' },
    { id: 'nachtraege', imMenue: false, titel: 'Nachträge', abschnitt: 'Prüfung und Abrechnung', zeichen: 'nachtrag', objekt: 'nachtrag', baum: ['lv', 'stand'], brauchtProjekt: true },
  ],
};
