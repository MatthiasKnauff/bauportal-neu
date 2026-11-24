import type { Beipackzettel } from '../../kern/modul';
import type { ObjektModell } from '../../kern/modell';
import { ALLE } from '../../kern/rechte';

export const vorgang: ObjektModell = {
  name: 'vorgang',
  titel: 'Vorgang',
  titelMehrzahl: 'Vorgänge',
  anzeigeFeld: 'name',
  projektFeld: 'projekt',
  versionsBereich: 'bauzeitenplan',
  rechte: { lesen: ALLE, schreiben: ['bueroleitung', 'bauleitung'], loeschen: ['bueroleitung', 'bauleitung'] },
  felder: [
    { name: 'projekt', titel: 'Projekt', art: 'verweis', ziel: 'projekt', pflicht: true },
    { name: 'version', titel: 'Version', art: 'verweis', ziel: 'version', pflicht: true },
    { name: 'name', titel: 'Vorgang', art: 'text', pflicht: true, inListe: true, breite: 280, gruppe: 'Vorgang' },
    { name: 'gewerk', titel: 'Gewerk', art: 'text', inListe: true, breite: 170, gruppe: 'Vorgang' },
    { name: 'beginn', titel: 'Beginn', art: 'datum', inListe: true, breite: 120, gruppe: 'Termine' },
    { name: 'ende', titel: 'Ende', art: 'datum', inListe: true, breite: 120, gruppe: 'Termine' },
    { name: 'fortschritt', titel: 'Fortschritt in %', art: 'zahl', inListe: true, breite: 130, gruppe: 'Termine' },
    { name: 'notiz', titel: 'Notiz', art: 'langtext', gruppe: 'Notiz' },
  ],
};

export const bauzeitenplan: Beipackzettel = {
  id: 'bauzeitenplan',
  name: 'Bauzeitenplan',
  version: '0.1.0',
  beschreibung: 'Vorgänge eines Projekts mit Terminen, in benannten Versionen. Der Balkenplan folgt.',
  braucht: ['projekte'],
  objekte: [vorgang],
  ansichten: [{ id: 'vorgaenge', titel: 'Vorgänge', objekt: 'vorgang', baum: ['gewerk'], brauchtProjekt: true }],
  versionen: [{ bereich: 'bauzeitenplan', titel: 'Bauzeitenplan', wege: ['kopie', 'leer', 'projekt'] }],
};
