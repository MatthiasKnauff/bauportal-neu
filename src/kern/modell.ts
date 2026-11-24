// Datenmodell: Jedes Objekt wird hier EINMAL beschrieben.
// Daraus entstehen die Tabelle in der Datenbank, die Prüfung der Eingaben,
// die Befehle und die Masken und Tabellen der Oberfläche.

export type FeldArt = 'text' | 'langtext' | 'auswahl' | 'email' | 'telefon' | 'zahl' | 'ja_nein' | 'verweis' | 'datum' | 'mehrfach';
export type Wert = string | number | boolean | null;
export type Werte = Record<string, Wert>;

export interface Feld {
  name: string;            // technischer Name, zugleich Spaltenname
  titel: string;           // Beschriftung in der Oberfläche
  art: FeldArt;
  pflicht?: boolean;
  optionen?: { wert: string; titel: string }[];   // bei art = auswahl (eine) und mehrfach (mehrere, gespeichert als „a,b“ in der Reihenfolge der Optionen)
  wenn?: Record<string, string[]>;   // Feld gilt nur, wenn ein anderes Feld (auswahl, mehrfach) einen dieser Werte hat
  gruppe?: string;         // Abschnitt in der Detailkarte
  inListe?: boolean;       // Spalte in der Tabelle
  breite?: number;         // Spaltenbreite in px
  ziel?: string;           // nur bei art = verweis: Name des Objekts, auf das verwiesen wird
  eindeutig?: boolean;     // Wert darf nur einmal vorkommen
  klein?: boolean;         // Text wird in Kleinbuchstaben gespeichert (z. B. Anmeldename)
}

export type Rechtart = 'lesen' | 'schreiben' | 'loeschen';

export interface ObjektModell {
  name: string;            // technischer Name, z. B. "kontakt"
  titel: string;
  titelMehrzahl: string;
  anzeigeFeld: string;     // Feld, mit dem ein Objekt benannt wird
  felder: Feld[];
  /** Wer darf was – Vorgabe ab Werk. Das Büro kann sie in der Verwaltung ändern. Administrator:innen dürfen immer alles. */
  rechte: Record<Rechtart, string[]>;
  /** Gehört das Objekt zu einem Projekt? Dann: Name des Feldes mit dem Projekt ("id" beim Projekt selbst). Sichtbar nur für Projektmitglieder. */
  projektFeld?: string;
  /** Gehört das Objekt zu einer Version (z. B. Vorgänge eines Bauzeitenplans)? Dann: Name des Versionsbereichs. Das Objekt braucht ein Feld „version“. */
  versionsBereich?: string;
  /** Feste Kennung, wenn es das Objekt genau einmal gibt (z. B. die Bürodaten). */
  einzeln?: string;
}

export class Eingabefehler extends Error {
  constructor(public felder: Record<string, string>, text?: string) {
    super(text ?? Object.values(felder)[0] ?? 'Eingabe ungültig');
  }
}

const NAME = /^[a-z][a-z0-9_]{0,40}$/;
export const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prüft die Modellbeschreibung selbst – läuft beim Start und in den Tests. */
export function pruefeModell(m: ObjektModell): void {
  if (!NAME.test(m.name)) throw new Error(`Modellname ungültig: ${m.name}`);
  const gesehen = new Set<string>();
  for (const f of m.felder) {
    if (!NAME.test(f.name) || f.name === 'id' || f.name === 'geloescht') throw new Error(`Feldname ungültig: ${m.name}.${f.name}`);
    if (gesehen.has(f.name)) throw new Error(`Feld doppelt: ${m.name}.${f.name}`);
    gesehen.add(f.name);
    if ((f.art === 'auswahl' || f.art === 'mehrfach') && !f.optionen?.length) throw new Error(`Auswahl ohne Optionen: ${m.name}.${f.name}`);
    if (f.art === 'verweis' && !f.ziel) throw new Error(`Verweis ohne Ziel: ${m.name}.${f.name}`);
  }
  for (const f of m.felder) for (const k of Object.keys(f.wenn ?? {})) if (!gesehen.has(k)) throw new Error(`Bedingung auf unbekanntes Feld: ${m.name}.${f.name} → ${k}`);
  if (!gesehen.has(m.anzeigeFeld)) throw new Error(`Anzeigefeld fehlt: ${m.name}.${m.anzeigeFeld}`);
  if (m.versionsBereich && !gesehen.has('version')) throw new Error(`Versioniertes Objekt ohne Feld „version“: ${m.name}`);
  if (m.projektFeld && m.projektFeld !== 'id' && !gesehen.has(m.projektFeld)) throw new Error(`Projektfeld fehlt: ${m.name}.${m.projektFeld}`);
}

/** Gilt das Feld bei diesen Werten? (Bedingung „wenn“ – z. B. Fragen, die nur beim Bauen im Bestand Sinn haben) */
export function gilt(f: Feld, werte: Werte): boolean {
  return Object.entries(f.wenn ?? {}).every(([k, erlaubt]) => String(werte[k] ?? '').split(',').some((w) => erlaubt.includes(w)));
}

export function leerwert(f: Feld): Wert {
  if (f.art === 'zahl' || f.art === 'verweis') return null;
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
    case 'datum': {
      if (roh === null || roh === '' || roh === undefined) return '';
      const t = String(roh);
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      if (!d || new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) !== t) throw new Error('Bitte ein Datum eintragen');
      return t;
    }
    case 'verweis': {
      if (roh === null || roh === '' || roh === undefined) return null;
      if (typeof roh !== 'string' || !KENNUNG.test(roh)) throw new Error('Ungültiger Verweis');
      return roh.toLowerCase();
    }
    case 'mehrfach': {
      if (roh !== null && roh !== undefined && typeof roh !== 'string') throw new Error('Auswahl erwartet');
      const teile = (roh ?? '').split(',').filter(Boolean);
      if (teile.some((w) => !f.optionen!.some((o) => o.wert === w))) throw new Error('Bitte Einträge aus der Liste wählen');
      return f.optionen!.filter((o) => teile.includes(o.wert)).map((o) => o.wert).join(',');
    }
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
      if (f.klein) t = t.toLowerCase();
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
