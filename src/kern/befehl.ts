// Befehle: Jede Änderung an den Daten ist ein Befehl.
// Der Server schreibt jeden Befehl ins Protokoll; die Oberfläche wendet dieselben
// Befehle auf ihren lokalen Datenbestand an. Rückgängig ist ein Gegenbefehl.

import type { Werte } from './modell';

export type BefehlArt = 'anlegen' | 'aendern' | 'loeschen' | 'wiederherstellen';
export const BEFEHL_ARTEN: BefehlArt[] = ['anlegen', 'aendern', 'loeschen', 'wiederherstellen'];

export interface Befehl {
  id: string;        // vom Absender vergeben – doppelt gesendete Befehle wirken nur einmal
  objekt: string;    // Modellname, z. B. "kontakt"
  art: BefehlArt;
  objektId: string;
  werte?: Werte;     // bei anlegen: alle Felder, bei aendern: nur die geänderten
  gesehen: number;   // Protokollstand, den der Absender kannte – daran erkennt der Server gleichzeitige Änderungen
}

export interface Ueberschrieben { wert: Werte[string]; von: string; vonId: string }

/** Ein Befehl, wie er im Protokoll steht. */
export interface Protokolliert extends Befehl {
  seq: number;
  zeit: string;
  benutzerId: string;
  benutzerName: string;
  ueberschrieben?: Record<string, Ueberschrieben>;   // Felder, die jemand anderes gleichzeitig geändert hatte
}

export interface Zeile { id: string; geloescht: boolean; werte: Werte }

export type Vorlage = Pick<Befehl, 'objekt' | 'art' | 'objektId' | 'werte'>;

/** Wendet einen Befehl auf eine Zeile an (ohne Prüfung – geprüft wird auf dem Server). */
export function anwenden(z: Zeile | undefined, b: Pick<Befehl, 'art' | 'objektId' | 'werte'>): Zeile | undefined {
  switch (b.art) {
    case 'anlegen':
      return { id: b.objektId, geloescht: false, werte: { ...(b.werte ?? {}) } };
    case 'aendern':
      return z && { ...z, werte: { ...z.werte, ...(b.werte ?? {}) } };
    case 'loeschen':
      return z && { ...z, geloescht: true };
    case 'wiederherstellen':
      return z && { ...z, geloescht: false };
  }
}

/** Der Befehl, der einen anderen wieder aufhebt. vorher = Zeile vor dem Befehl. */
export function gegenbefehl(vorher: Zeile | undefined, b: Vorlage): Vorlage {
  const kopf = { objekt: b.objekt, objektId: b.objektId };
  switch (b.art) {
    case 'anlegen':
      return { ...kopf, art: 'loeschen' };
    case 'loeschen':
      return { ...kopf, art: 'wiederherstellen' };
    case 'wiederherstellen':
      return { ...kopf, art: 'loeschen' };
    case 'aendern': {
      const alt: Werte = {};
      for (const k of Object.keys(b.werte ?? {})) alt[k] = vorher?.werte[k] ?? null;
      return { ...kopf, art: 'aendern', werte: alt };
    }
  }
}
