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

/** Anschrift -> Koordinaten (auf rund 100 m, genau genug fürs Wetter) und Bundesland (z. B. „NW“, für die Feiertage). */
export async function ortSuchen(anschrift: string): Promise<{ lat: number; lon: number; land: string }> {
  let ort = orte.get(anschrift);
  if (!ort) {
    const t = await holen<{ lat: string; lon: string; address?: Record<string, string> }[]>(`${geo()}/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=de,at,ch,lu&q=${encodeURIComponent(anschrift)}`);
    if (!t[0]) throw new Ablehnung(`Die Anschrift „${anschrift}“ wurde nicht gefunden`);
    const iso = t[0].address?.['ISO3166-2-lvl4'] ?? '';
    ort = { lat: Math.round(Number(t[0].lat) * 1000) / 1000, lon: Math.round(Number(t[0].lon) * 1000) / 1000, land: /^DE-[A-Z]{2}$/.test(iso) ? iso.slice(3) : '' };
    orte.set(anschrift, ort);
  }
  return ort;
}

async function holen<T>(adresse: string): Promise<T> {
  let r: Response;
  try { r = await fetch(adresse, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', 'user-agent': 'Bauportal (Wetter zum Tagesbericht)' } }); }
  catch { throw new Ablehnung('Der Wetterdienst ist gerade nicht erreichbar'); }
  if (!r.ok) throw new Ablehnung(`Der Wetterdienst meldet Fehler ${r.status}`);
  return (await r.json()) as T;
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

export function wetterRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  // Bundesland der Baustelle – für die Feiertage im Bauzeitenplan
  app.post('/api/projekt/land', { preHandler: e.nurAngemeldet }, async (req) => {
    const id = String((req.body as { projekt?: string } | undefined)?.projekt ?? '');
    if (!KENNUNG.test(id)) throw new Ablehnung('Projekt fehlt');
    const p = await alsBenutzer(e.db, req.benutzer!, async (c) => (await c.query('select strasse, plz, ort from o_projekt where id = $1 and not geloescht', [id])).rows[0] as { strasse: string; plz: string; ort: string } | undefined);
    if (!p || (!p.ort && !p.plz)) return { land: '' };
    try { return { land: (await ortSuchen([p.strasse, [p.plz, p.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))).land }; } catch { return { land: '' }; }
  });
  app.post('/api/wetter', { preHandler: e.nurAngemeldet }, async (req) => {
    const b = (req.body ?? {}) as { projekt?: string; datum?: string; uhrzeit?: string };
    return wetterFuer(e.db, req.benutzer!, String(b.projekt ?? ''), String(b.datum ?? ''), String(b.uhrzeit ?? ''));
  });
}
