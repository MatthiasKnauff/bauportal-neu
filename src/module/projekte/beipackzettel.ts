// Modul Projekte: Projekte, ihre Mitglieder (wer sieht was), Beteiligte aus den Adressen und die Versionen aller Module.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

const auswahl = (...t: string[]) => [{ wert: '', titel: '–' }, ...t.map((x) => ({ wert: x, titel: x }))];
export const MASSNAHMEN = auswahl('Neubau', 'Umbau', 'Erweiterung', 'Sanierung / Modernisierung', 'Instandsetzung', 'Abbruch', 'Außenanlagen');
export const NUTZUNGEN = auswahl('Wohnen', 'Büro / Verwaltung', 'Gewerbe', 'Einzelhandel', 'Gastronomie', 'Hotel / Beherbergung', 'Schule / Kita', 'Pflege / betreutes Wohnen',
  'Praxis / Gesundheit', 'Lager / Logistik', 'Produktion / Werkstatt', 'Sport / Freizeit', 'Kultur / Versammlung', 'Landwirtschaft / Tierhaltung');
export const GEBIETE = auswahl('Wohngebiet (WA)', 'reines Wohngebiet (WR)', 'Mischgebiet (MI)', 'urbanes Gebiet (MU)', 'Gewerbegebiet (GE)', 'Industriegebiet (GI)', 'Sondergebiet (SO)', 'Außenbereich');

