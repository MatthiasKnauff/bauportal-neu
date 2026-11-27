// Aufträge (wie im bisherigen Bauportal): derselbe LV-Baum wie im LV und im Preisspiegel (Baustein in lvbearbeiten.tsx), mit den
// Spalten des Auftrags – EP Auftrag (beauftragtes Angebot, bei Nachträgen ihr eigener EP), EP der Schätzung zum Vergleich, GP und
// abgerechnet (geprüfte Mengen × EP Auftrag). Nachträge stehen als Gliederungspunkt „N1 …“ mit ihren Positionen im Baum.
// Oben: Nachtrag (Gliederungspunkt, Position), Vertrag (Bauvertrag, Vergabe aufheben). Rechts die Karte des Auftrags.
import { createMemo, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { rechenweg } from '../kern/rechenweg';
import { gp, naechsteOz, naechsterNachtrag, zaehlt, zahl } from '../module/ava/rechnung';
import { angeboteVon, lvZahlen, preiseVon } from './ava';
import { lvVon } from './avakopf';
import type { Mitte } from './baukasten/anpassung';
import { LV_SPALTEN, LvBaum, eur, lvZeiger, setLvZeiger, zahlAus, zahlText, type BaumSpalte, type FussZeile } from './lvbearbeiten';
import { bauvertragOeffnen } from './besprechung';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const heute = () => new Date().toLocaleDateString('sv');

export function Auftraege(m: Mitte): JSX.Element {
  const lv = () => lvVon(m);
  const auftrag = createMemo(() => (lv() ? angeboteVon(lv()!.id).find((a) => a.werte.beauftragt === true) : undefined));
  const preise = createMemo(() => (auftrag() ? preiseVon([auftrag()!]) : new Map<string, Zeile>()));
  /** EP des Auftrags: Positionen der Ausschreibung aus dem beauftragten Angebot, Nachtragspositionen ihr eigener EP. */
  const epAuftrag = (q: Zeile): number | null => {
    if (q.werte.nachtrag) return q.werte.ep != null && q.werte.ep !== '' ? zahl(q.werte.ep) : null;
    const x = preise().get(`${auftrag()?.id}:${q.id}`); return x && x.werte.ep != null && x.werte.ep !== '' ? zahl(x.werte.ep) : null;
  };
  const aufmass = createMemo(() => new Map(lebende('aufmass').filter((a) => a.werte.lv === lv()?.id).map((a) => [String(a.werte.position), a])));
  const geprueft = (q: Zeile) => rechenweg(aufmass().get(q.id)?.werte.rechenweg).summe;
  const nt = (q: Zeile) => !!q.werte.nachtrag && darf('lv_position', 'schreiben');
  const aendern = (q: Zeile, werte: Record<string, unknown>, titel: string) => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: q.id, werte: werte as never }, titel);
  const nurNachtrag = (s: BaumSpalte): BaumSpalte => ({ ...s, setzen: (q, t) => (q.werte.nachtrag ? s.setzen!(q, t) : 'Positionen des Auftrags sind Vertragsinhalt – Änderungen als Nachtrag.') });
  const spalten = (): BaumSpalte[] => [
    nurNachtrag(LV_SPALTEN.find((s) => s.id === 'menge')!), nurNachtrag(LV_SPALTEN.find((s) => s.id === 'einheit')!), { ...LV_SPALTEN.find((s) => s.id === 'art')!, setzen: undefined },
    nurNachtrag(LV_SPALTEN.find((s) => s.id === 'kg')!),
    { id: 'ep_auftrag', titel: 'EP Auftrag', breite: 94, rechts: true, hilfe: 'Einheitspreis des Auftrags – bei Nachtragspositionen der Nachtragspreis (hier änderbar)',
      wert: (q) => { const e = epAuftrag(q); return e == null ? '' : eur(e); }, roh: (q) => zahlText(epAuftrag(q)),
      setzen: (q, t) => { if (!nt(q)) return 'Der EP des Auftrags kommt aus dem beauftragten Angebot – Änderungen als Nachtrag.'; const n = zahlAus(t); if (typeof n === 'string') return n; aendern(q, { ep: n }, 'Nachtragspreis'); } },
    { id: 'ep_schaetz', titel: 'EP Schätz.', breite: 84, rechts: true, wert: (q) => (q.werte.nachtrag || q.werte.ep == null || q.werte.ep === '' ? '' : eur(zahl(q.werte.ep))) },
    { id: 'gp_auftrag', titel: 'GP', breite: 98, rechts: true, wert: (q) => { const e = epAuftrag(q); return e == null || !zaehlt(q) ? '' : eur(gp(q.werte.menge, e)); },
      summe: (pos) => pos.filter(zaehlt).reduce((s, q) => s + gp(q.werte.menge, epAuftrag(q) ?? 0), 0) },
    { id: 'abgerechnet', titel: 'abgerechnet', breite: 98, rechts: true, hilfe: 'geprüfte Menge (Aufmaß) × EP Auftrag', wert: (q) => { const g = geprueft(q), e = epAuftrag(q); return g == null || e == null || !zaehlt(q) ? '' : eur(gp(g, e)); },
      summe: (pos) => pos.filter(zaehlt).reduce((s, q) => { const g = geprueft(q); return s + (g == null ? 0 : gp(g, epAuftrag(q) ?? 0)); }, 0) },
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
    const nr = naechsterNachtrag(nachtraege()), id = neueKennung(), titel = neueKennung();
    ausfuehrenMehrere([
      { objekt: 'nachtrag', art: 'anlegen', objektId: id, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, nummer: nr, name: 'Neuer Nachtrag', stand: 'angemeldet', angemeldet: heute() } },
      { objekt: 'lv_position', art: 'anlegen', objektId: titel, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, nachtrag: id, oz: nr, art: 'titel', kurztext: 'Neuer Nachtrag' } },
    ], `Nachtrag ${nr}`);
    setLvZeiger(titel);
    hinweis(`Nachtrag ${nr} angelegt – Bezeichnung in der Zeile ändern, dann „Position“ für die Leistungen; Stand rechts in der Karte.`);
  };
  /** Nachtrag der markierten Zeile (sonst der letzte). */
  const ntVonZeile = () => { const q = sicht.lv_position?.[lvZeiger() ?? '']; const id = q?.werte.nachtrag; return (id && sicht.nachtrag?.[String(id)]) || nachtraege().sort((a, b) => String(a.werte.nummer).localeCompare(String(b.werte.nummer), 'de', { numeric: true })).at(-1); };
  const ntPosition = () => {
    const n = ntVonZeile(); if (!lv() || !n) { hinweis('Erst einen Nachtrag anlegen („Gliederungspunkt“).', { art: 'fehler' }); return; }
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
  const bezeichnung = { darf: (q: Zeile) => !!q.werte.nachtrag && darf('lv_position', 'schreiben'), setzen: (q: Zeile, t: string) => ausfuehrenMehrere([
    { objekt: 'lv_position', art: 'aendern', objektId: q.id, werte: { kurztext: t } },
    ...(q.werte.art === 'titel' ? [{ objekt: 'nachtrag', art: 'aendern' as const, objektId: String(q.werte.nachtrag), werte: { name: t } }] : [])], 'Bezeichnung') };
  return <LvBaum m={m} spalten={spalten} speicher="bp_spalten_auftraege" mitNachtraegen knoepfe={knoepfe} fuss={fuss()} bezeichnung={bezeichnung}
    oben={() => (auftrag() ? undefined : <p class="hinweis-kasten lvt-hinweis-oben">Dieses LV ist noch nicht vergeben – unter „Angebote & Preisspiegel“ mit „Vergeben …“ beauftragen. Nachträge gibt es erst mit Auftrag.</p>)} />;
}
