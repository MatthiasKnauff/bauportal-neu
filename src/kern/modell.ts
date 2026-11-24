// Datenmodell: Jedes Objekt wird hier EINMAL beschrieben.
// Daraus entstehen die Tabelle in der Datenbank, die Prüfung der Eingaben,
// die Befehle und die Masken und Tabellen der Oberfläche.

export type FeldArt = 'text' | 'langtext' | 'auswahl' | 'email' | 'telefon' | 'zahl' | 'ja_nein';
export type Wert = string | number | boolean | null;
export type Werte = Record<string, Wert>;

export interface Feld {
  name: string;            // technischer Name, zugleich Spaltenname
  titel: string;           // Beschriftung in der Oberfläche
  art: FeldArt;
  pflicht?: boolean;
  optionen?: { wert: string; titel: string }[];   // nur bei art = auswahl
  gruppe?: string;         // Abschnitt in der Detailkarte
  inListe?: boolean;       // Spalte in der Tabelle
  breite?: number;         // Spaltenbreite in px
}

export interface ObjektModell {
  name: string;            // technischer Name, z. B. "kontakt"
  titel: string;
  titelMehrzahl: string;
  anzeigeFeld: string;     // Feld, mit dem ein Objekt benannt wird
  felder: Feld[];
}

export class Eingabefehler extends Error {
  constructor(public felder: Record<string, string>, text?: string) {
    super(text ?? Object.values(felder)[0] ?? 'Eingabe ungültig');
  }
}

const NAME = /^[a-z][a-z0-9_]{0,40}$/;

/** Prüft die Modellbeschreibung selbst – läuft beim Start und in den Tests. */
export function pruefeModell(m: ObjektModell): void {
  if (!NAME.test(m.name)) throw new Error(`Modellname ungültig: ${m.name}`);
  const gesehen = new Set<string>();
  for (const f of m.felder) {
    if (!NAME.test(f.name) || f.name === 'id' || f.name === 'geloescht') throw new Error(`Feldname ungültig: ${m.name}.${f.name}`);
    if (gesehen.has(f.name)) throw new Error(`Feld doppelt: ${m.name}.${f.name}`);
    gesehen.add(f.name);
    if (f.art === 'auswahl' && !f.optionen?.length) throw new Error(`Auswahl ohne Optionen: ${m.name}.${f.name}`);
  }
  if (!gesehen.has(m.anzeigeFeld)) throw new Error(`Anzeigefeld fehlt: ${m.name}.${m.anzeigeFeld}`);
}

export function leerwert(f: Feld): Wert {
  if (f.art === 'zahl') return null;
  if (f.art === 'ja_nein') return false;
  if (f.art === 'auswahl') return f.optionen![0]!.wert;
  return '';
}

function pruefeFeld(f: Feld, roh: unknown): Wert {
  switch (f.art) {
    case 'zahl': {
      if (roh === null || roh === '' || roh === undefined) return null;
      const z = typeof roh === 'number' ? roh : Number(String(roh).replace(',', '.'));
      if (!Number.isFinite(z)) throw new Error('Bitte eine Zahl eintragen');
      return z;
    }
    case 'ja_nein':
      return roh === true || roh === 'true';
    case 'auswahl': {
      const w = String(roh ?? '');
      if (!f.optionen!.some((o) => o.wert === w)) throw new Error('Bitte einen Eintrag aus der Liste wählen');
      return w;
    }
    default: {
      if (roh !== null && roh !== undefined && typeof roh !== 'string' && typeof roh !== 'number') throw new Error('Text erwartet');
      const grenze = f.art === 'langtext' ? 20000 : 300;
      let t = String(roh ?? '');
      t = f.art === 'langtext' ? t.replace(/\r\n/g, '\n').trimEnd() : t.replace(/\s+/g, ' ').trim();
      if (t.length > grenze) throw new Error(`Höchstens ${grenze} Zeichen`);
      if (f.art === 'email' && t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw new Error('Das ist keine gültige E-Mail-Adresse');
      return t;
    }
  }
}

/**
 * Prüft und bereinigt Eingaben anhand des Modells.
 * vollstaendig = true: alle Felder werden gesetzt (Anlegen), sonst nur die übergebenen (Ändern).
 */
export function pruefeWerte(m: ObjektModell, roh: Record<string, unknown> | undefined, vollstaendig: boolean): Werte {
  const aus: Werte = {};
  const fehler: Record<string, string> = {};
  const ein = roh ?? {};
  for (const k of Object.keys(ein)) {
    if (!m.felder.some((f) => f.name === k)) fehler[k] = `Unbekanntes Feld „${k}“`;
  }
  for (const f of m.felder) {
    const da = Object.prototype.hasOwnProperty.call(ein, f.name);
    if (!da && !vollstaendig) continue;
    try {
      const w = da ? pruefeFeld(f, ein[f.name]) : leerwert(f);
      if (f.pflicht && (w === '' || w === null)) throw new Error(`„${f.titel}“ darf nicht leer sein`);
      aus[f.name] = w;
    } catch (e) {
      fehler[f.name] = (e as Error).message;
    }
  }
  if (Object.keys(fehler).length) throw new Eingabefehler(fehler);
  return aus;
}
