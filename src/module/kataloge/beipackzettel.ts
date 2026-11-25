// Modul Baudaten (früher „Kataloge“, wie im bisherigen Bauportal): Nachschlagelisten aus dem Katalog-Kanal –
// Gewerke nach VOB/C, Kostengruppen nach DIN 276, später die Positionsdatenbank.
import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

// Kataloge: Nachschlagelisten, die über den Katalog-Kanal kommen (Verwaltung → Updates) und die das Büro ergänzen darf.
// Was aus dem Kanal stammt, trägt eine Kennung und die Marke „aus dem Katalog“; eigene Einträge und von Hand
// geänderte Werte überschreibt eine Aktualisierung nicht.
export const gewerk: ObjektModell = {
  name: 'gewerk',
  titel: 'Gewerk',
  titelMehrzahl: 'Gewerke',
  anzeigeFeld: 'name',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'name', titel: 'Gewerk', art: 'text', pflicht: true, inListe: true, breite: 380, gruppe: 'Gewerk' },
    { name: 'norm', titel: 'Norm (VOB/C)', art: 'text', inListe: true, breite: 150, gruppe: 'Gewerk' },
    { name: 'bereich', titel: 'Bereich', art: 'auswahl', inListe: true, breite: 190, gruppe: 'Gewerk', optionen: [
      { wert: '', titel: 'noch offen' }, { wert: 'allgemein', titel: 'Allgemein, Baustelle' }, { wert: 'tiefbau', titel: 'Erd- und Tiefbau' }, { wert: 'rohbau', titel: 'Rohbau' },
      { wert: 'huelle', titel: 'Dach und Fassade' }, { wert: 'ausbau', titel: 'Ausbau' }, { wert: 'technik', titel: 'Haustechnik' }, { wert: 'aussen', titel: 'Außenanlagen, Verkehrswege' },
    ] },
    { name: 'notiz', titel: 'Notiz des Büros', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung im Katalog', art: 'text', gruppe: 'Aus dem Katalog' },
  ],
};

// Kostengruppen nach DIN 276 – Bauteile, Kosten und Ausschreibung ordnen sich danach. Die Fassung kommt über den Kanal.
export const kostengruppe: ObjektModell = {
  name: 'kostengruppe',
  titel: 'Kostengruppe',
  titelMehrzahl: 'Kostengruppen',
  anzeigeFeld: 'bezeichnung',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'nummer', titel: 'KG', art: 'text', pflicht: true, inListe: true, breite: 80, gruppe: 'Kostengruppe' },
    { name: 'name', titel: 'Bezeichnung', art: 'text', pflicht: true, inListe: true, breite: 380, gruppe: 'Kostengruppe' },
    { name: 'bezeichnung', titel: 'KG und Bezeichnung', art: 'text', gruppe: 'Kostengruppe' },
    { name: 'ebene', titel: 'Ebene', art: 'zahl', inListe: true, breite: 80, gruppe: 'Kostengruppe' },
    { name: 'hauptgruppe', titel: 'Hauptgruppe', art: 'text', gruppe: 'Kostengruppe' },
    { name: 'notiz', titel: 'Notiz des Büros', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung im Katalog', art: 'text', gruppe: 'Aus dem Katalog' },
  ],
};

