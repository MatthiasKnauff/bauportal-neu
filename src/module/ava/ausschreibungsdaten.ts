// Ausschreibungsdaten wie im bisherigen Bauportal: übliche Werte zur Auswahl (dazu eigene), in drei Ebenen Büro → Projekt → LV.
// Was für alle LVs eines Projekts gleich ist, steht einmal am Projekt („Ausschreibung (alle LVs)“), sonst gilt die Vorgabe des
// Büros („Vorgaben für Ausschreibungen“); das LV hält nur Abweichungen (Feld „erbt“, kern/erben.ts).
const liste = (...t: string[]) => t.map((x) => ({ wert: x, titel: x }));

export const VERGABEARTEN = liste('Öffentliche Ausschreibung', 'Beschränkte Ausschreibung', 'Freihändige Vergabe / Verhandlungsvergabe', 'Preisanfrage (privat)', 'Direktauftrag');
export const UHRZEITEN = liste('09:00', '10:00', '10:30', '11:00', '12:00', '14:00');
export const ABGABEORTE = liste('im Büro der Ausschreibenden (Anschrift siehe Deckblatt)', 'bei der Bauherrschaft', 'über die Vergabeplattform', 'per E-Mail an die Ausschreibenden');
export const AUFFORDERUNGEN = liste('Sollten Sie an der Ausführung der folgenden Leistungen interessiert sein, bitten wir um die termingerechte Abgabe Ihres Angebots.',
  'Wir bitten um Ihr Angebot für die folgenden Leistungen bis zum Abgabetermin.', 'Im Auftrag der Bauherrschaft bitten wir um ein Angebot für die nachstehenden Leistungen.');
export const AUSTAUSCHFORMATE = liste('GAEB DA XML (X83) – Angebot gern als X84', 'GAEB 90 (D83) – Angebot gern als D84', 'nur PDF / Papier');
export const VEREINBARUNGEN = [
  { wert: 'abgabetermin', titel: 'Gewertet werden nur Angebote, die bis zum Abgabetermin eingehen.' },
  { wert: 'vollstaendig', titel: 'Gewertet werden nur vollständig ausgefüllte Unterlagen.' },
  { wert: 'netto', titel: 'Einzelpreise netto in Euro, höchstens zwei Nachkommastellen.' },
  { wert: 'schriftlich', titel: 'Änderungen am Leistungsverzeichnis gelten nur, wenn sie schriftlich vereinbart sind.' },
  { wert: 'unterschrift', titel: 'Das Angebot ist an den gekennzeichneten Stellen rechtsverbindlich zu unterschreiben.' },
  { wert: 'anlagen', titel: 'Anlagen sind Bestandteil der Ausschreibung.' },
];
export const RECHNUNGSSTELLUNG = liste('Abschlagsrechnungen nach Aufmaß, Schlussrechnung nach Abnahme', 'Abschläge nach Baufortschritt (Zahlungsplan)', 'nur Schlussrechnung');
export const ZAHLUNGSFRISTEN = liste('21 Tage nach Zugang der prüfbaren Rechnung (§ 16 Abs. 1 Nr. 3 VOB/B)', '14 Tage nach Zugang der prüfbaren Rechnung', '30 Tage nach Zugang der prüfbaren Rechnung');
export const NACHWEISE = liste('Freistellungsbescheinigung (§ 48b EStG) wird spätestens mit Baubeginn eingereicht',
  'Freistellungsbescheinigung (§ 48b EStG), Unbedenklichkeitsbescheinigung der Berufsgenossenschaft und Nachweis der Betriebshaftpflichtversicherung spätestens mit Baubeginn');
export const NACHUNTERNEHMER = liste('nur mit vorheriger Zustimmung der Auftraggeber:in; vorgesehene Nachunternehmer bitte im Angebot nennen', 'nicht zugelassen');
export const ENERGIE = liste('bauseits, kostenlos', 'bauseits, Umlage nach den Abzügen', 'Auftragnehmer:in stellt selbst');

