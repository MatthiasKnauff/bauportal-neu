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

/** Betreff und Text eines Laufs mit den Angaben des LV – {anrede} bleibt für den Mail-Dialog stehen. */
export function laufText(lauf: Lauf, lv: Werte, projekt: Werte | undefined, buero: Werte | undefined): { betreff: string; text: string } {
  const lvName = `LV ${[lv.nummer, lv.name].filter(Boolean).join(' ')}`.trim();
  const v: Record<string, string> = { lv: lvName, projekt: [projekt?.nummer, projekt?.name].filter(Boolean).join(' '), bauvorhaben: String(projekt?.name ?? projekt?.nummer ?? ''),
    abgabe: tag(lv.abgabe), rueckmeldung: tag(lv.rueckmeldung_bis), signatur: String(buero?.name ?? '') };
  const fuell = (s: string) => s.replace(/\{(\w+)\}/g, (g, n: string) => (n in v ? v[n]! : g));
  return { betreff: fuell(LAEUFE[lauf].betreff).replace(/ – $/, ''), text: fuell(LAEUFE[lauf].text) };
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