// Gebäudekennwerte: Kosten je m² Brutto-Grundfläche nach Gebäudeart und Standardstufe – Grundlage der Kostenschätzung.
// Erster Stand aus den öffentlichen NHK 2010; später kommen eigene Projekte als Vergleichswerte mit Streuung dazu.
const INDEXREIHE = [{ wert: 'wohn', titel: 'Wohngebäude' }, { wert: 'buero', titel: 'Bürogebäude' }, { wert: 'gewerbe', titel: 'Gewerbliche Betriebsgebäude' }];
const stufe = (n: number, breite = 90) => ({ name: `stufe${n}`, titel: `Stufe ${n}`, art: 'zahl' as const, inListe: true, breite, gruppe: 'Kosten je m² BGF (Kostenstand)' });
export const gebaeudekennwert: ObjektModell = {
  name: 'gebaeudekennwert',
  titel: 'Gebäudekennwert',
  titelMehrzahl: 'Gebäudekennwerte',
  anzeigeFeld: 'gebaeudeart',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'nummer', titel: 'Nr.', art: 'text', inListe: true, breite: 70, gruppe: 'Gebäudeart' },
    { name: 'gebaeudeart', titel: 'Gebäudeart', art: 'text', pflicht: true, inListe: true, breite: 260, gruppe: 'Gebäudeart' },
    { name: 'ausfuehrung', titel: 'Geschosse und Dach', art: 'text', inListe: true, breite: 230, gruppe: 'Gebäudeart' },
    { name: 'hauptgruppe', titel: 'Gruppe', art: 'text', gruppe: 'Gebäudeart' },
    stufe(1), stufe(2), stufe(3), stufe(4), stufe(5),
    { name: 'bezug', titel: 'Bezugsgröße', art: 'text', gruppe: 'Hochrechnen' },
    { name: 'kostenstand', titel: 'Kostenstand (Jahr)', art: 'zahl', gruppe: 'Hochrechnen' },
    { name: 'index', titel: 'Baupreisindex-Reihe', art: 'auswahl', gruppe: 'Hochrechnen', optionen: INDEXREIHE },
    { name: 'notiz', titel: 'Notiz des Büros', art: 'langtext', gruppe: 'Notiz' },
    { name: 'kennung', titel: 'Kennung im Katalog', art: 'text', gruppe: 'Aus dem Katalog' },
  ],
};

// Baupreisindex des Statistischen Bundesamts: rechnet Kennwerte von ihrem Kostenstand auf heute hoch.
const reihe = (wert: string, titel: string) => ({ name: wert, titel, art: 'zahl' as const, inListe: true, breite: 130, gruppe: 'Index (2021 = 100)' });
export const baupreisindex: ObjektModell = {
  name: 'baupreisindex',
  titel: 'Baupreisindex',
  titelMehrzahl: 'Baupreisindex',
  anzeigeFeld: 'zeitraum',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung'], loeschen: ['bueroleitung'] },
  felder: [
    { name: 'zeitraum', titel: 'Zeitraum', art: 'text', pflicht: true, inListe: true, breite: 200, gruppe: 'Zeitraum' },
    { name: 'jahr', titel: 'Jahr', art: 'zahl', gruppe: 'Zeitraum' },
    { name: 'quartal', titel: 'Quartal', art: 'text', gruppe: 'Zeitraum' },
    reihe('wohn', 'Wohngebäude'), reihe('buero', 'Bürogebäude'), reihe('gewerbe', 'Gewerbl. Betriebsgebäude'),
    { name: 'kennung', titel: 'Kennung im Katalog', art: 'text', gruppe: 'Aus dem Katalog' },
  ],
};

