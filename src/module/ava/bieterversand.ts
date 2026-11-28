// Versand an Bieter:innen (wie im bisherigen Bauportal): drei Läufe – Angebotsanfrage, Erinnern, Nachversand – mit ihren
// Texten, wer vorab angehakt ist und ob die Unterlagen dabei sind. Verschickt wird über die zentrale Versandstelle
// (Postausgang); {anrede} ersetzt der Mail-Dialog je Firma, alles andere steht hier schon fest.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };
export type Lauf = 'versand' | 'erinnerung' | 'nachversand';

export const LAEUFE: Record<Lauf, { titel: string; knopf: string; betreff: string; text: string; unterlagen: boolean }> = {
  versand: { titel: 'Angebotsanfrage an Bieter:innen', knopf: 'An Bieter:innen senden', unterlagen: true,
    betreff: 'Angebotsanfrage {lv} – {projekt}',
    text: '{anrede}\n\nfür das Bauvorhaben {bauvorhaben} bitten wir um Ihr Angebot für {lv}. Das Leistungsverzeichnis liegt als PDF und als GAEB-Datei (X83) bei.\n\n'
      + 'Bitte teilen Sie uns bis {rueckmeldung} kurz mit, ob Sie ein Angebot abgeben.\nAbgabe des Angebots bis {abgabe}.\n\nMit freundlichen Grüßen\n\n{signatur}' },
  erinnerung: { titel: 'Bieter:innen erinnern', knopf: 'Erinnern', unterlagen: false,
    betreff: 'Erinnerung: Angebotsanfrage {lv} – {projekt}',
    text: '{anrede}\n\nwir möchten an unsere Anfrage zu {lv} für das Bauvorhaben {bauvorhaben} erinnern.\n\n'
      + 'Bitte teilen Sie uns bis {rueckmeldung} kurz mit, ob Sie ein Angebot abgeben.\nAbgabe des Angebots bis {abgabe}.\n\nMit freundlichen Grüßen\n\n{signatur}' },
  nachversand: { titel: 'Geänderte Unterlagen nachsenden', knopf: 'Nachversand', unterlagen: true,
    betreff: 'Geänderte Unterlagen: {lv} – {projekt}',
    text: '{anrede}\n\nzu unserer Anfrage {lv} für das Bauvorhaben {bauvorhaben} haben sich die Unterlagen geändert. Anbei der aktuelle Stand – bitte legen Sie ihn Ihrem Angebot zugrunde.\n\n'
      + 'Abgabe des Angebots bis {abgabe}.\n\nMit freundlichen Grüßen\n\n{signatur}' },
};

const tag = (iso: unknown) => { const s = String(iso ?? ''); return /^\d{4}-\d\d-\d\d/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '…'; };

const werteFuer = (lv: Werte, projekt: Werte | undefined, buero: Werte | undefined): Record<string, string> => ({
  lv: `LV ${[lv.nummer, lv.name].filter(Boolean).join(' ')}`.trim(), projekt: [projekt?.nummer, projekt?.name].filter(Boolean).join(' '), bauvorhaben: String(projekt?.name ?? projekt?.nummer ?? ''),
  abgabe: tag(lv.abgabe), rueckmeldung: tag(lv.rueckmeldung_bis), signatur: String(buero?.name ?? '') });

/** Die für dieses LV gemerkten Texte je Lauf (mit Platzhaltern) – „Text für dieses LV merken“ im Mail-Dialog. */
export function eigeneTexte(lv: Werte): Partial<Record<Lauf, { betreff: string; text: string }>> {
  try { return JSON.parse(String(lv.versand_texte || '{}')) as Partial<Record<Lauf, { betreff: string; text: string }>>; } catch { return {}; }
}

/** Betreff und Text eines Laufs mit den Angaben des LV – {anrede} bleibt für den Mail-Dialog stehen. Der für das LV gemerkte Text
 *  geht der Vorlage vor (vorlage: true – immer die Vorlage, für „↺ Text der Vorlage“). */
export function laufText(lauf: Lauf, lv: Werte, projekt: Werte | undefined, buero: Werte | undefined, vorlage = false): { betreff: string; text: string } {
  const v = werteFuer(lv, projekt, buero), q = (!vorlage && eigeneTexte(lv)[lauf]) || LAEUFE[lauf];
  const fuell = (s: string) => s.replace(/\{(\w+)\}/g, (g, n: string) => (n in v ? v[n]! : g));
  return { betreff: fuell(q.betreff).replace(/ – $/, ''), text: fuell(q.text) };
}

/** Zum Merken: was im Text für das LV steht, wird wieder Platzhalter – so stimmen Fristen und Namen auch nach einer Änderung am LV. */
export function textMerken(lauf: Lauf, lv: Werte, projekt: Werte | undefined, buero: Werte | undefined, betreff: string, text: string): string {
  const v = Object.entries(werteFuer(lv, projekt, buero)).filter(([, w]) => w && w !== '…').sort((a, b) => b[1].length - a[1].length);
  const zurueck = (s: string) => v.reduce((t, [n, w]) => t.split(w).join(`{${n}}`), s);
  return JSON.stringify({ ...eigeneTexte(lv), [lauf]: { betreff: zurueck(betreff), text: zurueck(text) } });
}

/** Ansprechpersonen einer Firma (Kontaktwege „Ansprechpartner:in“) – Name, Anrede, eigene E-Mail (sonst die der Firma). */
export interface Person { name: string; anrede: string; titel: string; email: string; funktion: string }
export function personenAus(wege: Werte[], firmaEmail: string): Person[] {
  return wege.filter((w) => w.art === 'person' && String(w.wert ?? '').trim()).map((w) => ({ name: String(w.wert).trim(), anrede: String(w.anrede ?? ''), titel: String(w.titel ?? ''),
    email: String(w.email || firmaEmail || ''), funktion: String(w.bezeichnung ?? '') }));
}
/** Anrede für eine Person (wie in den Adressen), ohne Person: „Sehr geehrte Damen und Herren,“. */
export function anredeFuer(p: Person | undefined): string {
  const nach = p?.name.split(/\s+/).at(-1) ?? '', t = p?.titel ? `${p.titel} ` : '';
  if (p?.anrede === 'Frau' && nach) return `Sehr geehrte Frau ${t}${nach},`;
  if (p?.anrede === 'Herr' && nach) return `Sehr geehrter Herr ${t}${nach},`;
  return 'Sehr geehrte Damen und Herren,';
}

/** Wer vorab angehakt ist: Versand – noch nicht angeschrieben; Erinnern – angeschrieben, ohne Angebot, noch unentschieden;
 *  Nachversand – angeschrieben, ohne Absage. Wer „gibt nicht ab“ gesagt hat, nie. */
export function vorab(lauf: Lauf, angebote: E[]): E[] {
  return angebote.filter((a) => {
    if (a.werte.rueckmeldung === 'gibt_nicht_ab') return false;
    if (lauf === 'versand') return !a.werte.angeschrieben;
    if (lauf === 'erinnerung') return !!a.werte.angeschrieben && !a.werte.eingang && a.werte.rueckmeldung !== 'will_abgeben';
    return !!a.werte.angeschrieben;
  });
}