export const projekt: ObjektModell = {
  name: 'projekt',
  titel: 'Projekt',
  titelMehrzahl: 'Projekte',
  anzeigeFeld: 'name',
  projektFeld: 'id',
  // Anlegen können nur Rollen, die alle Projekte sehen. Ändern: wer schreiben darf UND Mitglied ist.
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung'] },
  eingeklappt: ['Beteiligte', 'Grundstück', 'Bauantrag', 'Termine', 'Ablage'],
  felder: [
    { name: 'name', titel: 'Projektname', art: 'text', pflicht: true, inListe: true, breite: 280, gruppe: 'Projekt' },
    { name: 'nummer', titel: 'Projektnummer', art: 'text', inListe: true, breite: 130, kartenBreite: 3, gruppe: 'Projekt' },
    { name: 'status', titel: 'Status', art: 'auswahl', inListe: true, breite: 120, kartenBreite: 3, gruppe: 'Projekt', optionen: [
      { wert: 'aktiv', titel: 'Aktiv' },
      { wert: 'ruht', titel: 'Ruht' },
      { wert: 'archiviert', titel: 'Archiviert' },
    ] },
    { name: 'beschreibung', titel: 'Projektbeschreibung (kurz: was wird gebaut – z. B. auf dem LV-Deckblatt)', art: 'langtext', gruppe: 'Projekt' },
    { name: 'massnahme', spalte: true, titel: 'Art der Maßnahme', art: 'auswahl', optionen: MASSNAHMEN, kartenBreite: 3, gruppe: 'Projekt' },
    { name: 'nutzung', spalte: true, titel: 'Nutzung', art: 'auswahl', optionen: NUTZUNGEN, eigeneWerte: true, kartenBreite: 3, gruppe: 'Projekt' },
    { name: 'kostenrahmen', titel: 'Kostenrahmen brutto in €', art: 'zahl', kartenBreite: 3, gruppe: 'Projekt' },
    { name: 'ki_extern_aus', titel: 'Keine externe KI (Vorgabe der Bauherrschaft)', art: 'ja_nein', kartenBreite: 3, gruppe: 'Projekt' },
    // Bauherr:in und Beteiligte (wie bisher): Kontakte aus den Adressen – keine Rollen an der Beteiligtenliste
    { name: 'bauherrschaft', titel: 'Bauherr:in', art: 'verweis', ziel: 'kontakt', inListe: true, breite: 200, gruppe: 'Bauherr:in' },
    { name: 'bh_vertreter', titel: 'Vertreten durch (z. B. Hausverwaltung, Geschäftsführung)', art: 'verweis', ziel: 'kontakt', gruppe: 'Bauherr:in' },
    { name: 'bh_ansprech', titel: 'Ansprechpartner:in', art: 'verweis', ziel: 'kontakt', gruppe: 'Bauherr:in' },
    { name: 'bauherr', titel: 'Bauherr:in (Text aus der Übernahme)', art: 'text', verborgen: true },   // wird einmal einem Kontakt zugeordnet (server/grundausstattung)
    ...([['projektsteuerung', 'Projektsteuerung'], ['objektplanung', 'Objektplanung / Architekt:in'], ['tragwerk', 'Tragwerksplanung'], ['sigeko', 'SiGeKo'],
      ['bauleitung', 'Bauleiter:in (nach Landesbauordnung)'], ['nw_waerme', 'Wärmeschutz- / Energienachweis (GModG)'], ['nw_schall', 'Schallschutznachweis'], ['nw_brand', 'Brandschutznachweis']] as const)
      .map(([name, titel]) => ({ name, titel, art: 'verweis' as const, ziel: 'kontakt', gruppe: 'Beteiligte' })),
    { name: 'strasse', spalte: true, titel: 'Straße und Hausnummer', art: 'text', gruppe: 'Baustelle' },
    { name: 'plz', spalte: true, titel: 'PLZ', art: 'text', kartenBreite: 2, gruppe: 'Baustelle' },
    { name: 'ort', titel: 'Ort', art: 'text', inListe: true, breite: 150, kartenBreite: 4, gruppe: 'Baustelle' },
    // Grundstück: „Aus dem Kataster holen“ (ALKIS und Geländemodell von Geobasis NRW) oder von Hand
    { name: 'gemarkung', spalte: true, titel: 'Gemarkung', art: 'text', kartenBreite: 2, gruppe: 'Grundstück' },
    { name: 'flur', spalte: true, titel: 'Flur', art: 'text', kartenBreite: 1, gruppe: 'Grundstück' },
    { name: 'flurstueck', spalte: true, titel: 'Flurstück(e)', art: 'text', kartenBreite: 3, gruppe: 'Grundstück' },
    { name: 'flaeche', titel: 'Grundstücksfläche in m²', art: 'zahl', kartenBreite: 3, gruppe: 'Grundstück' },
    { name: 'hoehe_nhn', titel: 'Geländehöhe in m über NHN', art: 'zahl', kartenBreite: 3, gruppe: 'Grundstück' },
    // Bauantrag (wie bisher: gilt für alle Anträge des Projekts)
    { name: 'behoerde', titel: 'Untere Bauaufsichtsbehörde', art: 'verweis', ziel: 'kontakt', gruppe: 'Bauantrag' },
    { name: 'genehmigung_az', spalte: true, titel: 'Baugenehmigung – Aktenzeichen', art: 'text', kartenBreite: 3, gruppe: 'Bauantrag' },
    { name: 'genehmigung_datum', spalte: true, titel: 'Baugenehmigung vom', art: 'datum', kartenBreite: 3, gruppe: 'Bauantrag' },
    { name: 'bplan', titel: 'Bebauungsplan (leer: Innenbereich)', art: 'text', gruppe: 'Bauantrag' },
    { name: 'gebiet', titel: 'Gebietsart', art: 'auswahl', optionen: GEBIETE, kartenBreite: 3, gruppe: 'Bauantrag' },
    { name: 'baulasten', titel: 'Baulasten', art: 'auswahl', optionen: auswahl('keine bekannt', 'vorhanden', 'angefragt'), kartenBreite: 3, gruppe: 'Bauantrag' },
    { name: 'denkmal', titel: 'Denkmalschutz', art: 'auswahl', optionen: auswahl('ja', 'nein'), kartenBreite: 2, gruppe: 'Bauantrag' },
    { name: 'gebaeudeklasse', titel: 'Gebäudeklasse', art: 'auswahl', optionen: auswahl('1', '2', '3', '4', '5'), kartenBreite: 2, gruppe: 'Bauantrag' },
    { name: 'sonderbau', titel: 'Sonderbau', art: 'auswahl', optionen: auswahl('ja', 'nein'), kartenBreite: 2, gruppe: 'Bauantrag' },
    ...([['grf', 'Grundfläche GR in m²'], ['bgf', 'Brutto-Grundfläche BGF in m²'], ['bri', 'Brutto-Rauminhalt BRI in m³'], ['geschosse', 'Vollgeschosse'], ['hoehe', 'Höhe OK Gebäude in m'],
      ['we', 'Wohneinheiten'], ['st_notw', 'Stellplätze notwendig'], ['st_nachg', 'Stellplätze nachgewiesen']] as const)
      .map(([name, titel]) => ({ name, titel, art: 'zahl' as const, kartenBreite: 2, gruppe: 'Bauantrag' })),
    { name: 'grz', titel: 'GRZ vorhanden', art: 'text', kartenBreite: 2, gruppe: 'Bauantrag' },
    { name: 'gfz', titel: 'GFZ vorhanden', art: 'text', kartenBreite: 2, gruppe: 'Bauantrag' },
    // Termine (wie bisher; Baubeginn kann aus dem Bauzeitenplan kommen)
    { name: 'baubeginn', spalte: true, titel: 'Baubeginn', art: 'datum', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'fertigstellung', spalte: true, titel: 'voraussichtliche Fertigstellung', art: 'datum', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'uebergabe', titel: 'Übergabe an die Bauherr:in', art: 'datum', kartenBreite: 2, gruppe: 'Termine' },
    { name: 'ordner', titel: 'Ordner auf dem Dateiserver', art: 'text', gruppe: 'Ablage' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
  ],
};

// Favoriten und „Zuletzt benutzt“ der Projektwahl – je Benutzer, nur für ihn sichtbar
export const projektMerker: ObjektModell = {
  name: 'projekt_merker',
  titel: 'Projekt-Merker',
  titelMehrzahl: 'Projekt-Merker',
  anzeigeFeld: 'projekt',
  projektFeld: 'projekt',
  eigenFeld: 'benutzer',
  rechte: { lesen: ALLE, schreiben: ALLE, loeschen: ALLE },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'benutzer', titel: 'Benutzer', art: 'verweis', ziel: 'benutzer', pflicht: true },
    { name: 'favorit', titel: 'Favorit', art: 'ja_nein' },
    { name: 'zuletzt', titel: 'Zuletzt benutzt', art: 'text' },   // Zeitpunkt (ISO) – sortiert richtig
  ],
};

