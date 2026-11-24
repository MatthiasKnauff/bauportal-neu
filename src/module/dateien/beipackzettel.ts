// Modul Pläne und Dateien: der Projektordner auf dem Dateiserver – die Ansicht dazu bringt die Oberfläche mit (ui/dateien.tsx).
import type { Beipackzettel } from '../../kern/modul';

// Die Originale bleiben auf dem Dateiserver. Dieses Modul zeigt den Ordner des gewählten Projekts;
// es bringt keine eigenen Objekte mit. Sichtbar ist, was der Benutzer am Projekt sehen darf.
export const dateien: Beipackzettel = {
  id: 'dateien',
  name: 'Pläne und Dateien',
  version: '0.1.0',
  beschreibung: 'Der Projektordner auf dem Dateiserver: durchblättern, ansehen, herunterladen.',
  braucht: ['projekte'],
  objekte: [],
  ansichten: [{ id: 'dateien', titel: 'Dateien', brauchtProjekt: true }],
};
