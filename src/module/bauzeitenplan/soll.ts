// Soll und Ist im Bauzeitenplan (wie im bisherigen Bauzeitenplan): Beim Festhalten werden die gerechneten Termine gemerkt;
// danach liegt dieses Soll blass unter dem laufenden Plan (Ist). Hier nur die Rechnung, ohne Oberfläche.
import { tagAus } from './kalender';

export interface SollZeile { id: string; name: string; reihe: number; anfang: string; ende: string; gruppe?: boolean }
export interface Vergleich { art: 'neu' | 'gleich' | 'zeit'; soll?: SollZeile; tage: number }   // tage: Ende Ist − Ende Soll in Kalendertagen

/** Stand zum Festhalten aus dem gerechneten Plan. */
export const sollStand = (zeilen: SollZeile[]): string => JSON.stringify(zeilen.map((z) => ({ id: z.id, name: z.name, reihe: z.reihe, anfang: z.anfang, ende: z.ende, ...(z.gruppe ? { gruppe: true } : {}) })));
export function sollLesen(text: unknown): SollZeile[] {
  try { const l = JSON.parse(String(text ?? '[]')) as SollZeile[]; return Array.isArray(l) ? l.filter((z) => z && typeof z.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(z.anfang) && /^\d{4}-\d{2}-\d{2}$/.test(z.ende)) : []; } catch { return []; }
}

/** Je Leistung des Ist: neu, gleich oder zeitlich anders (mit Abweichung des Endes); dazu die entfallenen und die Projektenden.
 *  Zugeordnet über die Kennung, sonst über den Namen (eine neu angelegte Leistung gleichen Namens zählt als dieselbe). */
export function vergleichen(soll: SollZeile[], ist: SollZeile[]): { je: Map<string, Vergleich>; entfallen: SollZeile[]; endeSoll: string; endeIst: string; abweichung: number } {
  const nachId = new Map(soll.map((z) => [z.id, z])), nachName = new Map<string, SollZeile>();
  for (const z of soll) if (!nachName.has(z.name)) nachName.set(z.name, z);
  const istIds = new Set(ist.map((z) => z.id)), benutzt = new Set<SollZeile>(), je = new Map<string, Vergleich>();
  for (const z of ist) {
    let s = nachId.get(z.id);
    if (!s || benutzt.has(s)) { const n = nachName.get(z.name); s = n && !benutzt.has(n) && !istIds.has(n.id) ? n : undefined; }
    if (!s) { je.set(z.id, { art: 'neu', tage: 0 }); continue; }
    benutzt.add(s);
    const tage = tagAus(z.ende) - tagAus(s.ende);
    je.set(z.id, { art: tage || tagAus(z.anfang) !== tagAus(s.anfang) ? 'zeit' : 'gleich', soll: s, tage });
  }
  const max = (l: SollZeile[]) => l.reduce((m, z) => (z.ende > m ? z.ende : m), '');
  const endeSoll = max(soll), endeIst = max(ist);
  return { je, entfallen: soll.filter((z) => !benutzt.has(z)), endeSoll, endeIst, abweichung: endeSoll && endeIst ? tagAus(endeIst) - tagAus(endeSoll) : 0 };
}
