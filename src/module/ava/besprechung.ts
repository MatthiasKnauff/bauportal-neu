// Angebotsbesprechung aus den Daten (wie im bisherigen Bauportal, neu gebaut): jedes Feld des Protokolls hat eine Quelle –
// Projekt, Büro, Adressen (Bieter:in), Angebot, LV und Bauzeitenplan; die Vertragsgrundlagen sind die Vorgaben ab Werk.
// Reine Rechnung auf Werten – im Browser (Anlegen, Abgleich) und in den Tests gleich. Solange das Protokoll ein Entwurf ist,
// folgen Felder mit der Herkunft „daten“ ihrer Quelle; von Hand geänderte bleiben und bekommen einen Hinweis.
import { FRIST_WORT, vertragsbedingungenText } from './rechnung';
import type { Werte } from '../../kern/modell';
import { istText } from '../../kern/lvarten';

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
  klaerung?: string;   // Klärungspunkte aus dem Preisspiegel (klaerungspunkte)
}

type E = { id: string; werte: Werte };
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Klärungspunkte zu einem Angebot (wie bisher, gehen ins Protokoll): EP mehr als 30 % vom Mittel aller Bieter:innen, Bedarfs- und
 *  Wahlpositionen mit Preis, Positionen ohne Preis. ep(angebot, position) → EP oder null. */
export function klaerungspunkte(positionen: E[], angebote: E[], angebot: string, ep: (a: string, q: string) => number | null): string {
  const aus: string[] = [], ohne: string[] = [];
  const andere = angebote.filter((a) => a.werte.ausgeschlossen !== true);
  for (const q of positionen) {
    const art = String(q.werte.art ?? 'normal'); if (istText(art)) continue;
    const name = `Pos. ${String(q.werte.oz ?? '')} ${String(q.werte.kurztext ?? '')}`.trim(), e = ep(angebot, q.id);
    if (e == null) { ohne.push(String(q.werte.oz ?? '')); continue; }
    const alle = andere.map((a) => ep(a.id, q.id)).filter((x): x is number => x != null);
    const mittel = alle.length > 1 ? alle.reduce((s, x) => s + x, 0) / alle.length : null;
    if (mittel && Math.abs(e / mittel - 1) > 0.3) aus.push(`${name}: EP ${eur(e)} € – ${Math.round(Math.abs(e / mittel - 1) * 100)} % ${e > mittel ? 'über' : 'unter'} dem Mittel (${eur(mittel)} €)`);
    if (art === 'bedarf' || art === 'alternativ') aus.push(`${name}: ${art === 'bedarf' ? 'Bedarfsposition' : 'Wahlposition'} – wird sie beauftragt? (EP ${eur(e)} €)`);
  }
  if (ohne.length) aus.push(`Ohne Preis: ${ohne.slice(0, 8).join(', ')}${ohne.length > 8 ? ` und ${ohne.length - 8} weitere` : ''}`);
  return aus.map((t) => `• ${t}`).join('\n');
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
    skonto: a.skonto ? `${String(a.skonto).replace('.', ',')} %${a.skonto_tage ? ` binnen ${String(a.skonto_tage)} ${FRIST_WORT[String(a.skonto_art ?? 'kt')] ?? 'Tagen'}` : ''}` : '',
    preis: PREIS_VORGABE,
    klaerung: q.klaerung ?? '',
    beginn: de(q.termine?.beginn) || de(l.ausfuehrung_beginn),
    fertig: de(q.termine?.fertig) || de(l.ausfuehrung_ende),
    unterbrechung: q.termine?.unterbrechung ?? '',
    bauzeitenplan: q.termine?.plan ?? '',
    ...Object.fromEntries(GRUNDLAGEN.map(([n, , v]) => [n, v])),
    ...vertragsbedingungenText(l),   // was im LV unter „Vertragsbedingungen“ steht, geht der Vorgabe vor
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
