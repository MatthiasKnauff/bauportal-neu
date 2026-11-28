// Wetter zum Standort eines Projekts: Die Anschrift der Baustelle wird einmal in Koordinaten übersetzt (OpenStreetMap),
// das Wetter für Tag und Stunde kommt von Open-Meteo. Hinaus gehen nur Anschrift bzw. Koordinaten – kein Name, kein Projekt.
// Geholt wird auf Knopfdruck; die Werte tragen danach die Marke „vom Wetterdienst“ und lassen sich überschreiben.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { KENNUNG } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';

const geo = () => process.env.WETTER_GEO_URL ?? 'https://nominatim.openstreetmap.org';
const dienst = (alt: boolean) => process.env.WETTER_URL ?? (alt ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast');
const orte = new Map<string, { lat: number; lon: number; land: string }>();   // Anschrift -> Koordinaten und Bundesland; bleibt, solange das Programm läuft

/** Anschrift -> Koordinaten und Bundesland (z. B. „NW“, für die Feiertage). Fürs Wetter auf rund 100 m gerundet, genau für den Kataster. */
export async function ortSuchen(anschrift: string, genau = false): Promise<{ lat: number; lon: number; land: string }> {
  let ort = orte.get(anschrift);
  if (!ort) {
    const t = await holen<{ lat: string; lon: string; address?: Record<string, string> }[]>(`${geo()}/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=de,at,ch,lu&q=${encodeURIComponent(anschrift)}`);
    if (!t[0]) throw new Ablehnung(`Die Anschrift „${anschrift}“ wurde nicht gefunden`);
    const iso = t[0].address?.['ISO3166-2-lvl4'] ?? '';
    ort = { lat: Number(t[0].lat), lon: Number(t[0].lon), land: /^DE-[A-Z]{2}$/.test(iso) ? iso.slice(3) : '' };
    orte.set(anschrift, ort);
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return genau ? ort : { ...ort, lat: r(ort.lat), lon: r(ort.lon) };
}

async function holen<T>(adresse: string, dienst = 'Der Wetterdienst'): Promise<T> {
  let r: Response;
  try { r = await fetch(adresse, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', 'user-agent': 'Bauportal (Wetter zum Tagesbericht, Adressen ergänzen)' } }); }
  catch { throw new Ablehnung(`${dienst} ist gerade nicht erreichbar`); }
  if (!r.ok) throw new Ablehnung(`${dienst} meldet Fehler ${r.status}`);
  return (await r.json()) as T;
}

/** Abstand zweier Orte in Metern (Haversine). */
export function abstand(a: number, b: number, c: number, d: number): number {
  const r = Math.PI / 180, h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

/** WMO-Wettercode -> Auswahl im Tagesbericht */
export function wetterlage(code: number, wind: number, temperatur: number): string {
  if (wind >= 62 || code >= 95) return 'sturm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'schnee';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'regen';
  if (temperatur < 0) return 'frost';
  return code <= 1 ? 'sonnig' : 'bewoelkt';
}

export async function wetterFuer(db: Db, wer: Benutzer, projektId: string, datum: string, uhrzeit: string): Promise<{ wetter: string; temperatur: number; luftfeuchte: number; wind: number; niederschlag: number; ort: string }> {
  if (!KENNUNG.test(projektId) || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Ablehnung('Projekt und Datum fehlen');
  const p = await alsBenutzer(db, wer, async (c) => (await c.query('select strasse, plz, ort from o_projekt where id = $1 and not geloescht', [projektId])).rows[0] as { strasse: string; plz: string; ort: string } | undefined);
  if (!p) throw new Ablehnung('Das Projekt gibt es nicht');
  const anschrift = [p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (!p.ort && !p.plz) throw new Ablehnung('Am Projekt fehlt die Anschrift der Baustelle (Projekte → Baustelle: PLZ und Ort)');
  if (new Date(`${datum}T00:00:00Z`).getTime() > Date.now() + 14 * 86400000) throw new Ablehnung('Für dieses Datum gibt es noch kein Wetter');
  const ort = await ortSuchen(anschrift);
  const alt = Date.now() - new Date(`${datum}T00:00:00Z`).getTime() > 80 * 86400000;   // ältere Tage liegen im Archiv
  const d = await holen<{ hourly?: { time: string[]; temperature_2m: number[]; relative_humidity_2m: number[]; precipitation: number[]; weather_code: number[]; wind_speed_10m: number[] } }>(
    `${dienst(alt)}?latitude=${ort.lat}&longitude=${ort.lon}&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&start_date=${datum}&end_date=${datum}&timezone=Europe%2FBerlin&wind_speed_unit=kmh`);
  const h = d.hourly;
  const stunde = Math.min(23, Math.max(0, Number(/^(\d{1,2}):/.exec(uhrzeit)?.[1] ?? 12)));
  if (!h || h.temperature_2m?.[stunde] == null) throw new Ablehnung('Für diesen Tag liefert der Wetterdienst keine Werte');
  const rund = (x: number) => Math.round(x * 10) / 10;
  return {
    wetter: wetterlage(h.weather_code[stunde] ?? 0, h.wind_speed_10m[stunde] ?? 0, h.temperature_2m[stunde]!),
    temperatur: rund(h.temperature_2m[stunde]!), luftfeuchte: Math.round(h.relative_humidity_2m[stunde] ?? 0), wind: Math.round(h.wind_speed_10m[stunde] ?? 0),
    niederschlag: rund(h.precipitation.reduce((s, x) => s + (x ?? 0), 0)),   // Summe des Tages
    ort: anschrift,
  };
}

/** Vorschläge aus dem Netz zu einem Kontakt (wie bisher, OpenStreetMap): Name, nahe der Baustelle bzw. dem Ort – mit Anschrift, Telefon, E-Mail, Internet. */
export interface NetzVorschlag { name: string; strasse: string; plz: string; ort: string; telefon: string; email: string; web: string }
export async function netzVorschlaege(name: string, ort: string): Promise<NetzVorschlag[]> {
  const q = [name, ort].filter(Boolean).join(', ');
  const t = await holen<{ name?: string; display_name: string; address?: Record<string, string>; extratags?: Record<string, string> }[]>(
    `${geo()}/search?format=jsonv2&limit=6&addressdetails=1&extratags=1&countrycodes=de,at,ch,lu&q=${encodeURIComponent(q)}`, 'Die Kartensuche (OpenStreetMap)');
  return t.map((x) => { const a = x.address ?? {}, e = x.extratags ?? {};
    return { name: x.name || x.display_name.split(',')[0]!, strasse: [a.road, a.house_number].filter(Boolean).join(' '), plz: a.postcode ?? '', ort: a.city ?? a.town ?? a.village ?? a.municipality ?? '',
      telefon: e.phone ?? e['contact:phone'] ?? '', email: e.email ?? e['contact:email'] ?? '', web: e.website ?? e['contact:website'] ?? '' }; })
    .filter((v, i, l) => l.findIndex((w) => w.name === v.name && w.strasse === v.strasse) === i);
}

export function wetterRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/kontakt/netz', { preHandler: e.nurAngemeldet }, async (req) => {
    const b = (req.body ?? {}) as { name?: unknown; ort?: unknown };
    const name = String(b.name ?? '').trim().slice(0, 120);
    if (name.length < 3) throw new Ablehnung('Bitte zuerst den Namen eintragen');
    return { vorschlaege: await netzVorschlaege(name, String(b.ort ?? '').trim().slice(0, 80)) };
  });

  // Bundesland der Baustelle – für die Feiertage im Bauzeitenplan
  app.post('/api/projekt/land', { preHandler: e.nurAngemeldet }, async (req) => {
    const id = String((req.body as { projekt?: string } | undefined)?.projekt ?? '');
    if (!KENNUNG.test(id)) throw new Ablehnung('Projekt fehlt');
    const p = await alsBenutzer(e.db, req.benutzer!, async (c) => (await c.query('select strasse, plz, ort from o_projekt where id = $1 and not geloescht', [id])).rows[0] as { strasse: string; plz: string; ort: string } | undefined);
    if (!p || (!p.ort && !p.plz)) return { land: '' };
    try { return { land: (await ortSuchen([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))).land }; } catch { return { land: '' }; }
  });
  // Projekt nach Standort (wie im bisherigen Bautagebuch): das nächste aktive Projekt zum Standort des Geräts. Hinaus gehen nur die
  // Anschriften der Baustellen (einmal je Anschrift, dann gemerkt) – der Standort des Geräts bleibt hier.
  app.post('/api/projekt/naechstes', { preHandler: e.nurAngemeldet }, async (req) => {
    const b = (req.body ?? {}) as { lat?: number; lon?: number };
    const lat = Number(b.lat), lon = Number(b.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Ablehnung('Standort fehlt');
    const P = await alsBenutzer(e.db, req.benutzer!, async (c) => (await c.query("select id, name, strasse, plz, ort from o_projekt where not geloescht and coalesce(status, 'aktiv') = 'aktiv' and (coalesce(ort, '') <> '' or coalesce(plz, '') <> '')")).rows as { id: string; name: string; strasse: string; plz: string; ort: string }[]);
    let best: { id: string; name: string; meter: number } | null = null;
    for (const p of P) {
      let o: { lat: number; lon: number };
      try { o = await ortSuchen([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), true); } catch { continue; }
      const m = abstand(lat, lon, o.lat, o.lon);
      if (!best || m < best.meter) best = { id: p.id, name: p.name, meter: Math.round(m) };
    }
    return { projekt: best };
  });
  app.post('/api/wetter', { preHandler: e.nurAngemeldet }, async (req) => {
    const b = (req.body ?? {}) as { projekt?: string; datum?: string; uhrzeit?: string };
    return wetterFuer(e.db, req.benutzer!, String(b.projekt ?? ''), String(b.datum ?? ''), String(b.uhrzeit ?? ''));
  });
}
