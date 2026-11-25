// Stellschrauben: Hier steht, was ein Modul an den fertigen Bausteinen verändern darf.
// Ein Modul baut nichts über einen Baustein drüber – es stellt nur an diesen vorgesehenen Stellen.
// Fehlt eine Stellschraube, kommt sie HIER dazu (und gilt dann für alle Module), nicht im Modul.
import type { JSX } from 'solid-js';
import type { Zeile } from '../../kern/befehl';
import type { Feld } from '../../kern/modell';
import type { Menuepunkt } from './kontextmenue';
import type { Knoten } from './baum';
import type { Knopf } from './menueleiste';

export interface Mitte {
  alle: () => Zeile[];                  // alle Einträge im Zusammenhang (Projekt, Version)
  zeilen: () => Zeile[];                // davon, was Suche und Baum gerade zeigen
  fest: () => Record<string, string | number | boolean | null>;
  gewaehlt: () => string | null;
  onWahl: (id: string | null) => void;
  onOeffnen: () => void;                // Karte zeigen, ins erste Feld
  setReihe: (ids: string[]) => void;    // Reihenfolge, in der die Mitte die Einträge zeigt – danach blättert die Karte
  setKnoepfe: (k: Knopf[]) => void;
  setNeu: (f: () => void) => void;      // „Neu“ in der Menüleiste legt so an (z. B. Balkenplan: unterhalb der markierten Leistung)     // Befehle der Mitte für die Menüleiste (z. B. Kritischer Weg, Zoom im Balkenplan)
}

export interface Anpassung {
  // --- Details (rechts) ---
  /** Weitere Abschnitte unter den Feldern der Detailkarte. */
  kartenZusatz?: (z: Zeile) => JSX.Element;
  /** Weitere Reiter der Detailkarte neben den Angaben (z. B. „Projekte“ eines Kontakts). */
  kartenReiter?: (z: Zeile) => { titel: string; inhalt: () => JSX.Element }[];
  /** Andere Zeichen für die Knöpfe im Kopf der Detailkarte. */
  kartenSymbole?: Partial<Record<'schliessen' | 'zuklappen' | 'fenster', string>>;
  // --- Oben (unter der Menüleiste) ---
  /** Einstellungen, die für alle Einträge der Ansicht gelten (z. B. Arbeitszeit des Plans). Bekommt den Zusammenhang (Projekt, Version). */
  oben?: (zusammenhang: Record<string, string | number | boolean | null>) => JSX.Element;
  // --- Inhalt (Mitte) ---
  /** Statt der Tabelle eine eigene Darstellung in der Mitte (z. B. der Balkenplan) – Rahmen, Suche, Karte und Anlegen bleiben. */
  mitte?: (p: Mitte) => JSX.Element;
  /** Die Einträge auch als Kacheln: was in einer Kachel steht. Die Ansicht bietet dann Tabelle oder Kacheln zum Umschalten (am Handy zuerst Kacheln). */
  kachel?: (z: Zeile) => JSX.Element;
  /** Eigene Darstellung einer Tabellenzelle; ohne Rückgabe gilt die übliche. */
  zelle?: (f: Feld, z: Zeile) => JSX.Element | undefined;
  /** Zusätzliche Punkte im Kontextmenü einer Zeile (insgesamt bleiben es höchstens 6). */
  zeilenMenue?: (z: Zeile) => Menuepunkt[];
  // --- Links ---
  /** Statt des Baums eine eigene Darstellung links (z. B. Kalender und Abschnitte im Bautagebuch). */
  links?: (p: Mitte) => JSX.Element;
  linksTitel?: string;
  // --- Details (rechts), eigene ---
  /** Statt der Detailkarte des gewählten Eintrags etwas anderes rechts; ohne Rückgabe bleibt der Platz rechts leer. */
  details?: (z: Zeile) => JSX.Element | undefined;
  /** Was rechts steht, solange nichts gewählt ist (Vorgabe: „Einen Eintrag anklicken …“). */
  detailsHinweis?: string;
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
