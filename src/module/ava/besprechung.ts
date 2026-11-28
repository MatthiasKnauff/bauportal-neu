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
  bauherr?: Werte;   // Kontakt der Bauherr:in (Projektdaten)
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
    bauherr: q.bauherr ? zeilen(q.bauherr.name, anschrift(q.bauherr)) : '',
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
    ...Object.fromEntries(GRUNDLAGEN.map(([n, , v]) => [n, String(b[`bv_${n}`] ?? '').trim() || v])),   // Vorgabe des Büros, sonst ab Werk
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

// ---------- Abschließen: was im Gespräch geklärt wurde, zurück in Adressen und LV (wie bisher, je Zeile ein Haken) ----------
const RECHTSFORMEN = ['GmbH & Co. KG', 'gGmbH', 'GmbH', 'UG (haftungsbeschränkt)', 'UG', 'AG', 'KG', 'OHG', 'GbR', 'e. K.', 'e.K.', 'eG', 'Einzelunternehmen'];
/** „GmbH, Sitz Essen, HRB 12345 AG Essen“ → Rechtsform, Sitz, Handelsregister (was erkennbar ist). */
export function firmaLesen(text: unknown): { rechtsform?: string; sitz?: string; hrb?: string } {
  let t = String(text ?? '').trim(); if (!t) return {};
  const aus: { rechtsform?: string; sitz?: string; hrb?: string } = {};
  const h = /\bHR[AB]\s*\d+[^,;\n]*/i.exec(t); if (h) { aus.hrb = h[0].trim(); t = t.replace(h[0], ''); }
  const r = RECHTSFORMEN.find((x) => new RegExp(`(^|[\\s,;])${x.replace(/[.()&]/g, (c) => `\\${c}`)}(?=$|[\\s,;])`).test(t));
  if (r) { aus.rechtsform = r; t = t.replace(r, ''); }
  const s = t.replace(/\bSitz\b:?/i, '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).join(', ');
  if (s) aus.sitz = s;
  return aus;
}
/** „12.03.2027“, „2027-03-12“ oder „KW 10/2027“ → ISO-Datum (KW: Montag, beim Ende Freitag); sonst ''. */
export function datumAus(text: unknown, ende = false): string {
  const t = String(text ?? '');
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t); if (iso) return iso[0];
  const de = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t); if (de) return `${de[3]}-${de[2]!.padStart(2, '0')}-${de[1]!.padStart(2, '0')}`;
  const kw = /KW\s*(\d{1,2})\s*\/\s*(\d{4})/i.exec(t);
  if (kw) {   // ISO-Woche: der Donnerstag liegt im Jahr; Montag der Woche 1 ist der Montag vor (oder am) 4. Januar
    const j = Number(kw[2]), w = Number(kw[1]); if (w < 1 || w > 53) return '';
    const vier = new Date(Date.UTC(j, 0, 4)), mo = new Date(vier.getTime() - ((vier.getUTCDay() + 6) % 7) * 864e5);
    const d = new Date(mo.getTime() + ((w - 1) * 7 + (ende ? 4 : 0)) * 864e5);
    return d.toISOString().slice(0, 10);
  }
  return '';
}
export interface Rueckweg { id: string; objekt: 'kontakt' | 'lv'; objektId: string; feld: string; ziel: string; titel: string; alt: string; neu: string; wert: string | number }
/** Die Zeilen beim Abschließen: Firmenangaben in die Adressen, nach der Vergabe die Ausführungszeit ins LV – nur was sich ändert. */
export function rueckweg(protokoll: Werte, bieter: { id: string; werte: Werte } | undefined, lv: { id: string; werte: Werte } | undefined, beauftragt: boolean): Rueckweg[] {
  const aus: Rueckweg[] = [];
  const dazu = (objekt: Rueckweg['objekt'], z: { id: string; werte: Werte }, ziel: string, feld: string, titel: string, wert: string | number, anzeige = String(wert)) => {
    const alt = z.werte[feld];
    if (wert === '' || String(alt ?? '') === String(wert)) return;
    aus.push({ id: `${objekt}.${feld}`, objekt, objektId: z.id, feld, ziel, titel, alt: alt == null || alt === '' ? '–' : String(objekt === 'lv' ? deIso(alt) : alt), neu: anzeige, wert });
  };
  if (bieter) {
    const k = `Adressen · ${String(bieter.werte.name ?? '')}`, f = firmaLesen(protokoll.rechtsform);
    if (f.rechtsform) dazu('kontakt', bieter, k, 'rechtsform', 'Rechtsform', f.rechtsform);
    if (f.sitz) dazu('kontakt', bieter, k, 'sitz', 'Sitz / Registergericht', f.sitz);
    if (f.hrb) dazu('kontakt', bieter, k, 'hrb', 'Handelsregister', f.hrb);
    const ma = /\d[\d.]*/.exec(String(protokoll.mitarbeiter ?? ''))?.[0]?.replace(/\./g, '');
    if (ma) dazu('kontakt', bieter, k, 'mitarbeiter', 'Mitarbeiter:innen', Number(ma));
  }
  if (lv && beauftragt) {
    const z = `LV ${[lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ')}`;
    const b = datumAus(protokoll.beginn), e = datumAus(protokoll.fertig, true);
    if (b) dazu('lv', lv, z, 'ausfuehrung_beginn', 'Ausführung ab', b, deIso(b));
    if (e) dazu('lv', lv, z, 'ausfuehrung_ende', 'Ausführung bis', e, deIso(e));
  }
  return aus;
}
const deIso = (iso: unknown) => de(iso) || String(iso ?? '');
