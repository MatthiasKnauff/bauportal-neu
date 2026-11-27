// Kopierquelle (wie im bisherigen Bauportal): Zeilen aus einem anderen LV oder aus der Positionsdatenbank ins LV übernehmen –
// gewählte Titel bringen alles darunter mit; Mengen und Preise (als Schätzung) wahlweise. Dieselbe Ablage nimmt Kopieren/Einfügen.
import type { Werte } from '../../kern/modell';
import type { LvZeile } from './lvbaum';

export type Ablage = { titel: boolean; oz: string; werte: Werte }[];
/** Was beim Kopieren einer Zeile mitgeht. */
export const KOPIERT = ['art', 'kurztext', 'langtext', 'menge', 'einheit', 'ep', 'kostengruppe'] as const;

/** Die gewählten Zeilen eines LV mit allem unter ihren Titeln, in LV-Reihenfolge. ohne Mengen/Preise: leer (die Quelle bleibt eine Vorlage). */
export function ablageAus(zeilen: LvZeile[], werteVon: (id: string) => Werte | undefined, gewaehlt: string[], o: { mengen?: boolean; preise?: boolean } = {}): Ablage {
  const ids = new Set(gewaehlt);
  for (const z of zeilen) if (z.eltern && ids.has(z.eltern)) ids.add(z.id);
  return zeilen.filter((z) => ids.has(z.id)).map((z) => {
    const w = werteVon(z.id) ?? {}, werte: Werte = Object.fromEntries(KOPIERT.map((f) => [f, w[f] ?? null]));
    if (o.mengen === false) werte.menge = null;
    if (o.preise === false) werte.ep = null;
    return { titel: z.titel, oz: z.oz, werte };
  });
}

/** Positionen aus der Positionsdatenbank: Kurztext, Grund- und Folgetext, Einheit; Preis (Mittel) als Schätzung, wenn gewünscht. */
export function ablageAusKatalog(treffer: Werte[], o: { preise?: boolean } = {}): Ablage {
  return treffer.map((t, i) => ({ titel: false, oz: `k${String(i).padStart(5, '0')}`, werte: {
    art: 'normal', kurztext: String(t.kurz ?? '').slice(0, 300), langtext: [t.grundtext, t.langtext].map((x) => String(x ?? '').trim()).filter(Boolean).join('\n'),
    menge: null, einheit: String(t.einheit ?? ''), ep: o.preise && t.ep_mittel != null && t.ep_mittel !== '' ? Number(t.ep_mittel) : null, kostengruppe: null } }));
}
