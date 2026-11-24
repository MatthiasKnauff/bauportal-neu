// Stellschrauben: Hier steht, was ein Modul an den fertigen Bausteinen verändern darf.
// Ein Modul baut nichts über einen Baustein drüber – es stellt nur an diesen vorgesehenen Stellen.
// Fehlt eine Stellschraube, kommt sie HIER dazu (und gilt dann für alle Module), nicht im Modul.
import type { JSX } from 'solid-js';
import type { Zeile } from '../../kern/befehl';
import type { Feld } from '../../kern/modell';
import type { Menuepunkt } from './kontextmenue';
import type { Knoten } from './baum';
import type { Knopf } from './menueleiste';

export interface Anpassung {
  // --- Details (rechts) ---
  /** Weitere Abschnitte unter den Feldern der Detailkarte. */
  kartenZusatz?: (z: Zeile) => JSX.Element;
  /** Andere Zeichen für die Knöpfe im Kopf der Detailkarte. */
  kartenSymbole?: Partial<Record<'schliessen' | 'zuklappen' | 'fenster', string>>;
  // --- Inhalt (Mitte) ---
  /** Eigene Darstellung einer Tabellenzelle; ohne Rückgabe gilt die übliche. */
  zelle?: (f: Feld, z: Zeile) => JSX.Element | undefined;
  /** Zusätzliche Punkte im Kontextmenü einer Zeile (insgesamt bleiben es höchstens 6). */
  zeilenMenue?: (z: Zeile) => Menuepunkt[];
  // --- Baum (links) ---
  /** Zeichen vor einem Knoten im Baum. */
  baumSymbol?: (k: Knoten) => string | undefined;
  // --- Anlegen ---
  /** Vorbelegung für einen neuen Eintrag (z. B. nächste Nummer, heutiges Datum). Bekommt die Einträge, die gerade zur Auswahl gehören. */
  neuVorgabe?: (vorhandene: Zeile[]) => Record<string, string | number | boolean | null>;
  // --- Menüleiste ---
  /** Zusätzliche Knöpfe in der Menüleiste dieser Ansicht. Bekommt den Zusammenhang (Projekt, Version). */
  knoepfe?: (zusammenhang: Record<string, string | number | boolean | null>) => Knopf[];
}
