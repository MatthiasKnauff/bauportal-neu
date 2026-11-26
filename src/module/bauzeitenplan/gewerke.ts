// Gewerke & Firmen (wie im bisherigen Bauportal): je Gewerk des Plans die Leistungen, der Einsatz (nur die tatsächlichen
// Arbeitszeiträume, Pausen bleiben Lücken), der Leistungsbereich nach VOB/C und die Firmen, die dort schon stehen.
// Reine Rechnung aus dem gerechneten Plan – im Browser und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import type { Plan } from './plan';

export interface Gewerkzeile {
  gewerk: string;
  leistungen: { id: string; name: string }[];
  anfang: number | null; ende: number | null;   // Tagnummern (erster und letzter Arbeitstag)
  einsatz: [number, number][];                 // zusammenhängende Arbeitszeiträume als Tagnummern (von, bis)
  vob: string | null;                          // der häufigste Leistungsbereich nach VOB/C bei den Leistungen
  firmen: string[];                            // Firmen (Kontakte), die bei den Leistungen eingetragen sind
}

/** Die Gewerke eines Plans – nach erstem Einsatz, dann A–Z. Gruppen (Sammelzeilen) zählen nicht. */
export function gewerkeAus(plan: Plan, werte: (id: string) => Werte | undefined): Gewerkzeile[] {
  const m = new Map<string, Gewerkzeile & { tage: [number, number][]; vobs: Map<string, number> }>();
  for (const z of plan.zeilen) {
    const w = werte(z.id), g = String(w?.gewerk ?? '').trim();
    if (!g || z.termin.gruppe) continue;
    let r = m.get(g);
    if (!r) m.set(g, (r = { gewerk: g, leistungen: [], anfang: null, ende: null, einsatz: [], vob: null, firmen: [], tage: [], vobs: new Map() }));
    r.leistungen.push({ id: z.id, name: z.name });
    for (const a of z.termin.abschnitte.length ? z.termin.abschnitte : [{ s: z.termin.s, f: z.termin.f }]) if (a.f > a.s) r.tage.push([a.s, a.f - 1]);
    if (w?.vob) r.vobs.set(String(w.vob), (r.vobs.get(String(w.vob)) ?? 0) + 1);
    if (w?.firma && !r.firmen.includes(String(w.firma))) r.firmen.push(String(w.firma));
  }
  const aus = [...m.values()].map(({ tage, vobs, ...r }) => {
    // Arbeitstage zu Zeiträumen zusammenfassen: überlappend oder direkt anschließend = ein Zeitraum
    const t = tage.sort((a, b) => a[0] - b[0]), z: [number, number][] = [];
    for (const [a, b] of t) { const l = z.at(-1); if (l && a <= l[1] + 1) l[1] = Math.max(l[1], b); else z.push([a, b]); }
    const einsatz = z.map(([a, b]) => [plan.kal.tag(a), plan.kal.tag(b)] as [number, number]);
    return { ...r, einsatz, anfang: einsatz[0]?.[0] ?? null, ende: einsatz.at(-1)?.[1] ?? null, vob: [...vobs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null };
  });
  return aus.sort((a, b) => (a.anfang ?? Infinity) - (b.anfang ?? Infinity) || a.gewerk.localeCompare(b.gewerk, 'de'));
}

/** Gehört ein Kontakt zum Gewerk? Gleiches Wort am Anfang („Heizung“ ↔ „Heizung Sanitär“) – Firmen des Gewerks stehen zuerst. */
export const passtZumGewerk = (kontaktGewerk: unknown, gewerk: string): boolean => {
  const a = String(kontaktGewerk ?? '').toLowerCase(), g = gewerk.toLowerCase().split(/[\s,/-]+/)[0] ?? '';
  return !!g && g.length >= 3 && a.split(/[\s,/-]+/).some((t) => t.startsWith(g) || (t.length >= 3 && g.startsWith(t)));
};

/**
 * Firma für ein Gewerk eintragen: bei allen Leistungen des Gewerks, die noch keine oder die bisherige Firma haben.
 * Mit „überall“ auch dort, wo eine andere Firma steht (z. B. Nachunternehmer) – das entscheidet der Mensch.
 */
export function firmaInDenPlan(leistungen: { id: string; werte: Werte }[], gewerk: string, firma: string | null, bisher: string | null, ueberall = false): { id: string; werte: Werte }[] {
  return leistungen.filter((l) => String(l.werte.gewerk ?? '').trim() === gewerk)
    .filter((l) => { const f = l.werte.firma ? String(l.werte.firma) : null; return f !== firma && (ueberall || !f || f === bisher); })
    .map((l) => ({ id: l.id, werte: { firma } }));
}
