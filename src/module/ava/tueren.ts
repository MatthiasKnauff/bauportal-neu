// Fenster- & Türliste (wie im bisherigen Bauportal, neu gebaut): ausführliche Liste je Tür bzw. Fenster, kann sich aus dem
// Gebäudemodell füllen und speist das LV. Gleiche Ausführung = eine LV-Position (Menge = Stückzahl); je Gruppe (Fenster,
// Außentüren, Innentüren) ein Titel und davor eine Textposition „Systembeschreibung“ mit allem, was für alle gleich ist.
// Die Positionen tragen einen Schlüssel (Liste | Gruppe | Ausführung) – so bleiben LV und Liste abgleichbar.
// Reine Rechnung: im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';

type E = { id: string; werte: Werte };
// erste Wahl leer – sonst stünde in jeder neuen Tür schon der erste Vorschlag
const o = (...w: string[]) => [{ wert: '', titel: '–' }, ...w.map((x) => ({ wert: x, titel: x }))];

/** Vorschläge je Feld (eigene Werte sind erlaubt). */
export const TUER_WERTE: Record<string, { wert: string; titel: string }[]> = {
  art: o('Innentür', 'Fenster', 'Fenstertür', 'Nebeneingangstür', 'Haustür', 'Außentür', 'Wohnungseingangstür', 'Funktionstür', 'Brandschutztür', 'Rauchschutztür', 'Schallschutztür', 'Schiebetür', 'Ganzglastür', 'Stahltür', 'Tor'),
  flg: o('1-flg.', '2-flg.', '2-flg. ungleich', 'Schiebetür', 'Pendeltür'), din: o('DIN L', 'DIN R', 'oben'),
  oeffnung: o('fest', 'festverglast', 'dreh', 'drehkipp', 'kipp', 'schiebe', 'Stulp drehkipp/dreh'),
  fb_innen: o('gefliest (bauseits)', 'Werkstein', 'Holz', 'keine'), fb_aussen: o('Aluminium', 'gefliest (bauseits)', 'keine (wandbündig)'),
  rollo: o('nein', 'ja', 'ja, mit Handkurbel (2. Rettungsweg)'),
  brand: o('T30', 'T30-RS', 'T90', 'T90-RS', 'RS', 'EI2 30', 'EI2 90', 'G30'), schall: o('27 dB', '32 dB', '37 dB', '42 dB', '47 dB'), rc: o('RC2', 'RC3', 'RC4'), klima: o('I', 'II', 'III'),
  zarge: o('Stahl-Umfassungszarge', 'Stahl-Eckzarge', 'Stahl-Blockzarge', 'Holz-Umfassungszarge', 'Holz-Blockzarge', 'Alu-Rahmen', 'Ganzglas-Beschläge', 'zargenlos (flächenbündig)'),
  blatt: o('Röhrenspan', 'Vollspan', 'Stahl doppelwandig', 'Alu-Rahmen mit Füllung', 'Ganzglas ESG', 'Holz massiv', 'Brandschutzeinlage'),
  oberfl: o('CPL', 'HPL', 'Lack weiß', 'Lack RAL nach Wahl', 'Furnier', 'pulverbeschichtet', 'grundiert'),
  glas: o('Klarglas VSG', 'Satinato ESG', 'Brandschutzglas', 'Drahtglas'),
  schloss: o('BB', 'PZ', 'WC', 'Panik', 'Motorschloss', 'ohne'), beschlag: o('Drücker/Drücker Edelstahl', 'Drücker/Knauf', 'Stoßgriff', 'Muschelgriff', 'Drücker/Drücker Alu'),
};
/** Ausstattung (angehakt oder nicht). */
export const AUSSTATTUNG: { wert: string; titel: string }[] = [['licht', 'Lichtausschnitt'], ['umfz', 'Umfassungszarge'], ['lueft', 'Lüftungsöffnung'], ['otsch', 'Obentürschließer'],
  ['frl', 'Feststellanlage'], ['oberlicht', 'Oberlicht'], ['seitenteil', 'Seitenteil'], ['bodend', 'Bodendichtung'], ['schwelle', 'schwellenlos'], ['bf', 'barrierefrei'],
  ['panik', 'Panik EN 1125'], ['notaus', 'Notausgang EN 179'], ['eoeff', 'E-Öffner'], ['antrieb', 'Antrieb'], ['zk', 'Zutrittskontrolle'], ['rm', 'Riegelkontakt'],
  ['sa', 'Schließanlage'], ['stopper', 'Türstopper'], ['kanten', 'Kantenschutz'], ['nass', 'Feuchtraum']].map(([wert, titel]) => ({ wert: wert!, titel: titel! }));

