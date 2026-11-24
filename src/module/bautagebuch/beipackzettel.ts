import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

// Je Projekt eine Liste nummerierter Berichte mit Datum – ohne Versionen.
export const tagesbericht: ObjektModell = {
  name: 'tagesbericht',
  titel: 'Tagesbericht',
  titelMehrzahl: 'Tagesberichte',
  anzeigeFeld: 'titel',
  projektFeld: 'projekt',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung', 'mitarbeiter'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'nummer', titel: 'Nr.', art: 'zahl', inListe: true, breite: 70, gruppe: 'Bericht' },
    { name: 'datum', titel: 'Datum', art: 'datum', pflicht: true, inListe: true, breite: 120, gruppe: 'Bericht' },
    { name: 'titel', titel: 'Kurzbeschreibung', art: 'text', pflicht: true, inListe: true, breite: 300, gruppe: 'Bericht' },
    { name: 'wetter', titel: 'Wetter', art: 'auswahl', inListe: true, breite: 120, gruppe: 'Wetter', optionen: [
      { wert: '', titel: 'keine Angabe' },
      { wert: 'sonnig', titel: 'Sonnig' },
      { wert: 'bewoelkt', titel: 'Bewölkt' },
      { wert: 'regen', titel: 'Regen' },
      { wert: 'schnee', titel: 'Schnee' },
      { wert: 'frost', titel: 'Frost' },
      { wert: 'sturm', titel: 'Sturm' },
    ] },
    { name: 'temperatur', titel: 'Temperatur in °C', art: 'zahl', gruppe: 'Wetter' },
    { name: 'anwesende', titel: 'Anwesende Firmen und Personen', art: 'langtext', gruppe: 'Baustelle' },
    { name: 'leistungen', titel: 'Ausgeführte Arbeiten', art: 'langtext', gruppe: 'Baustelle' },
    { name: 'maengel', titel: 'Mängel und Behinderungen', art: 'langtext', gruppe: 'Baustelle' },
    { name: 'anordnungen', titel: 'Anordnungen und Absprachen', art: 'langtext', gruppe: 'Baustelle' },
  ],
};

export const bautagebuch: Beipackzettel = {
  id: 'bautagebuch',
  name: 'Bautagebuch',
  version: '0.1.0',
  beschreibung: 'Nummerierte Tagesberichte je Projekt: Wetter, Anwesende, Arbeiten, Mängel, Anordnungen.',
  braucht: ['projekte'],
  objekte: [tagesbericht],
  ansichten: [{ id: 'berichte', titel: 'Berichte', objekt: 'tagesbericht', brauchtProjekt: true }],
  ausdrucke: [{
    id: 'bautagebuch.tagesbericht', titel: 'Tagesbericht', objekt: 'tagesbericht',
    dateiname: 'Tagesbericht {nummer} {datum} {projekt}', fuss: '{buero} · Tagesbericht Nr. {nummer} vom {datum}',
    bloecke: [
      { id: 'kopf', art: 'briefkopf' },
      { id: 'titel', art: 'titel', text: 'Tagesbericht Nr. {nummer}', unter: '{datum} · {titel}' },
      { id: 'angaben', art: 'felder', felder: ['datum', 'nummer', 'wetter', 'temperatur'] },
      { id: 'anwesende', art: 'text', feld: 'anwesende' },
      { id: 'leistungen', art: 'text', feld: 'leistungen' },
      { id: 'maengel', art: 'text', feld: 'maengel' },
      { id: 'anordnungen', art: 'text', feld: 'anordnungen' },
    ],
  }],
};
