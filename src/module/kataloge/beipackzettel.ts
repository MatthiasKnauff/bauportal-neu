// Modul Kataloge: Nachschlagelisten aus dem Katalog-Kanal, zuerst die Gewerke nach VOB/C.
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

export const kataloge: Beipackzettel = {
  id: 'kataloge',
  name: 'Kataloge',
  version: '0.1.0',
  beschreibung: 'Nachschlagelisten aus dem Katalog-Kanal, auf Knopfdruck aktualisierbar: Gewerke nach VOB/C, Kostengruppen nach DIN 276.',
  braucht: [],
  objekte: [gewerk, kostengruppe],
  ansichten: [{ id: 'gewerke', titel: 'Gewerke', abschnitt: 'Kataloge', zeichen: 'katalog', objekt: 'gewerk', baum: ['bereich'] }, { id: 'kostengruppen', titel: 'Kostengruppen', abschnitt: 'Kataloge', zeichen: 'kataloge', objekt: 'kostengruppe', baum: ['hauptgruppe'] }],
  kataloge: [{ id: 'gewerke', titel: 'Gewerke nach VOB/C', objekt: 'gewerk' }, { id: 'kostengruppen', titel: 'Kostengruppen nach DIN 276', objekt: 'kostengruppe' }],
};