/** Wo die Tür sitzt – gehört nicht zur Ausführung (zwei Türen mit gleicher Ausführung an verschiedenen Orten sind eine Position). */
const ORT = new Set(['nr', 'geschoss', 'raum', 'raumname', 'zu', 'bem', 'anzahl', 'liste', 'projekt', 'bauteil', 'reihe']);
/** Merkmale in der Reihenfolge der LV-Texte. */
const MERKMALE: [string, string][] = [['art', 'Typ'], ['flg', 'Flügel'], ['din', 'Öffnungsrichtung'], ['oeffnung', 'Öffnungsart'], ['bruestung', 'Brüstungshöhe'],
  ['fb_innen', 'Innenfensterbank'], ['fb_aussen', 'Außenfensterbank'], ['rollo', 'Rollo'], ['wand', 'Wanddicke'], ['zarge', 'Zarge'], ['blatt', 'Türblatt'],
  ['oberfl', 'Oberfläche'], ['farbe', 'Farbe'], ['glas', 'Verglasung'], ['brand', 'Ausführung'], ['schall', 'Schallschutz'], ['rc', 'Einbruchhemmung'],
  ['klima', 'Klimaklasse'], ['schloss', 'Schloss'], ['beschlag', 'Beschlag']];
/** Im LV immer mit ja/nein genannt (wie bisher), sonst nur, wenn angehakt. */
const JA_NEIN: Record<string, string[]> = { Innentüren: ['licht', 'umfz', 'lueft'] };
export const GRUPPEN = ['Fenster', 'Außentüren', 'Innentüren'] as const;

const t = (w: Werte, k: string) => String(w[k] ?? '').trim();
const ausstattung = (w: Werte) => new Set(t(w, 'ausstattung').split(',').map((x) => x.trim()).filter(Boolean));
/** Maß in m oder mm → Text in m („1,01“). */
const mass = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n ? (n > 20 ? n / 1000 : n).toLocaleString('de-DE', { maximumFractionDigits: 3 }) : String(v ?? ''); };

/** Titel im LV: Fenster, Außentüren, Innentüren. */
export function tuerGruppe(w: Werte): (typeof GRUPPEN)[number] {
  const a = t(w, 'art').toLowerCase();
  if (a.includes('fenster')) return 'Fenster';
  if (/^(außen|aussen|nebeneingang|haus|tor)/.test(a)) return 'Außentüren';
  return 'Innentüren';
}

