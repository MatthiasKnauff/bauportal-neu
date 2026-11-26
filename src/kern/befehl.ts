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
  herkunft?: string; // woher die Werte stammen, wenn nicht von Hand eingegeben: z. B. „ifc“, „geschaetzt“, „assistent“
}

/** Herkunft der Werte, die nicht von Hand eingegeben wurden. Von Hand = keine Angabe. */
export const HERKUNFT: Record<string, string> = { ifc: 'aus IFC', geschaetzt: 'geschätzt', ki: 'von der KI', katalog: 'aus dem Katalog', wetterdienst: 'vom Wetterdienst', assistent: 'vom Assistenten', plan: 'aus dem Plan', uebernahme: 'übernommen', aufraeumen: 'beim Aufräumen', pruef_ki: 'von der Prüf-KI', gaeb: 'aus GAEB' };
/**
 * Für welche Felder eines Befehls die Herkunft gilt: für die Felder, die der Absender wirklich geliefert hat –
 * nicht für Vorgaben, die das Modell beim Anlegen ergänzt. Im Protokoll stehen sie ausdrücklich (herkunftFelder).
 */
export const herkunftsfelder = (b: Pick<Befehl, 'art' | 'werte'> & { herkunftFelder?: string[] }): string[] =>
  b.herkunftFelder ?? Object.entries(b.werte ?? {}).filter(([, w]) => b.art !== 'anlegen' || (w !== '' && w !== null && w !== false)).map(([k]) => k);

export interface Ueberschrieben { wert: Werte[string]; von: string; vonId: string }

/** Ein Befehl, wie er im Protokoll steht. */
export interface Protokolliert extends Befehl {
  seq: number;
  zeit: string;
  benutzerId: string;
  benutzerName: string;
  ueberschrieben?: Record<string, Ueberschrieben>;   // Felder, die jemand anderes gleichzeitig geändert hatte
  herkunftFelder?: string[];                         // Felder, für die „herkunft“ gilt
}

export interface Zeile { id: string; geloescht: boolean; werte: Werte; herkunft?: Record<string, string> /* je Feld, nur wenn nicht von Hand */ }

export type Vorlage = Pick<Befehl, 'objekt' | 'art' | 'objektId' | 'werte' | 'herkunft'>;

/** Wendet einen Befehl auf eine Zeile an (ohne Prüfung – geprüft wird auf dem Server). */
export function anwenden(z: Zeile | undefined, b: Pick<Befehl, 'art' | 'objektId' | 'werte' | 'herkunft'> & { herkunftFelder?: string[] }): Zeile | undefined {
  // Herkunft: ein Befehl mit Herkunft kennzeichnet seine Felder, eine Eingabe von Hand nimmt die Kennzeichnung wieder weg.
  const herkunft = (alt?: Record<string, string>) => {
    const h = { ...(alt ?? {}) };
    for (const k of b.art === 'anlegen' || b.herkunft ? herkunftsfelder(b) : Object.keys(b.werte ?? {})) { if (b.herkunft) h[k] = b.herkunft; else delete h[k]; }
    return Object.keys(h).length ? { herkunft: h } : {};
  };
  switch (b.art) {
    case 'anlegen':
      return { id: b.objektId, geloescht: false, werte: { ...(b.werte ?? {}) }, ...herkunft() };
    case 'aendern': {
      if (!z) return z;
      const { herkunft: alt, ...rest } = z;
      return { ...rest, werte: { ...z.werte, ...(b.werte ?? {}) }, ...herkunft(alt) };
    }
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