const KENNWERT_HILFE = `Gebäudekennwerte sind Kosten je m² Brutto-Grundfläche (BGF) für eine Gebäudeart. Sie sind die Grundlage der Kostenschätzung in frühen Leistungsphasen: BGF × Kennwert ergibt die Kosten der Kostengruppen 300 und 400 (Bauwerk), hier einschließlich Baunebenkosten und Umsatzsteuer.

Der erste Stand sind die Normalherstellungskosten 2010 (NHK 2010) aus der Wertermittlung (ImmoWertV, Anlage 4). Sie sind öffentlich, decken fast alle Gebäudearten ab und unterscheiden fünf Standardstufen: Stufe 1 und 2 einfach (Ein- und Zweifamilienhäuser, älterer Standard), Stufe 3 mittel (heutiger Normalfall), Stufe 4 gehoben, Stufe 5 stark gehoben. Für andere Gebäudearten als Ein- und Zweifamilienhäuser gibt es nur die Stufen 3 bis 5.

Hochrechnen auf heute: Kennwert × (Baupreisindex heute ÷ Baupreisindex im Jahr des Kostenstands). Für die NHK 2010 ist das der Jahresdurchschnitt 2010 (Wohngebäude 70,8 auf der Basis 2021 = 100). Welche Indexreihe gilt, steht bei jedem Kennwert (Wohn-, Büro- oder gewerbliche Betriebsgebäude). Beispiel: freistehendes Einfamilienhaus, Keller, Erdgeschoss, ausgebautes Dach, Stufe 3: 835 €/m² × 141,7 ÷ 70,8 ≈ 1.671 €/m² BGF (Stand 3. Quartal 2026).

Korrekturen: Zweifamilienhäuser kosten etwa 5 % mehr als das entsprechende Einfamilienhaus. Bei Mehrfamilienhäusern ändern Wohnungsgröße (35 m²: × 1,10 · 50 m²: × 1,00 · 135 m²: × 0,85) und Grundriss (Einspänner × 1,05 · Zweispänner × 1,00 · Dreispänner × 0,97 · Vierspänner × 0,95) den Wert. Regionale Unterschiede sind in den NHK nicht enthalten.

Grenzen: Die NHK sind Durchschnittswerte für die Wertermittlung, keine Ausschreibungspreise. Für die Kostenschätzung gelten sie als Spanne: Stufe 3 bis 4 umfasst die meisten heutigen Neubauten. Später kommen die eigenen abgerechneten Projekte des Büros als Vergleichswerte hinzu – mit Streuung, sodass sich zeigt, wie sicher ein Wert ist.

Werte, die das Büro ändert, bleiben bei einer Aktualisierung des Katalogs erhalten. Eigene Kennwerte lassen sich mit „Neu“ anlegen.`;

export const kataloge: Beipackzettel = {
  id: 'kataloge',
  zeichen: 'baudaten',
  name: 'Baudaten',
  version: '0.1.0',
  beschreibung: 'Gewerke nach VOB/C, Kostengruppen nach DIN 276, Gebäudekennwerte mit Baupreisindex und später die Positionsdatenbank – Nachschlagelisten für alle Apps, auf Knopfdruck aktualisierbar.',
  braucht: [],
  objekte: [gewerk, kostengruppe, gebaeudekennwert, baupreisindex],
  ansichten: [{ id: 'gewerke', titel: 'Gewerke', abschnitt: 'Kataloge', zeichen: 'katalog', objekt: 'gewerk', baum: ['bereich'] }, { id: 'kostengruppen', titel: 'Kostengruppen', abschnitt: 'Kataloge', zeichen: 'kataloge', objekt: 'kostengruppe', baum: ['hauptgruppe'] },
    { id: 'kennwerte', titel: 'Gebäudekennwerte', abschnitt: 'Kosten', zeichen: 'baudaten', objekt: 'gebaeudekennwert', baum: ['hauptgruppe'], hilfe: KENNWERT_HILFE },
    { id: 'baupreisindex', titel: 'Baupreisindex', abschnitt: 'Kosten', zeichen: 'baudaten', objekt: 'baupreisindex', hilfe: 'Baupreisindex des Statistischen Bundesamts für den Neubau (einschließlich Umsatzsteuer), Basis 2021 = 100. Damit rechnet das Bauportal Kennwerte von ihrem Kostenstand auf heute hoch: Kennwert × Index heute ÷ Index im Jahr des Kostenstands. Neue Quartalswerte kommen über den Katalog-Kanal; ein Büro kann sie auch selbst eintragen.' }],
  kataloge: [{ id: 'gewerke', titel: 'Gewerke nach VOB/C', objekt: 'gewerk' }, { id: 'kostengruppen', titel: 'Kostengruppen nach DIN 276', objekt: 'kostengruppe' }, { id: 'gebaeudekennwerte', titel: 'Gebäudekennwerte (NHK 2010)', objekt: 'gebaeudekennwert' }, { id: 'baupreisindex', titel: 'Baupreisindex', objekt: 'baupreisindex' }],
};
