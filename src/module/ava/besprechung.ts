// Angebotsbesprechung aus den Daten (wie im bisherigen Bauportal, neu gebaut): jedes Feld des Protokolls hat eine Quelle –
// Projekt, Büro, Adressen (Bieter:in), Angebot, LV und Bauzeitenplan; die Vertragsgrundlagen sind die Vorgaben ab Werk.
// Reine Rechnung auf Werten – im Browser (Anlegen, Abgleich) und in den Tests gleich. Solange das Protokoll ein Entwurf ist,
// folgen Felder mit der Herkunft „daten“ ihrer Quelle; von Hand geänderte bleiben und bekommen einen Hinweis.
import type { Werte } from '../../kern/modell';

/** Vertragsgrundlagen ab Werk: (Feld, Beschriftung, Vorgabe) – wie im Vordruck des bisherigen Bauportals. */
export const GRUNDLAGEN: [string, string, string][] = [
  ['vertragsgrundlage', 'Vertragsgrundlage (VOB/BGB)', 'VOB/B (Fassung 2016)'],
  ['bescheinigungen', 'Bescheinigungen / Nachweise / Sicherheiten', 'Freistellungsbescheinigung (§ 48b EStG) wird spätestens mit Baubeginn eingereicht'],
  ['vertragsstrafe', 'Vertragsstrafe', 'keine'],
  ['erfuellung', 'Vertragserfüllungsbürgschaft', 'entfällt'],
  ['gewaehrleistung', 'Gewährleistung', '5 Jahre'],
  ['einbehalt', 'Gewährleistungseinbehalt', '5 % der Bruttoabrechnungssumme, ablösbar gegen Bürgschaft'],
  ['rechnungsstellung', 'Rechnungsstellung', 'Abschlagsrechnungen nach Aufmaß, Schlussrechnung nach Abnahme'],
  ['zahlungsfrist', 'Zahlungsfrist Abschlagsrechnungen', '21 Tage nach Zugang der prüfbaren Rechnung (§ 16 Abs. 1 Nr. 3 VOB/B)'],
  ['energie', 'Energie- / Medienkosten', 'bauseits, kostenlos'],
  ['nachunternehmer', 'Nachunternehmer', 'nur mit vorheriger Zustimmung der Auftraggeber:in'],
];
export const PREIS_VORGABE = 'Die Leistungen werden nach Einheitspreisen abgerechnet.';

const de = (iso: unknown): string => { const s = String(iso ?? ''); return /^\d{4}-\d\d-\d\d/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : ''; };
const zeilen = (...t: unknown[]) => t.map((x) => String(x ?? '').trim()).filter(Boolean).join('\n');
const anschrift = (w: Werte | undefined) => (w ? [w.strasse, [w.plz, w.ort].filter(Boolean).join(' ')].map((x) => String(x ?? '').trim()).filter(Boolean).join(', ') : '');

export interface Quellen {
  projekt?: Werte; buero?: Werte; bieter?: Werte; angebot?: Werte; lv?: Werte;
  gewerkName?: string; kostengruppe?: string;   // Namen der Verweise des LV
  termine?: { beginn?: string; fertig?: string; unterbrechung?: string; plan?: string };   // aus dem Bauzeitenplan (ISO bzw. Text)
}

/** Was die Daten heute für jedes Feld sagen – leere Quellen fehlen (dann bleibt das Feld frei). */
export function ausDenDaten(q: Quellen): Werte {
  const p = q.projekt ?? {}, b = q.buero ?? {}, k = q.bieter, a = q.angebot ?? {}, l = q.lv ?? {};
  const w: Werte = {
    bauvorhaben: zeilen([p.nummer, p.name].filter(Boolean).join(' · '), anschrift(p)),
    bauherr: String(p.bauherr ?? ''),
    architekt: zeilen(b.name, anschrift(b)),
    bieter: k ? zeilen(k.name, anschrift(k), k.ansprechpartner ? `Ansprechpartner:in: ${String(k.ansprechpartner)}` : '') : '',
    gueltig: l.bindefrist ? `ja, gebunden bis ${de(l.bindefrist)}` : '',
    angebot_vom: de(a.eingang),
    gewerke: [q.gewerkName || l.name, q.kostengruppe ? `KG ${q.kostengruppe}` : ''].filter(Boolean).join(' · '),
    nachlass: a.nachlass ? `${String(a.nachlass).replace('.', ',')} %` : '',
    skonto: a.skonto ? `${String(a.skonto).replace('.', ',')} %${a.skonto_tage ? ` binnen ${String(a.skonto_tage)} Tagen` : ''}` : '',
    preis: PREIS_VORGABE,
    beginn: de(q.termine?.beginn) || de(l.ausfuehrung_beginn),
    fertig: de(q.termine?.fertig) || de(l.ausfuehrung_ende),
    unterbrechung: q.termine?.unterbrechung ?? '',
    bauzeitenplan: q.termine?.plan ?? '',
    ...Object.fromEntries(GRUNDLAGEN.map(([n, , v]) => [n, v])),
  };
  return Object.fromEntries(Object.entries(w).filter(([, x]) => String(x ?? '').trim() !== ''));
}

/** Abgleich (Entwurf): Felder mit Herkunft „daten“ (oder noch leer) folgen ihrer Quelle; bei von Hand geänderten gibt es
 *  einen Hinweis, wenn sich die Quelle seit dem letzten Abgleich geändert hat (stand: die Quellen beim letzten Mal) –
 *  übernehmen entscheidet der Mensch. */
export function abgleich(jetzt: Werte, herkunft: Record<string, string> | undefined, daten: Werte, stand: Werte): { folgen: Werte; hinweise: { feld: string; neu: string }[] } {
  const folgen: Werte = {}, hinweise: { feld: string; neu: string }[] = [];
  for (const [f, neu] of Object.entries(daten)) {
    const alt = String(jetzt[f] ?? '');
    if (alt === String(neu)) continue;
    if (herkunft?.[f] === 'daten' || alt === '') folgen[f] = neu;
    else if (String(stand[f] ?? '') !== String(neu)) hinweise.push({ feld: f, neu: String(neu) });
  }
  return { folgen, hinweise };
}
