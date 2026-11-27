// Datenmodell: Jedes Objekt wird hier EINMAL beschrieben.
// Daraus entstehen die Tabelle in der Datenbank, die Prüfung der Eingaben,
// die Befehle und die Masken und Tabellen der Oberfläche.

export type FeldArt = 'text' | 'langtext' | 'auswahl' | 'email' | 'telefon' | 'zahl' | 'ja_nein' | 'verweis' | 'datum' | 'mehrfach' | 'schlagworte';
export type Wert = string | number | boolean | null;
export type Werte = Record<string, Wert>;

export interface Feld {
  name: string;            // technischer Name, zugleich Spaltenname
  titel: string;           // Beschriftung in der Oberfläche
  art: FeldArt;
  pflicht?: boolean;
  optionen?: { wert: string; titel: string }[];   // bei art = auswahl (eine) und mehrfach (mehrere, gespeichert als „a,b“ in der Reihenfolge der Optionen)
  wenn?: Record<string, string[]>;   // Feld gilt nur, wenn ein anderes Feld (auswahl, mehrfach) einen dieser Werte hat – „eigen“ steht für eigene Werte (s. eigeneWerte)
  eigeneWerte?: boolean;   // bei art = auswahl: außer den Optionen auch eigene Werte (z. B. eigene Kontaktarten) – sie erscheinen danach in der Auswahl
  vorschlagen?: boolean;   // bei Text: beim Tippen schlägt das Feld vor, was an anderen Einträgen schon steht (bei Listen „a, b“ je Teil)
  gruppe?: string;         // Abschnitt in der Detailkarte
  inListe?: boolean;       // Spalte in der Tabelle (ab Werk gezeigt)
  spalte?: boolean;        // als Spalte wählbar, ab Werk aus (nur was als Spalte Sinn ergibt – nicht jedes Feld der Karte)
  breite?: number;         // Spaltenbreite in px
  kartenBreite?: number;   // Breite in der Karte in Sechsteln (ab Werk 3 = halbe Breite; 6 = ganze), z. B. Anrede 1, Name 3
  ziel?: string;           // nur bei art = verweis: Name des Objekts, auf das verwiesen wird
  zuerst?: { feld: string; ziel: string };   // bei Verweis: oben die Ziele, deren Feld „ziel“ den Wert des eigenen Felds „feld“ enthält (z. B. Firmen des Gewerks)
  eindeutig?: boolean;     // Wert darf nur einmal vorkommen
  klein?: boolean;         // Text wird in Kleinbuchstaben gespeichert (z. B. Anmeldename)
  verborgen?: boolean;     // führt das Programm selbst (z. B. die Reihenfolge) – steht in keiner Karte
  einheit?: string;        // bei art = zahl: Feld mit der Einheit dieser Menge – die Tabelle zeigt dann unten die Summe der gezeigten Zeilen
}

export type Rechtart = 'lesen' | 'schreiben' | 'loeschen';

export interface ObjektModell {
  name: string;            // technischer Name, z. B. "kontakt"
  titel: string;
  titelMehrzahl: string;
  anzeigeFeld: string;     // Feld, mit dem ein Objekt benannt wird
  /** Benennt das Objekt, solange das Anzeigefeld leer ist (z. B. Nr. und Datum beim Tagesbericht ohne Kurzbeschreibung). */
  ersatzName?: string[];
  /** Spalte, nach der Listen ab Werk sortiert sind (sonst das Anzeigefeld), z. B. die Ordnungszahl der Positionen. */
  sortierFeld?: string;
  /** Gehört jeder Eintrag einem Benutzer (z. B. Favoriten)? Dann: Name des Verweisfelds auf den Benutzer – nur er sieht und ändert seine Einträge. */
  eigenFeld?: string;
  /** Abschnitte der Karte, die zunächst zugeklappt sind (z. B. „Firma / Rechnung“ bei Adressen). */
  eingeklappt?: string[];
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
  for (const k of m.ersatzName ?? []) if (!gesehen.has(k)) throw new Error(`Ersatzname auf unbekanntes Feld: ${m.name}.${k}`);
  if (m.eigenFeld && m.felder.find((f) => f.name === m.eigenFeld)?.ziel !== 'benutzer') throw new Error(`Eigenfeld muss auf Benutzer verweisen: ${m.name}.${m.eigenFeld}`);
  if (!gesehen.has(m.anzeigeFeld)) throw new Error(`Anzeigefeld fehlt: ${m.name}.${m.anzeigeFeld}`);
  if (m.versionsBereich && !gesehen.has('version')) throw new Error(`Versioniertes Objekt ohne Feld „version“: ${m.name}`);
  if (m.projektFeld && m.projektFeld !== 'id' && !gesehen.has(m.projektFeld)) throw new Error(`Projektfeld fehlt: ${m.name}.${m.projektFeld}`);
}

/** Gilt das Feld bei diesen Werten? (Bedingung „wenn“ – z. B. Fragen, die nur beim Bauen im Bestand Sinn haben) */
/** Gilt das Feld bei diesen Werten? Ein eigener Wert (Feld mit eigeneWerte, Wert nicht unter den Optionen) zählt als „eigen“. */
export function gilt(f: Feld, werte: Werte, m?: ObjektModell): boolean {
  return Object.entries(f.wenn ?? {}).every(([k, erlaubt]) => {
    const bezug = m?.felder.find((x) => x.name === k);
    return String(werte[k] ?? '').split(',').some((w) => erlaubt.includes(w) || (erlaubt.includes('eigen') && !!w && !!bezug?.eigeneWerte && !bezug.optionen!.some((o) => o.wert === w)));
  });
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
    case 'schlagworte': {   // freie Stichwörter, gespeichert als „a, b“ – ohne Doppelte (Groß/klein gleich)
      if (roh !== null && roh !== undefined && typeof roh !== 'string') throw new Error('Text erwartet');
      const aus: string[] = [];
      for (const x of (roh ?? '').replace(/;/g, ',').split(',')) { const t = x.replace(/\s+/g, ' ').trim(); if (t && !aus.some((y) => y.toLowerCase() === t.toLowerCase())) aus.push(t); }
      const s = aus.join(', '); if (s.length > 2000) throw new Error('Höchstens 2000 Zeichen'); return s;
    }
    case 'auswahl': {
      const w = String(roh ?? '').replace(/\s+/g, ' ').trim();
      if (f.optionen!.some((o) => o.wert === w)) return w;
      if (f.eigeneWerte && w && w.length <= 60) return w;
      throw new Error('Bitte einen Eintrag aus der Liste wählen');
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

/** Summe einer Menge über die gezeigten Einträge, je Einheit (leere Mengen zählen nicht). Nur wenn es eine Einheit ist,
 *  ist die Summe sinnvoll – die Tabelle zeigt sie dann; bei mehreren nennt sie „Einheiten gemischt“. */
export function mengenSumme(werte: Werte[], f: Feld): { einheit: string; summe: number; anzahl: number }[] {
  const je = new Map<string, { summe: number; anzahl: number }>();
  for (const w of werte) {
    const x = w[f.name];
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    const e = String(w[f.einheit ?? ''] ?? '');
    const s = je.get(e) ?? je.set(e, { summe: 0, anzahl: 0 }).get(e)!;
    s.summe += x; s.anzahl++;
  }
  return [...je].map(([einheit, s]) => ({ einheit, summe: Math.round(s.summe * 1000) / 1000, anzahl: s.anzahl }));
}
