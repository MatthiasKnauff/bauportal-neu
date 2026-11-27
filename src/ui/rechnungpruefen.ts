// Prüfung einer Rechnung – an EINER Stelle für Aufmaßprüfung, Rechnungen und „Schritt für Schritt“: der Leistungsstand, wie ihn die
// Prüfung gerade ergibt (nach Aufmaß: Stand je Position × EP des Auftrags; ohne Aufmaß: Zeilen von Hand oder der eingetragene
// Betrag), Abschließen (Aufmaß und Betrag stehen fest) und Zurücknehmen (nur die letzte geprüfte ihrer Kette).
import { createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { aktuelleRechnung, geprueft as istGeprueft, ketteVon, nachAufmass, reihe, standAus, vorige, zeilenBis } from '../module/ava/aufmass';
import { NUR_BEAUFTRAGTE, abrechenbar, leistungAus } from '../module/ava/freigabe';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { angeboteVon, epVon } from './ava';
export { epVon };
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { hinweis } from './unterbau/meldungen';

/** Gewählte Rechnung (Aufmaßprüfung, Rechnungen) – sonst die offene. */
export const [rechnungWahl, setRechnungWahl] = createSignal<string | null>(null);

export const rechnungenVon = (lvId: string) => reihe(lebende('rechnung').filter((r) => r.werte.lv === lvId));
type E = { id: string; werte: Werte };
export const zeilenDer = (r: E) => lebende('rechnungszeile').filter((z) => z.werte.rechnung === r.id);

/** Leistungsstand netto, wie die Prüfung ihn gerade ergibt (Rechnung in module/ava/freigabe.ts). */
export function leistungJetzt(r: E, ep = epVon(String(r.werte.lv ?? ''))): number {
  const lvId = String(r.werte.lv ?? '');
  return leistungAus({ rechnungen: rechnungenVon(lvId), positionen: abrechenbar(lebende('lv_position').filter((q) => q.werte.lv === lvId), lebende('nachtrag').filter((n) => n.werte.lv === lvId), NUR_BEAUFTRAGTE(sicht.buero?.[BUERO_ID]?.werte)), aufmass: lebende('aufmass').filter((a) => a.werte.lv === lvId), zeilen: zeilenDer(r) }, r, ep);
}

/** Zurücknehmen nur bei der letzten geprüften Rechnung ihrer Kette (spätere bauen sonst darauf auf). */
export function zuruecknehmbar(r: Zeile): boolean {
  if (!istGeprueft(r) || r.werte.status === 'bezahlt') return false;
  const R = rechnungenVon(String(r.werte.lv ?? '')), k = ketteVon(r);
  return k === null || !R.slice(R.findIndex((x) => x.id === r.id) + 1).some((x) => ketteVon(x) === k && istGeprueft(x));
}
const heute = () => new Date().toLocaleDateString('sv');
/** Prüfung abschließen: laufende Aufmaßzeilen gehören dann zu dieser Rechnung, der geprüfte Leistungsstand steht fest. */
export function abschliessen(r: Zeile): void {
  const lvId = String(r.werte.lv ?? ''), betrag = leistungJetzt(r);
  const laufend = nachAufmass(r) && ketteVon(r) !== null ? lebende('aufmass').filter((z) => z.werte.lv === lvId && !z.werte.rechnung) : [];
  const b: Vorlage[] = [...laufend.map((z) => ({ objekt: 'aufmass', art: 'aendern' as const, objektId: z.id, werte: { rechnung: r.id } })),
    { objekt: 'rechnung', art: 'aendern', objektId: r.id, werte: { status: 'geprueft', geprueft: betrag, geprueft_am: heute() } }];
  ausfuehrenMehrere(b, `Prüfung ${String(r.werte.nummer ?? '')} abgeschlossen`);
  hinweis(`Geprüft: Leistungsstand netto ${betrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € – ${nachAufmass(r) ? 'das Aufmaß steht fest' : 'der Betrag steht fest'}.`);
}
export function zuruecknehmen(r: Zeile): void {
  const fest = nachAufmass(r) && ketteVon(r) !== null ? lebende('aufmass').filter((z) => z.werte.rechnung === r.id) : [];
  ausfuehrenMehrere([...fest.map((z) => ({ objekt: 'aufmass', art: 'aendern' as const, objektId: z.id, werte: { rechnung: null } })),
    { objekt: 'rechnung', art: 'aendern', objektId: r.id, werte: { status: 'offen', geprueft_am: null } }], `Prüfung ${String(r.werte.nummer ?? '')} zurückgenommen`);
}

/** Alles, was Aufmaßprüfung und Karte gemeinsam brauchen – für ein LV (reaktiv). */
export function aufmassVon(lvId: () => string | undefined) {
  const rechnungen = createMemo(() => (lvId() ? rechnungenVon(lvId()!) : []));
  const r = createMemo(() => rechnungen().find((x) => x.id === rechnungWahl()) ?? aktuelleRechnung(rechnungen()));
  const zeilen = createMemo(() => (lvId() ? lebende('aufmass').filter((a) => a.werte.lv === lvId()) : []));
  const stand = createMemo(() => standAus(zeilenBis(zeilen(), rechnungen(), r())));
  const vor = createMemo(() => { const v = vorige(rechnungen(), r()); return v ? standAus(zeilenBis(zeilen(), rechnungen(), v)) : new Map<string, number>(); });
  const auftrag = createMemo(() => (lvId() ? angeboteVon(lvId()!).find((a) => a.werte.beauftragt === true) : undefined));
  const epf = createMemo(() => (lvId() ? epVon(lvId()!) : () => null));
  const ep = (q: Zeile) => epf()(q);
  const firma = createMemo(() => new Map(lebende('rechnungsmenge').filter((m) => m.werte.rechnung === r()?.id).map((m) => [String(m.werte.position), m])));
  const fest = () => !!r() && istGeprueft(r()!);
  /** Zeilen dieser Rechnung für eine Position (laufend, bei Stundenlohn: ihre eigenen). */
  const eigene = (pos: string) => zeilen().filter((z) => z.werte.position === pos && (r() && ketteVon(r()!) === null ? z.werte.rechnung === r()!.id : !z.werte.rechnung));
  return { rechnungen, r, zeilen, stand, vor, ep, firma, fest, eigene, auftrag };
}

/** Die gewählte Rechnung eines LV – sonst die offene (Aufmaßprüfung, Rechnungen, Karte rechts). */
export function gewaehlteRechnung(lvId: string): Zeile | null { const R = rechnungenVon(lvId); return R.find((x) => x.id === rechnungWahl()) ?? aktuelleRechnung(R); }
