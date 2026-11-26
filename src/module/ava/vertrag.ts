// Bauvertrag aus Auftrag und Protokoll der Angebotsbesprechung (wie im bisherigen Bauportal, neu gebaut): alle Regelungen
// ausgeschrieben, zum Unterschreiben. Reine Rechnung auf Werten – angelegt wird der Vertrag einmal aus den Daten (Herkunft
// „daten“), danach ist er ein eigenes Schriftstück, das man ändern kann.
import type { Werte } from '../../kern/modell';
import { GRUNDLAGEN } from './besprechung';

export const AG_ARTEN = [{ wert: 'unternehmen', titel: 'Unternehmen / öffentliche Hand (VOB/B)' }, { wert: 'privat', titel: 'Verbraucher:in (BGB-Bauvertrag)' }];

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const anschrift = (w: Werte | undefined) => (w ? [w.name, w.strasse, [w.plz, w.ort].filter(Boolean).join(' ')].map((x) => String(x ?? '').trim()).filter(Boolean).join('\n') : '');
const zeilen = (...t: (string | false | undefined)[]) => t.filter((x): x is string => !!x && !!x.trim()).join('\n');

export interface Vertragsquellen {
  agArt: 'unternehmen' | 'privat';
  projekt?: Werte; bieter?: Werte; lv?: Werte; angebot?: Werte;
  gewerkName?: string;
  summe: number;            // vorläufige Auftragssumme netto (nach Nachlass)
  protokoll?: Werte;        // die Angebotsbesprechung mit dieser Bieter:in, wenn es eine gibt
}

export function vertragAusDaten(q: Vertragsquellen): Werte {
  const P = q.protokoll ?? {}, l = q.lv ?? {}, a = q.angebot ?? {}, p = q.projekt ?? {};
  const g = (n: string): string => String(P[n] ?? GRUNDLAGEN.find(([k]) => k === n)?.[2] ?? '').trim();
  const verbraucher = q.agArt === 'privat';
  const pd = String(P.datum ?? '');
  const best = [
    'dieser Vertrag',
    pd ? `das Protokoll der Angebotsbesprechung vom ${pd.slice(8, 10)}.${pd.slice(5, 7)}.${pd.slice(0, 4)}` : '',
    `das Leistungsverzeichnis „${String(l.name ?? '')}“ mit Vorbemerkungen${P.angebot_vom ? ` und das Angebot vom ${String(P.angebot_vom)}` : ''}`,
    P.bauzeitenplan ? `der Bauzeitenplan (${String(P.bauzeitenplan)})` : '',
    'die Ausführungspläne der Architekt:in',
    'die Allgemeinen Technischen Vertragsbedingungen für Bauleistungen (VOB/C) in der bei Vertragsschluss geltenden Fassung',
    verbraucher ? 'die Vorschriften des BGB über den Bauvertrag (§§ 650a ff. BGB)' : 'die Vergabe- und Vertragsordnung für Bauleistungen Teil B (VOB/B) in der Fassung 2016',
  ].filter(Boolean);
  const nachlass = Number(a.nachlass ?? 0), skonto = Number(a.skonto ?? 0);
  return {
    ag_art: q.agArt,
    ag: String(P.bauherr ?? p.bauherr ?? ''),
    an: anschrift(q.bieter),
    gegenstand: `${q.gewerkName || String(l.name ?? '')} für das Bauvorhaben ${[p.nummer, p.name].filter(Boolean).join(' · ')}`.trim(),
    bestandteile: `${best.map((x, i) => `${i + 1}. ${x}`).join('\n')}\nBei Widersprüchen gelten die Bestandteile in dieser Reihenfolge.`,
    verguetung: q.summe
      ? `Einheitspreisvertrag. Abgerechnet wird nach den tatsächlich ausgeführten Mengen zu den Einheitspreisen des Angebots${nachlass ? `, abzüglich ${String(nachlass).replace('.', ',')} % Nachlass` : ''}. Vorläufige Auftragssumme: ${eur(q.summe)} € netto zuzüglich der gesetzlichen Umsatzsteuer.`
      : 'Einheitspreisvertrag nach den Einheitspreisen des Angebots.',
    termine: zeilen(P.beginn ? `Beginn der Ausführung: ${String(P.beginn)}` : '', P.fertig ? `Fertigstellung: ${String(P.fertig)}` : '',
      P.bauzeitenplan ? 'Der Bauzeitenplan ist Vertragsbestandteil.' : '', g('vertragsstrafe') ? `Vertragsstrafe: ${g('vertragsstrafe')}` : ''),
    zahlung: zeilen(`Abschlagszahlungen auf Grundlage prüfbarer Aufmaße und Rechnungen${verbraucher ? '' : ' nach § 16 VOB/B'}.`
      + (skonto ? ` Bei Zahlung innerhalb von ${String(a.skonto_tage ?? '…')} Tagen nach Eingang der prüfbaren Rechnung darf die Auftraggeber:in ${String(skonto).replace('.', ',')} % Skonto abziehen.` : ''),
      g('rechnungsstellung'), g('zahlungsfrist') ? `Zahlungsfrist Abschlagsrechnungen: ${g('zahlungsfrist')}` : ''),
    sicherheiten: zeilen(g('erfuellung') ? `Vertragserfüllung: ${g('erfuellung')}` : '', g('einbehalt') ? `Mängelansprüche: ${g('einbehalt')}` : ''),
    abnahme: `Die Abnahme erfolgt förmlich${verbraucher ? '' : ' (§ 12 Abs. 4 VOB/B)'}. Verjährungsfrist für Mängelansprüche: ${g('gewaehrleistung') || (verbraucher ? '5 Jahre (§ 634a BGB)' : '4 Jahre (§ 13 Abs. 4 VOB/B)')}.`,
    weiteres: zeilen(g('bescheinigungen'), 'Die Auftragnehmer:in weist eine ausreichende Betriebshaftpflichtversicherung nach.',
      `Nachunternehmer setzt die Auftragnehmer:in nur mit vorheriger Zustimmung der Auftraggeber:in ein.${P.subunternehmer ? ` Vereinbart: ${String(P.subunternehmer)}.` : ''}`,
      g('energie') ? `Energie- und Medienkosten: ${g('energie')}` : '',
      'Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.'),
  };
}
