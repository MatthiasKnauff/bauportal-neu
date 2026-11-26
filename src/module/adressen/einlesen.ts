// Adressen einlesen (wie im bisherigen Bauportal): Spalten einer Tabelle den Feldern eines Kontakts zuordnen, je Zeile ein
// Kontakt; schon vorhandene (gleicher Name oder gleiche E-Mail) werden erkannt – ergänzen, überspringen oder doppelt anlegen.
// Reine Rechnung, im Browser und in den Tests gleich.
import type { Werte } from '../../kern/modell';

/** Felder, in die eine Spalte gehen kann – mit Spaltennamen, an denen sie erkannt werden (klein geschrieben). */
export const ZIELE: { feld: string; titel: string; namen: string[] }[] = [
  { feld: 'name', titel: 'Firma / Name', namen: ['firma', 'name', 'firmenname', 'unternehmen', 'name1', 'bezeichnung', 'kontakt'] },
  { feld: 'ansprechpartner', titel: 'Ansprechpartner:in', namen: ['ansprechpartner', 'ansprechpartner:in', 'ansprechpartnerin', 'kontaktperson', 'vorname name', 'person'] },
  { feld: 'anrede', titel: 'Anrede', namen: ['anrede'] },
  { feld: 'gewerk', titel: 'Gewerk bzw. Amt', namen: ['gewerk', 'branche', 'gewerke', 'amt', 'leistung'] },
  { feld: 'strasse', titel: 'Straße, Nr.', namen: ['straße', 'strasse', 'str', 'str.', 'adresse', 'anschrift', 'straße und hausnummer'] },
  { feld: 'plz', titel: 'PLZ', namen: ['plz', 'postleitzahl'] },
  { feld: 'ort', titel: 'Ort', namen: ['ort', 'stadt', 'wohnort'] },
  { feld: 'telefon', titel: 'Telefon', namen: ['telefon', 'tel', 'tel.', 'telefonnummer', 'fon', 'festnetz'] },
  { feld: 'mobil', titel: 'Mobil', namen: ['mobil', 'handy', 'mobiltelefon', 'mobilnummer'] },
  { feld: 'email', titel: 'E-Mail', namen: ['e-mail', 'email', 'mail', 'e-mail-adresse'] },
  { feld: 'web', titel: 'Internet', namen: ['internet', 'web', 'webseite', 'homepage', 'www', 'url'] },
  { feld: 'stichworte', titel: 'Stichwörter', namen: ['stichwörter', 'stichworte', 'schlagworte'] },
  { feld: 'notiz', titel: 'Notiz', namen: ['notiz', 'bemerkung', 'kommentar', 'hinweis'] },
];

/** Vorschlag: je Spalte das Feld, dessen Name passt ('' = nicht einlesen); jedes Feld höchstens einmal. */
export function zuordnungVorschlagen(kopf: string[]): string[] {
  const vergeben = new Set<string>();
  return kopf.map((k) => {
    const n = k.trim().toLowerCase().replace(/\s+/g, ' ');
    const z = ZIELE.find((x) => !vergeben.has(x.feld) && x.namen.includes(n));
    if (z) vergeben.add(z.feld);
    return z?.feld ?? '';
  });
}

export type Aktion = 'neu' | 'ergaenzen' | 'ueberspringen' | 'doppelt';
export interface Vorschlag { werte: Werte; vorhanden?: string; aktion: Aktion }

const gleich = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase() && String(a ?? '').trim() !== '';

/** Aus den Zeilen Kontakte – und ob es sie schon gibt (gleicher Name oder gleiche E-Mail): dann „ergänzen“ vorgeschlagen. */
export function kontakteAus(zeilen: string[][], zuordnung: string[], vorhanden: { id: string; werte: Werte }[]): Vorschlag[] {
  return zeilen.map((z): Vorschlag => {
    const werte: Werte = {};
    zuordnung.forEach((f, i) => { const v = (z[i] ?? '').trim(); if (f && v) werte[f] = werte[f] ? `${String(werte[f])} ${v}` : v; });
    if (!werte.name && werte.ansprechpartner) werte.name = werte.ansprechpartner;
    if (werte.anrede) { const a = String(werte.anrede); if (/^herr/i.test(a)) werte.anrede = 'Herr'; else if (/^frau/i.test(a)) werte.anrede = 'Frau'; else delete werte.anrede; }
    const da = vorhanden.find((k) => gleich(k.werte.name, werte.name) || (werte.email && gleich(k.werte.email, werte.email)));
    const alle: Werte = { art: 'firma', ...werte };
    return { werte: alle, vorhanden: da?.id, aktion: da ? 'ergaenzen' : 'neu' };
  }).filter((v) => v.werte.name);
}

/** Ergänzen heißt: nur leere Felder füllen – was im Bauportal schon steht, bleibt. */
export function ergaenzung(alt: Werte, neu: Werte): Werte {
  return Object.fromEntries(Object.entries(neu).filter(([k, v]) => k !== 'art' && v !== '' && v != null && (alt[k] == null || alt[k] === '')));
}
