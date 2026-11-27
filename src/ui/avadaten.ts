// Ausschreibung: die Daten der Ansichten an einer Stelle – Angebote, Preise, EP des Auftrags, die Zahlen eines LV und die
// GAEB-Ausgabe. Ohne eigene Oberfläche, damit Kopf, Preisspiegel, LV, Besprechung, Aufträge und Rechnungen sie nutzen,
// ohne einander einzubinden (vorher lag das in ava.tsx – Kreise ava ↔ avakopf/preisspiegel/lvbearbeiten/besprechung).
import type { Vorlage, Zeile } from '../kern/befehl';
import { neueKennung } from './unterbau/api';
import { auftragsstand, ausgeschrieben, naechsterNachtrag, type Auftragsstand, gp, gpVon, istZuschlag, lvEp, lvMenge, nachKennung, nachOz, summeGeschaetzt, wertung, zaehlt, zahl } from '../module/ava/rechnung';
import { abgerechnetAus, standAus, zeilenBis } from '../module/ava/aufmass';
import { epAus } from '../module/ava/freigabe';
import { lvAlsX83 } from '../module/ava/gaeb';
import { herunterladen } from './baukasten/herunterladen';
import { lebende, sicht } from './unterbau/abgleich';

export const name = (kontakt: unknown) => String(sicht.kontakt?.[String(kontakt ?? '')]?.werte.name ?? 'Bieter:in');
/** Positionen der Ausschreibung (ohne Nachträge) – Preisspiegel, Summen, GAEB. */
export const positionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv && ausgeschrieben(p)));
/** Alle Positionen eines Auftrags, mit Nachträgen – Aufmaß und Abrechnung. */
export const allePositionenVon = (lv: string) => nachOz(lebende('lv_position').filter((p) => p.werte.lv === lv));
export const angeboteVon = (lv: string) => lebende('angebot').filter((a) => a.werte.lv === lv).sort((a, b) => name(a.werte.bieter).localeCompare(name(b.werte.bieter), 'de'));
/** Preise eines LV: „angebot:position“ → Eintrag. */
export const preiseVon = (angebote: Zeile[]) => { const ids = new Set(angebote.map((a) => a.id)); return new Map(lebende('angebot_preis').filter((x) => ids.has(String(x.werte.angebot))).map((x) => [`${x.werte.angebot}:${x.werte.position}`, x])); };
/** EP des Auftrags je Position (Nachtragspositionen: ihr eigener EP) – null: kein Preis. */
export const epVon = (lvId: string) => { const ang = angeboteVon(lvId); return epAus(ang, [...preiseVon(ang).values()]); };

/** Die Zahlen eines LV an einer Stelle (Karte, Aufträge, Kostenkontrolle): Schätzung, bestes Angebot, Auftrag, Nachträge, abgerechnet. */
export interface LvZahlen { schaetzung: number; bestes: number | null; besterBieter: string; auftrag: Zeile | undefined; haupt: number; nachlass: number; stand: Auftragsstand; leistung: number; abgerechnet: number; rechnungen: number }
export function lvZahlen(lvId: string): LvZahlen {
  const pos = positionenVon(lvId), ang = angeboteVon(lvId), pr = preiseVon(ang);
  const w = wertung(pos, ang, (a, q) => (pr.has(`${a}:${q}`) ? zahl(pr.get(`${a}:${q}`)!.werte.ep) : null));
  const erster = w.find((x) => x.rang === 1), auftrag = ang.find((x) => x.werte.beauftragt === true);
  const ohneLv = !!sicht.lv?.[lvId]?.werte.ohne_lv;   // Auftrag ohne LV: die eingetragene Auftragssumme
  const nachlass = zahl(auftrag?.werte.nachlass), haupt = !auftrag ? 0 : ohneLv ? zahl(sicht.lv?.[lvId]?.werte.auftragssumme) : w.find((x) => x.angebot === auftrag.id)?.nachLass ?? 0;
  const nachtraege = lebende('nachtrag').filter((n) => n.werte.lv === lvId);
  const rechnungen = lebende('rechnung').filter((r) => r.werte.lv === lvId).sort((a, b) => String(a.werte.datum ?? '').localeCompare(String(b.werte.datum ?? '')));
  // Leistungsstand: geprüfte Mengen (Aufmaß) × EP des Auftrags (Nachtragspositionen: ihr eigener EP), nach Nachlass
  const ep = epVon(lvId);
  const stand = standAus(zeilenBis(lebende('aufmass').filter((a) => a.werte.lv === lvId), rechnungen, null));
  const P = allePositionenVon(lvId), alle = nachKennung(P), menge = (y: Zeile) => stand.get(y.id) ?? 0;
  const leistung = auftrag ? P.filter(zaehlt).reduce((s, q) => s + gpVon(q, alle, menge, ep), 0) * (1 - nachlass / 100) : 0;
  return {
    leistung: Math.round(leistung * 100) / 100,
    schaetzung: summeGeschaetzt(pos), bestes: erster?.nachLass ?? null, besterBieter: name(ang.find((a) => a.id === erster?.angebot)?.werte.bieter),
    auftrag, haupt, nachlass, stand: auftragsstand(haupt, auftrag ? nachtraege : [], allePositionenVon(lvId), nachlass),
    abgerechnet: Math.round(abgerechnetAus(rechnungen) * (1 - nachlass / 100) * 100) / 100, rechnungen: rechnungen.length,
  };
}

/** Das LV als GAEB-Datei herunterladen: X83 Angebotsaufforderung (ohne Preise). */
export function gaebAusgeben(lv: Zeile): void {
  const projekt = sicht.projekt?.[String(lv.werte.projekt)]?.werte;
  const x = lvAlsX83(lv.werte, allePositionenVon(lv.id), [projekt?.nummer, projekt?.name].filter(Boolean).join(' '));
  herunterladen(x.xml, x.name, 'application/xml');
}


/** GP einer Position mit Menge und EP aus derselben Quelle – bei einer Zuschlagsposition auf die GP ihrer Positionen im LV. */
export function gpMit(q: Zeile, menge: (y: Zeile) => number = lvMenge, ep: (y: Zeile) => number | null = lvEp): number {
  return istZuschlag(q.werte.art) ? gpVon(q, nachKennung(allePositionenVon(String(q.werte.lv ?? ''))), menge, ep) : gp(menge(q), ep(q) ?? 0);
}

/** Neuer Nachtrag des LV („N3“, angemeldet heute) als Befehl – für „Nachtrag anlegen“ (Aufträge, Aufmaß) und NT am Gliederungspunkt. */
export function nachtragNeu(lv: Zeile, name: string): { id: string; nr: string; befehl: Vorlage } {
  const nr = naechsterNachtrag(lebende('nachtrag').filter((n) => n.werte.lv === lv.id)), id = neueKennung();
  return { id, nr, befehl: { objekt: 'nachtrag', art: 'anlegen', objektId: id, werte: { projekt: lv.werte.projekt ?? null, lv: lv.id, nummer: nr, name, stand: 'angemeldet', angemeldet: new Date().toLocaleDateString('sv') } } };
}
