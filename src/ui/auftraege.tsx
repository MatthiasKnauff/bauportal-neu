// Aufträge (wie im bisherigen Bauportal): derselbe LV-Baum wie im LV und im Preisspiegel (Baustein in lvbearbeiten.tsx), mit den
// Spalten des Auftrags – EP Auftrag (beauftragtes Angebot, bei Nachträgen ihr eigener EP), EP der Schätzung zum Vergleich, GP und
// abgerechnet (geprüfte Mengen × EP Auftrag). Nachträge stehen als Gliederungspunkt „N1 …“ mit ihren Positionen im Baum.
// Oben: Nachtrag (Gliederungspunkt, Position), Vertrag (Bauvertrag, Vergabe aufheben). Rechts die Karte des Auftrags.
import { createMemo, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { standAus, zeilenBis } from '../module/ava/aufmass';
import { istZuschlag, lvMenge, naechsteOz, zaehlt, zahl } from '../module/ava/rechnung';
import { angeboteVon, gpMit, lvZahlen, nachtragNeu, preiseVon } from './avadaten';
import { lvVon } from './avakopf';
import type { Mitte } from './baukasten/anpassung';
import { LV_SPALTEN, LvBaum, lvSpalteLesen, eur, lvZeiger, setLvZeiger, zahlAus, zahlText, type BaumSpalte, type FussZeile } from './lvbearbeiten';
import { bauvertragOeffnen } from './besprechung';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';


/** Nachtrag anlegen (Aufträge, Aufmaßprüfung): „N1“ mit Gliederungspunkt, auf Wunsch gleich mit einer Position darunter. */
export function nachtragAnlegen(lv: Zeile, name: string, position?: Record<string, Wert>): { nr: string; id: string; titel: string; position?: string } {
  const { id, nr, befehl } = nachtragNeu(lv, name), titel = neueKennung(), pos = position ? neueKennung() : undefined;
  const p = lv.werte.projekt ?? null;
  ausfuehrenMehrere([
    befehl,
    { objekt: 'lv_position', art: 'anlegen', objektId: titel, werte: { projekt: p, lv: lv.id, nachtrag: id, oz: nr, art: 'titel', kurztext: name } },
    ...(position ? [{ objekt: 'lv_position', art: 'anlegen' as const, objektId: pos!, werte: { projekt: p, lv: lv.id, nachtrag: id, oz: `${nr}.0010`, art: 'normal', ...position } }] : []),
  ], `Nachtrag ${nr}`);
  return { nr, id, titel, position: pos };
}

export function Auftraege(m: Mitte): JSX.Element {
  const lv = () => lvVon(m);
  const auftrag = createMemo(() => (lv() ? angeboteVon(lv()!.id).find((a) => a.werte.beauftragt === true) : undefined));
  const preise = createMemo(() => (auftrag() ? preiseVon([auftrag()!]) : new Map<string, Zeile>()));
  /** EP des Auftrags: Positionen der Ausschreibung aus dem beauftragten Angebot, Nachtragspositionen ihr eigener EP. */
  const epAuftrag = (q: Zeile): number | null => {
    if (q.werte.nachtrag) return q.werte.ep != null && q.werte.ep !== '' ? zahl(q.werte.ep) : null;
    const x = preise().get(`${auftrag()?.id}:${q.id}`); return x && x.werte.ep != null && x.werte.ep !== '' ? zahl(x.werte.ep) : null;
  };
  // abgerechnet: Stand des Aufmaßes (alle Rechnungen und das laufende) – wie die Kennzahl „Leistungsstand“
  const stand = createMemo(() => standAus(zeilenBis(lebende('aufmass').filter((a) => a.werte.lv === lv()?.id), lebende('rechnung').filter((r) => r.werte.lv === lv()?.id), null)));
  const geprueft = (q: Zeile) => stand().get(q.id) ?? null;
  // Ein beauftragter Nachtrag ist Vertragsinhalt wie der Hauptauftrag (wie bisher einzeln gesperrt) – erst den Stand zurücksetzen
  const ntBeauftragt = (q: Zeile) => sicht.nachtrag?.[String(q.werte.nachtrag ?? '')]?.werte.stand === 'beauftragt';
  const GESPERRT = 'Der Nachtrag ist beauftragt – Vertragsinhalt. Ändern erst, wenn sein Stand (rechts in der Karte) zurückgesetzt ist.';
  const abgelehnt = (q: Zeile) => sicht.nachtrag?.[String(q.werte.nachtrag ?? '')]?.werte.stand === 'abgelehnt';
  const nt = (q: Zeile) => !!q.werte.nachtrag && !ntBeauftragt(q) && darf('lv_position', 'schreiben');
  const aendern = (q: Zeile, werte: Record<string, unknown>, titel: string) => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: q.id, werte: werte as never }, titel);
  const nurNachtrag = (s: BaumSpalte): BaumSpalte => ({ ...s, setzen: (q, t) => (!q.werte.nachtrag ? 'Positionen des Auftrags sind Vertragsinhalt – Änderungen als Nachtrag.' : ntBeauftragt(q) ? GESPERRT : s.setzen!(q, t)) });
  const spalten = (): BaumSpalte[] => [
    nurNachtrag(LV_SPALTEN.find((s) => s.id === 'menge')!), nurNachtrag(LV_SPALTEN.find((s) => s.id === 'einheit')!), lvSpalteLesen('art'),
    { ...nurNachtrag(LV_SPALTEN.find((s) => s.id === 'kg')!), aus: true },
    { id: 'ep_auftrag', titel: 'EP Auftrag', breite: 94, rechts: true, hilfe: 'Einheitspreis des Auftrags – bei Nachtragspositionen der Nachtragspreis (hier änderbar)',
      wert: (q) => { const e = epAuftrag(q); return e == null ? '' : eur(e); }, roh: (q) => zahlText(epAuftrag(q)),
      setzen: (q, t) => { if (q.werte.nachtrag && ntBeauftragt(q)) return GESPERRT; if (!nt(q)) return 'Der EP des Auftrags kommt aus dem beauftragten Angebot – Änderungen als Nachtrag.'; const n = zahlAus(t); if (typeof n === 'string') return n; aendern(q, { ep: n }, 'Nachtragspreis'); } },
    { id: 'ep_schaetz', titel: 'EP Schätz.', aus: true, breite: 84, rechts: true, wert: (q) => (q.werte.nachtrag || q.werte.ep == null || q.werte.ep === '' ? '' : eur(zahl(q.werte.ep))) },
    { id: 'gp_auftrag', titel: 'GP', breite: 98, rechts: true, wert: (q) => { const e = epAuftrag(q); return e == null || !zaehlt(q) ? '' : eur(gpMit(q, lvMenge, epAuftrag)); },
      summe: (pos) => pos.filter(zaehlt).reduce((s, q) => s + gpMit(q, lvMenge, epAuftrag), 0) },
    // Prognose wie bisher: was voraussichtlich kommt – Auftrag und Nachträge außer abgelehnten (vor Nachlass, je Zeile und als Summe)
    { id: 'prognose', titel: 'Prognose', breite: 98, rechts: true, hilfe: 'Auftrag und Nachträge (beauftragt und offen), ohne abgelehnte',
      wert: (q) => { const e = epAuftrag(q); return e == null || !zaehlt(q) || abgelehnt(q) ? '' : eur(gpMit(q, lvMenge, epAuftrag)); },
      summe: (pos) => pos.filter((q) => zaehlt(q) && !abgelehnt(q)).reduce((s, q) => s + gpMit(q, lvMenge, epAuftrag), 0) },
    { id: 'abgerechnet', titel: 'abgerechnet', aus: true, breite: 98, rechts: true, hilfe: 'geprüfte Menge (Aufmaß) × EP Auftrag', wert: (q) => { const g = geprueft(q), e = epAuftrag(q); return (g == null && !istZuschlag(q.werte.art)) || e == null || !zaehlt(q) ? '' : eur(gpMit(q, (y) => geprueft(y) ?? 0, epAuftrag)); },
      summe: (pos) => pos.filter(zaehlt).reduce((s, q) => { return s + gpMit(q, (y) => geprueft(y) ?? 0, epAuftrag); }, 0) },
  ];
  const z = createMemo(() => (lv() ? lvZahlen(lv()!.id) : undefined));
  const zeile = (titel: string, n: () => number | null | undefined, klasse?: string): FussZeile => ({ titel, klasse, wert: (s) => (s.id === 'gp_auftrag' && n() != null ? eur(n()!) : '') });
  const fuss = (): FussZeile[] => [
    { titel: 'Summe netto', wert: (s, pos) => { const n = s.summe?.(pos); return n == null ? '' : eur(n); } },
    ...(z()?.nachlass ? [zeile(`Hauptauftrag nach Nachlass ${String(z()!.nachlass).replace('.', ',')} %`, () => z()?.haupt)] : []),
    zeile('Auftrag aktuell (mit beauftragten Nachträgen)', () => z()?.stand.aktuell, 'stark'),
    zeile('Prognose (dazu offene Nachträge)', () => z()?.stand.prognose),
  ];
  // ---------- Nachträge anlegen (Gliederungspunkt „N1 …“ und Positionen darunter) ----------
  const nachtraege = () => (lv() ? lebende('nachtrag').filter((n) => n.werte.lv === lv()!.id) : []);
  const ntGliederung = () => {
    if (!lv() || !auftrag()) return;
    const n = nachtragAnlegen(lv()!, 'Neuer Nachtrag');
    setLvZeiger(n.titel);
    hinweis(`Nachtrag ${n.nr} angelegt – Bezeichnung in der Zeile ändern, dann „Position“ für die Leistungen; Stand rechts in der Karte.`);
  };
  /** Nachtrag der markierten Zeile (sonst der letzte). */
  const ntVonZeile = () => { const q = sicht.lv_position?.[lvZeiger() ?? '']; const id = q?.werte.nachtrag; return (id && sicht.nachtrag?.[String(id)]) || nachtraege().sort((a, b) => String(a.werte.nummer).localeCompare(String(b.werte.nummer), 'de', { numeric: true })).at(-1); };
  const ntPosition = () => {
    const n = ntVonZeile(); if (!lv() || !n) { hinweis('Erst einen Nachtrag anlegen („Gliederungspunkt“).', { art: 'fehler' }); return; }
    if (n.werte.stand === 'beauftragt') { hinweis(`${String(n.werte.nummer ?? 'Der Nachtrag')} ist beauftragt – für weitere Leistungen einen neuen Nachtrag anlegen.`, { art: 'fehler' }); return; }
    const eigene = lebende('lv_position').filter((q) => q.werte.nachtrag === n.id && q.werte.art !== 'titel'), id = neueKennung();
    ausfuehren({ objekt: 'lv_position', art: 'anlegen', objektId: id, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, nachtrag: n.id, oz: eigene.length ? naechsteOz(eigene) : `${String(n.werte.nummer)}.0010`, art: 'normal', kurztext: 'Neue Nachtragsposition', menge: null, einheit: 'Stk', ep: null } }, `Position in ${String(n.werte.nummer)}`);
    setLvZeiger(id);
  };
  const bauvertrag = () => { if (auftrag()) bauvertragOeffnen(auftrag()!); };
  const knoepfe = () => [
    ...(darf('nachtrag', 'schreiben') ? [{ titel: 'Gliederungspunkt', zeichen: 'gruppe_neu', gruppe: 'Nachtrag', gesperrt: !auftrag(), tun: ntGliederung },
      { titel: 'Position', zeichen: 'neu', gruppe: 'Nachtrag', gesperrt: !auftrag() || !nachtraege().length, tun: ntPosition }] : []),
    ...(auftrag() ? [{ titel: 'Bauvertrag', zeichen: 'vertrag', gruppe: 'Vertrag', tun: bauvertrag }] : []),
  ];
  // Bezeichnung eines Nachtrags (Gliederungspunkt) ist sein Name – beides ändert sich zusammen
  const bezeichnung = { darf: (q: Zeile) => nt(q), setzen: (q: Zeile, t: string) => ausfuehrenMehrere([
    { objekt: 'lv_position', art: 'aendern', objektId: q.id, werte: { kurztext: t } },
    ...(q.werte.art === 'titel' ? [{ objekt: 'nachtrag', art: 'aendern' as const, objektId: String(q.werte.nachtrag), werte: { name: t } }] : [])], 'Bezeichnung') };
  return <LvBaum m={m} spalten={spalten} speicher="bp_spalten_auftraege" mitNachtraegen knoepfe={knoepfe} fuss={fuss()} bezeichnung={bezeichnung}
    oben={() => (auftrag() ? undefined : <p class="hinweis-kasten lvt-hinweis-oben">Dieses LV ist noch nicht vergeben – unter „Angebote & Preisspiegel“ mit „Vergeben …“ beauftragen. Nachträge gibt es erst mit Auftrag.</p>)} />;
}