/** Die Ausführung einer Tür als Text (alles außer dem Ort) – gleiche Ausführung, gleiche Position. */
export function ausfuehrung(w: Werte, dinTrennen = true): string {
  return JSON.stringify(Object.keys(w).filter((k) => !ORT.has(k) && (dinTrennen || k !== 'din') && w[k] !== null && w[k] !== '' && w[k] !== false).sort().map((k) => [k, k === 'ausstattung' ? [...ausstattung(w)].sort().join(',') : w[k]]));
}
/** Kurzer, fester Fingerabdruck eines Textes (FNV-1a, 8 Hex-Zeichen). */
function abdruck(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const zeileMerkmal = (k: string, titel: string, v: string) => `${titel}: ${k === 'din' ? ({ 'DIN L': 'L', 'DIN R': 'R' } as Record<string, string>)[v] ?? v : k === 'bruestung' ? mass(v) : k === 'brand' ? v.replace('-', '') : v}`;

/** Text der Systembeschreibung: was für alle Türen der Gruppe gleich ist. */
function systemText(gruppe: string, gemeinsam: Werte): string {
  const z: string[] = [];
  for (const [k, titel] of MERKMALE.slice(1)) if (k in gemeinsam && !['din', 'brand', 'art'].includes(k)) z.push(zeileMerkmal(k, titel, t(gemeinsam, k)));
  for (const a of AUSSTATTUNG) if (ausstattung(gemeinsam).has(a.wert) && !(JA_NEIN[gruppe] ?? []).includes(a.wert)) z.push(a.titel);
  return z.length ? z.join('\n') : '(Hersteller/System, Profile, Oberfläche, Beschläge, Anschlüsse – bitte ergänzen)';
}
/** Langtext einer Position: Einbaupositionen, Räume, Typ, Maße und was von der Systembeschreibung abweicht. */
function positionsText(liste: E[], gemeinsam: Werte, gruppe: string): string {
  const w = liste[0]!.werte, z = [`Einbauposition: ${liste.map((x) => t(x.werte, 'nr') || '?').join(', ')}`];
  const raeume = liste.map((x) => t(x.werte, 'raumname') || t(x.werte, 'raum')).filter(Boolean);
  if (raeume.length) z.push(`Raum: ${raeume.join(', ')}`);
  z.push(zeileMerkmal('art', 'Typ', t(w, 'art')));
  if (t(w, 'b') || t(w, 'h')) z.push(`Maße (bxh): ${mass(w.b) || '?'}x${mass(w.h) || '?'}`);
  for (const [k, titel] of MERKMALE.slice(1)) if (t(w, k) && (k === 'din' || k === 'brand' || !(k in gemeinsam))) z.push(zeileMerkmal(k, titel, t(w, k)));
  const hat = ausstattung(w);
  for (const k of JA_NEIN[gruppe] ?? []) z.push(`${AUSSTATTUNG.find((a) => a.wert === k)!.titel}: ${hat.has(k) ? 'ja' : 'nein'}`);
  for (const a of AUSSTATTUNG) if (hat.has(a.wert) && !(JA_NEIN[gruppe] ?? []).includes(a.wert) && !ausstattung(gemeinsam).has(a.wert)) z.push(a.titel);
  z.push(...[...new Set(liste.map((x) => t(x.werte, 'bem')).filter(Boolean))].sort());
  return z.join('\n');
}

export interface LvZeilePlan { schluessel: string; art: 'titel' | 'hinweis' | 'normal'; kurztext: string; langtext: string; menge: number | null; einheit: string; tueren: string[] }

/** Türen → Zeilen fürs LV, je Gruppe: Titel, Systembeschreibung (Hinweistext), Positionen „… gemäß vorangegangener Systembeschreibung“. */
export function tuerenInsLv(tueren: E[], listeId: string, dinTrennen = true): LvZeilePlan[] {
  const aus: LvZeilePlan[] = [];
  for (const gruppe of GRUPPEN) {
    const T = tueren.filter((x) => tuerGruppe(x.werte) === gruppe);
    if (!T.length) continue;
    const je = new Map<string, E[]>();
    for (const x of T) { const k = ausfuehrung(x.werte, dinTrennen); (je.get(k) ?? je.set(k, []).get(k)!).push(x); }
    // gemeinsam: was alle Türen der Gruppe gleich haben (ohne Typ, Maße, Anschlag) – nur, wenn es mehrere Ausführungen gibt
    const gemeinsam: Werte = {};
    if (je.size > 1) {
      const schluessel = new Set(T.flatMap((x) => Object.keys(x.werte)).filter((k) => !ORT.has(k) && !['din', 'b', 'h', 'art', 'typ'].includes(k)));
      for (const k of schluessel) {
        const w0 = k === 'ausstattung' ? null : t(T[0]!.werte, k);
        if (k === 'ausstattung') { const alle = [...ausstattung(T[0]!.werte)].filter((a) => T.every((x) => ausstattung(x.werte).has(a))); if (alle.length) gemeinsam.ausstattung = alle.join(','); }
        else if (w0 && T.every((x) => t(x.werte, k) === w0)) gemeinsam[k] = w0;
      }
    }
    aus.push({ schluessel: `${listeId}|${gruppe}`, art: 'titel', kurztext: gruppe, langtext: '', menge: null, einheit: '', tueren: [] });
    aus.push({ schluessel: `${listeId}|${gruppe}|system`, art: 'hinweis', kurztext: `Systembeschreibung ${gruppe}`, langtext: systemText(gruppe, gemeinsam), menge: null, einheit: '', tueren: [] });
    for (const [k, zeilen] of je) {
      const w = zeilen[0]!.werte;
      aus.push({
        schluessel: `${listeId}|${gruppe}|${abdruck(k)}`, art: 'normal',
        kurztext: `${t(w, 'art') || (gruppe === 'Fenster' ? 'Fenster' : 'Tür')} gemäß vorangegangener Systembeschreibung`,
        langtext: positionsText(zeilen, gemeinsam, gruppe), menge: zeilen.reduce((s, x) => s + Math.max(1, Math.round(Number(x.werte.anzahl ?? 1)) || 1), 0), einheit: 'St',
        tueren: zeilen.map((x) => x.id),
      });
    }
  }
  return aus;
}

export interface Abgleich { neu: LvZeilePlan[]; aendern: { id: string; werte: Werte }[]; null: string[]; gleich: number }
/** Was sich im LV ändern muss, damit es zur Liste passt: neue Zeilen, geänderte Mengen und Texte, weggefallene Positionen auf Menge 0
 *  (OZ, Preise und Vergabe bleiben – gelöscht wird nichts). Nur Zeilen mit dem Schlüssel dieser Liste zählen. */
export function abgleichen(plan: LvZeilePlan[], vorhanden: E[], listeId: string): Abgleich {
  const da = new Map(vorhanden.filter((p) => String(p.werte.tuerliste ?? '').split('|')[0] === listeId).map((p) => [String(p.werte.tuerliste), p]));
  const erg: Abgleich = { neu: [], aendern: [], null: [], gleich: 0 };
  const geplant = new Set(plan.map((z) => z.schluessel));
  for (const z of plan) {
    const p = da.get(z.schluessel);
    if (!p) { erg.neu.push(z); continue; }
    const w: Werte = {};
    if (String(p.werte.kurztext ?? '') !== z.kurztext) w.kurztext = z.kurztext;
    if (z.art !== 'titel' && String(p.werte.langtext ?? '') !== z.langtext) w.langtext = z.langtext;
    if (z.menge != null && Number(p.werte.menge ?? 0) !== z.menge) w.menge = z.menge;
    if (Object.keys(w).length) erg.aendern.push({ id: p.id, werte: w }); else erg.gleich++;
  }
  for (const [k, p] of da) if (!geplant.has(k) && p.werte.art !== 'titel' && p.werte.art !== 'hinweis' && Number(p.werte.menge ?? 0) !== 0) erg.null.push(p.id);
  return erg;
}