export const projektMitglied: ObjektModell = {
  name: 'projekt_mitglied',
  titel: 'Projektmitglied',
  titelMehrzahl: 'Projektmitglieder',
  anzeigeFeld: 'benutzer',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'benutzer', titel: 'Benutzer', art: 'verweis', ziel: 'benutzer', pflicht: true },
  ],
};

export const projektKontakt: ObjektModell = {
  name: 'projekt_kontakt',
  titel: 'Beteiligte:r',
  titelMehrzahl: 'Projektbeteiligte',
  anzeigeFeld: 'kontakt',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'kontakt', titel: 'Kontakt', art: 'verweis', ziel: 'kontakt', pflicht: true },
    { name: 'aufgabe', spalte: true, titel: 'Aufgabe im Projekt (z. B. das Gewerk)', art: 'text' },
    { name: 'vergabe', spalte: true, titel: 'Vergabe', art: 'auswahl', optionen: [
      { wert: '', titel: '–' }, { wert: 'offen', titel: 'offen' }, { wert: 'angefragt', titel: 'angefragt' }, { wert: 'angebot', titel: 'Angebot liegt vor' },
      { wert: 'beauftragt', titel: 'beauftragt' }, { wert: 'abgeschlossen', titel: 'abgeschlossen' },
    ] },
    { name: 'notiz', titel: 'Notiz', art: 'text' },
  ],
};

// Versionen: benannte, unabhängig bearbeitbare Stände je Projekt und Bereich (z. B. Bauzeitenplan „Startversion“).
// Genau eine Version je Projekt und Bereich ist gültig – darauf zeigen später die Verknüpfungen.
export const version: ObjektModell = {
  name: 'version',
  titel: 'Version',
  titelMehrzahl: 'Versionen',
  anzeigeFeld: 'name',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'bereich', titel: 'Bereich', art: 'text', pflicht: true },
    { name: 'name', titel: 'Name der Version', art: 'text', pflicht: true },
    { name: 'gueltig', titel: 'Gültige Version', art: 'ja_nein' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext' },
    { name: 'kennung', titel: 'Kennung aus der Übernahme', art: 'text', verborgen: true },
    { name: 'netz', titel: '3D-Ansicht gerechnet', art: 'text', verborgen: true },   // Stand des 3D-Netzes (Zeit) – setzt der Server, offene 3D-Ansichten laden dann neu
  ],
};

export const projekte: Beipackzettel = {
  id: 'projekte',
  zeichen: 'projekte',
  farbe: '#9a9c9e',
  name: 'Projekte',
  version: '0.1.0',
  beschreibung: 'Projekte und wer daran mitarbeitet. Daran hängen später Bautagebuch, Termine und Kosten.',
  braucht: ['verwaltung', 'adressen'],
  objekte: [projekt, projektMitglied, projektKontakt, projektMerker, version],
  ansichten: [],   // Projekte stehen wie im bisherigen Bauportal in der Verwaltung (Büro → Projekte), gewählt wird oben in der Kopfleiste
};
