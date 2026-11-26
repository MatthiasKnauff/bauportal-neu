// Kataster zur Baustelle (wie im bisherigen Bauportal, „Aus dem Kataster holen“ an der Projektkarte): Anschrift → Koordinaten
// (OpenStreetMap, wie beim Wetter) → Flurstücke aus ALKIS (WFS NW ALKIS Vereinfacht) und Geländehöhe über NHN aus dem DGM1
// (WCS NW DGM) – die offenen Dienste von Geobasis NRW (Datenlizenz Deutschland – Zero 2.0). Hinaus gehen nur Anschrift bzw.
// Koordinaten. Das Ergebnis trägt die Herkunft „aus dem Kataster“ und lässt sich überschreiben.
import { inflateSync } from 'node:zlib';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { KENNUNG } from '../kern/modell';
import { flurstueckeDerBaustelle, flurstueckeLesen, inNrw, katasterWerte, utm32, type Flurstueck } from '../kern/kataster';
import { xmlLesen, type XmlKnoten } from '../kern/xml';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import { ortSuchen } from './wetter';

const WFS = () => process.env.ALKIS_URL ?? 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht';
const WCS = () => process.env.DGM_URL ?? 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm';
const EPSG = 'urn:ogc:def:crs:EPSG::25832';

async function holen(adresse: string, accept: string): Promise<Buffer> {
  const host = new URL(adresse).host;
  let r: Response;
  try { r = await fetch(adresse, { signal: AbortSignal.timeout(20000), headers: { accept, 'user-agent': 'Bauportal (Grundstück zur Baustelle)' } }); }
  catch { throw new Ablehnung(`${host} ist gerade nicht erreichbar`); }
  if (!r.ok) throw new Ablehnung(`${host} meldet Fehler ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Flurstücke im Quadrat ±umkreis Meter um den Punkt. */
async function flurstuecke(e: number, n: number, umkreis = 35): Promise<Flurstueck[]> {
  const q = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'ave:Flurstueck', COUNT: '60', SRSNAME: EPSG,
    BBOX: `${(e - umkreis).toFixed(2)},${(n - umkreis).toFixed(2)},${(e + umkreis).toFixed(2)},${(n + umkreis).toFixed(2)},${EPSG}` });
  try { return flurstueckeLesen((await holen(`${WFS()}?${q}`, 'application/gml+xml, text/xml')).toString('utf8'), e, n); }
  catch (x) { throw x instanceof Ablehnung ? x : new Ablehnung('Die Antwort des ALKIS-Dienstes ist nicht lesbar'); }
}

// ------------------------------------------------------------------ Geländehöhe (WCS → GeoTIFF)
let dgm: { id: string; achsen: [string, string] } | null = null;   // Coverage und Achsen – einmal je Programmlauf gelesen
const alle = (k: XmlKnoten, name: string): XmlKnoten[] => [...(k.name === name ? [k] : []), ...k.kinder.flatMap((c) => alle(c, name))];
async function dgmInfo() {
  if (dgm) return dgm;
  const cap = xmlLesen((await holen(`${WCS()}?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1`, 'text/xml')).toString('utf8'));
  const ids = alle(cap, 'CoverageId').map((k) => k.text.trim()).filter(Boolean);
  const id = ids.find((i) => /dgm/i.test(i) && !/schatt|schumm|relief|hang/i.test(i)) ?? ids[0];
  if (!id) throw new Ablehnung('Der Höhendienst nennt kein Geländemodell');
  let achsen: [string, string] = ['x', 'y'];
  const be = xmlLesen((await holen(`${WCS()}?${new URLSearchParams({ SERVICE: 'WCS', REQUEST: 'DescribeCoverage', VERSION: '2.0.1', COVERAGEID: id })}`, 'text/xml')).toString('utf8'));
  const mit = (k: XmlKnoten): string | undefined => k.attr.axisLabels ?? k.kinder.map(mit).find(Boolean);
  const l = mit(be)?.split(/\s+/);
  if (l?.length && l.length >= 2) achsen = /^(y|n|lat|north|northing)$/i.test(l[0]!) ? [l[1]!, l[0]!] : [l[0]!, l[1]!];
  return (dgm = { id, achsen });
}

/** Geländehöhe in m über NHN (DHHN2016) am Punkt: Median der 1-m-Rasterzellen im Umkreis von 1,5 m (Ausreißer wie ein Mast zählen nicht). */
async function hoehe(e: number, n: number): Promise<number> {
  const d = await dgmInfo();
  const q = new URLSearchParams([['SERVICE', 'WCS'], ['VERSION', '2.0.1'], ['REQUEST', 'GetCoverage'], ['COVERAGEID', d.id], ['FORMAT', 'image/tiff'],
    ['SUBSET', `${d.achsen[0]}(${(e - 1.5).toFixed(2)},${(e + 1.5).toFixed(2)})`], ['SUBSET', `${d.achsen[1]}(${(n - 1.5).toFixed(2)},${(n + 1.5).toFixed(2)})`]]);
  const roh = await holen(`${WCS()}?${q}`, 'image/tiff');
  const w = tiffWerte(roh).filter((v): v is number => v != null && v > -500 && v < 3000).sort((a, b) => a - b);
  if (!w.length) throw new Ablehnung('Der Höhendienst liefert am Punkt keine Höhe');
  return Math.round(w[Math.floor(w.length / 2)]! * 100) / 100;
}

/** Werte des ersten Bildes eines GeoTIFF: Gleitkomma oder Ganzzahl, ohne/Deflate/LZW-Kompression, Prädiktor 1–3, Streifen oder Kacheln. */
export function tiffWerte(roh: Buffer): (number | null)[] {
  const le = roh[0] === 0x49;
  if (!(le ? roh.readUInt32LE(0) === 0x002a4949 : roh.readUInt32BE(0) === 0x4d4d002a)) throw new Ablehnung('Der Höhendienst liefert kein Rasterbild');
  const u16 = (o: number) => (le ? roh.readUInt16LE(o) : roh.readUInt16BE(o)), u32 = (o: number) => (le ? roh.readUInt32LE(o) : roh.readUInt32BE(o));
  const GROESSE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
  const ifd = u32(4), T = new Map<number, number[] | string>();
  for (let k = 0; k < u16(ifd); k++) {
    const p = ifd + 2 + 12 * k, tag = u16(p), typ = u16(p + 2), anz = u32(p + 4), g = (GROESSE[typ] ?? 1) * anz, o = g <= 4 ? p + 8 : u32(p + 8);
    if (typ === 2) { T.set(tag, roh.subarray(o, o + anz).toString('latin1').replace(/\0+$/, '')); continue; }
    const lies = (i: number) => (typ === 3 ? u16(o + 2 * i) : typ === 4 ? u32(o + 4 * i) : typ === 1 ? roh[o + i]! : typ === 11 ? (le ? roh.readFloatLE(o + 4 * i) : roh.readFloatBE(o + 4 * i)) : typ === 12 ? (le ? roh.readDoubleLE(o + 8 * i) : roh.readDoubleBE(o + 8 * i)) : NaN);
    T.set(tag, Array.from({ length: anz }, (_, i) => lies(i)));
  }
  const zahl = (t: number, vorgabe: number) => { const v = T.get(t); return Array.isArray(v) ? v[0]! : vorgabe; };
  const liste = (t: number) => { const v = T.get(t); return Array.isArray(v) ? v : []; };
  const breite = zahl(256, 0), hoeheB = zahl(257, 0), bits = zahl(258, 32), komp = zahl(259, 1), praed = zahl(317, 1), spp = zahl(277, 1), fmt = zahl(339, 1);
  const nd = T.get(42113), nodata = typeof nd === 'string' && nd.trim() !== '' ? Number(nd) : null;
  const kacheln = T.has(322), kw = kacheln ? zahl(322, breite) : breite, kh = kacheln ? zahl(323, hoeheB) : zahl(278, hoeheB);
  const offs = kacheln ? liste(324) : liste(273), laengen = kacheln ? liste(325) : liste(279), bps = bits / 8;
  const lesen: Record<string, (b: Buffer, o: number) => number> = {
    '3:4': (b, o) => (le ? b.readFloatLE(o) : b.readFloatBE(o)), '3:8': (b, o) => (le ? b.readDoubleLE(o) : b.readDoubleBE(o)),
    '1:1': (b, o) => b[o]!, '1:2': (b, o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)), '1:4': (b, o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o)),
    '2:2': (b, o) => (le ? b.readInt16LE(o) : b.readInt16BE(o)), '2:4': (b, o) => (le ? b.readInt32LE(o) : b.readInt32BE(o)),
  };
  const wert = lesen[`${fmt}:${bps}`];
  if (!wert) throw new Ablehnung(`Der Höhendienst liefert ein Rasterformat, das hier nicht gelesen wird (${bits} bit)`);
  const bild: (number | null)[] = new Array(breite * hoeheB).fill(null);
  const proZeile = Math.ceil(breite / kw);
  offs.forEach((o, i) => {
    const zeilen = kacheln ? kh : Math.min(kh, hoeheB - i * kh);
    const d = praediktor(entpacken(roh.subarray(o, o + laengen[i]!), komp), praed, kw, zeilen, bps * spp, bps, le);
    const x0 = kacheln ? (i % proZeile) * kw : 0, y0 = kacheln ? Math.floor(i / proZeile) * kh : i * kh;
    for (let y = 0; y < zeilen; y++) for (let x = 0; x < kw; x++) {
      const p = ((y * kw + x) * spp) * bps;
      if (y0 + y >= hoeheB || x0 + x >= breite || p + bps > d.length) continue;
      const v = wert(d, p);
      bild[(y0 + y) * breite + x0 + x] = Number.isNaN(v) || (nodata != null && v === nodata) ? null : v;
    }
  });
  return bild;
}

function entpacken(b: Buffer, komp: number): Buffer {
  if (komp === 1) return b;
  if (komp === 8 || komp === 32946) return inflateSync(b);
  if (komp === 5) return lzw(b);
  throw new Ablehnung(`Der Höhendienst liefert eine Kompression, die hier nicht gelesen wird (${komp})`);
}

/** TIFF-LZW: Codes von 9 bis 12 Bit, höchstwertiges Bit zuerst, Breite wächst einen Code früher („early change“). */
function lzw(b: Buffer): Buffer {
  let tab: Buffer[] = [], breite = 9, alt = -1, puffer = 0, bits = 0;
  const neu = () => { tab = Array.from({ length: 258 }, (_, i) => Buffer.from([i & 0xff])); breite = 9; alt = -1; };
  neu();
  const aus: Buffer[] = [];
  for (const byte of b) {
    puffer = ((puffer << 8) | byte) >>> 0; bits += 8;
    while (bits >= breite) {
      bits -= breite;
      const code = (puffer >>> bits) & ((1 << breite) - 1);
      puffer &= (1 << bits) - 1;
      if (code === 256) { neu(); continue; }
      if (code === 257) return Buffer.concat(aus);
      let eintrag: Buffer;
      if (alt < 0) eintrag = tab[code]!;
      else if (code < tab.length) { eintrag = tab[code]!; tab.push(Buffer.concat([tab[alt]!, eintrag.subarray(0, 1)])); }
      else { eintrag = Buffer.concat([tab[alt]!, tab[alt]!.subarray(0, 1)]); tab.push(eintrag); }
      aus.push(eintrag); alt = code;
      if (tab.length + 1 >= 1 << breite && breite < 12) breite++;
    }
  }
  return Buffer.concat(aus);
}

/** Prädiktor 2 (horizontale Differenzen, Ganzzahlen) und 3 (Gleitkomma: Byte-Differenzen, Bytes nach Wertigkeit gruppiert). */
function praediktor(d: Buffer, praed: number, breite: number, zeilen: number, pixbytes: number, bps: number, le: boolean): Buffer {
  if (praed === 1) return d;
  const zeile = breite * pixbytes, aus = Buffer.from(d);
  if (praed === 2) {
    const st = pixbytes / bps, max = 2 ** (8 * bps);
    const lies = (o: number) => (bps === 1 ? aus[o]! : bps === 2 ? (le ? aus.readUInt16LE(o) : aus.readUInt16BE(o)) : (le ? aus.readUInt32LE(o) : aus.readUInt32BE(o)));
    const schreib = (o: number, v: number) => { if (bps === 1) aus[o] = v; else if (bps === 2) (le ? aus.writeUInt16LE(v, o) : aus.writeUInt16BE(v, o)); else (le ? aus.writeUInt32LE(v, o) : aus.writeUInt32BE(v, o)); };
    for (let y = 0; y < zeilen; y++) for (let i = st; i < zeile / bps; i++) { const o = y * zeile + i * bps; schreib(o, (lies(o) + lies(o - st * bps)) % max); }
    return aus;
  }
  if (praed === 3) {
    const n = breite * (pixbytes / bps), erg = Buffer.alloc(d.length);
    for (let y = 0; y < zeilen; y++) {
      const r = Buffer.from(d.subarray(y * zeile, (y + 1) * zeile));
      for (let i = 1; i < r.length; i++) r[i] = (r[i]! + r[i - 1]!) & 0xff;
      for (let x = 0; x < n; x++) for (let k = 0; k < bps; k++) erg[y * zeile + x * bps + (le ? bps - 1 - k : k)] = r[k * n + x]!;
    }
    return erg;
  }
  return d;
}

// ------------------------------------------------------------------ zusammen
export async function katasterFuer(db: Db, wer: Parameters<typeof alsBenutzer>[1], projektId: string) {
  if (!KENNUNG.test(projektId)) throw new Ablehnung('Projekt fehlt');
  const p = await alsBenutzer(db, wer, async (c) => (await c.query('select strasse, plz, ort from o_projekt where id = $1 and not geloescht', [projektId])).rows[0] as { strasse: string; plz: string; ort: string } | undefined);
  if (!p) throw new Ablehnung('Das Projekt gibt es nicht');
  if (!p.strasse || (!p.ort && !p.plz)) throw new Ablehnung('Am Projekt fehlt die Anschrift der Baustelle (Straße mit Hausnummer, PLZ, Ort)');
  const ort = await ortSuchen([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), true);
  if (!inNrw(ort.lat, ort.lon)) throw new Ablehnung('Die Baustelle liegt nicht in Nordrhein-Westfalen – der Kataster kommt von Geobasis NRW');
  const { e, n } = utm32(ort.lat, ort.lon);
  const fs = flurstueckeDerBaustelle(await flurstuecke(e, n), p.strasse);
  const hinweise: string[] = [];
  let h: number | null = null;
  try { h = await hoehe(e, n); } catch (x) { hinweise.push((x as Error).message); }
  const w = katasterWerte(fs);
  if (!w) hinweise.push('Am Punkt der Baustelle wurde kein Flurstück gefunden.');
  return { werte: { ...(w ?? {}), ...(h != null ? { hoehe_nhn: h } : {}) }, flurstuecke: fs, hinweise };
}

export function katasterRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/kataster', { preHandler: e.nurAngemeldet }, async (req) => katasterFuer(e.db, req.benutzer!, String((req.body as { projekt?: string } | undefined)?.projekt ?? '')));
}
