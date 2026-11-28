// Ein Plan aus den gespeicherten Einträgen einer Version: Kalender, Terminrechnung und Zeilen für Ausdruck und Export.
// Browser und Server bereiten ihn gleich auf – so zeigen Bildschirm, PDF und Export dieselben Termine.
import type { Werte } from '../../kern/modell';
import { Kalender } from './kalender';
import { abschnitteLesen, rechnen, type Art, type Ergebnis } from './rechnung';
import { vorgaengerSchreiben } from './schreibweise';
import type { Druckzeile } from './druck';

type Eintrag = { id: string; werte: Werte };
const FARBEN = ['#5b8def', '#e8a33d', '#4caf7a', '#d9645b', '#8d6fd1', '#3fb5c4', '#c27c4e', '#7c8b99', '#d4b13f', '#5fa35a', '#c85b9a', '#4d7fa8'];
/** Farbe eines Gewerks – fest aus dem Namen, damit sie auf jedem Gerät und im Druck gleich ist. */
export const GEWERKFARBEN = FARBEN;
/** Farben, die im Plan je Gewerk gewählt sind (am Kalender der Version gespeichert: „Gewerke & Farben“). */
export const gewerkFarbenAus = (zp: Werte | undefined): Record<string, string> => { try { return JSON.parse(String(zp?.gewerkfarben || '{}')) as Record<string, string>; } catch { return {}; } };
export const gewerkFarbe = (g: string, farben: Record<string, string> = {}): string => { if (farben[g]) return farben[g]!; let h = 0; for (const c of g) h = (h * 31 + c.charCodeAt(0)) >>> 0; return g ? FARBEN[h % FARBEN.length]! : '#8aa1b8'; };
export const balkenFarbe = (w: Werte, farben: Record<string, string> = {}): string => String(w.farbe || '') || gewerkFarbe(String(w.gewerk ?? ''), farben);

export function naechsterMontag(heute: string): string {
  const t = Math.floor(Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 1, +heute.slice(8, 10)) / 86400000);
  const w = (new Date(t * 86400000).getUTCDay() + 6) % 7;
  return new Date((t + ((7 - w) % 7)) * 86400000).toISOString().slice(0, 10);
}

export interface Plan { kal: Kalender; erg: Ergebnis; reihe: Eintrag[]; zeilen: Druckzeile[]; links: { id: string; von: string; nach: string; art: Art; abstand: number }[] }

export function planAus(e: { vorgaenge: Eintrag[]; links: Eintrag[]; zeitplan?: Werte; frei: Eintrag[]; land: string; heute: string }): Plan {
  const zp = e.zeitplan ?? {};
  const kal = new Kalender({
    anfang: String(zp.anfang || naechsterMontag(e.heute)), arbeitswoche: Number(zp.arbeitswoche || 5), land: String(zp.bundesland || e.land || 'DE'),
    frei: e.frei.map((f) => ({ von: String(f.werte.von ?? ''), bis: (f.werte.bis as string | null) ?? null, name: String(f.werte.name ?? ''), jaehrlich: f.werte.jaehrlich === true })),
  });
  const farben = gewerkFarbenAus(e.zeitplan);
  const reihe = [...e.vorgaenge].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0));
  const links = e.links.map((l) => ({ id: l.id, von: String(l.werte.von), nach: String(l.werte.nach), art: (l.werte.art || 'ea') as Art, abstand: Number(l.werte.abstand ?? 0), vonAbschnitt: l.werte.von_abschnitt as number | null, nachAbschnitt: l.werte.nach_abschnitt as number | null }));
  const erg = rechnen(reihe.map((v) => ({ id: v.id, ebene: Number(v.werte.ebene ?? 0), dauer: Number(v.werte.dauer ?? 0), abschnitte: abschnitteLesen(v.werte.unterbrechung as string), anfangNichtVor: (v.werte.anfang_nicht_vor as string | null) ?? null, ueberzug: Number(v.werte.ueberzug ?? 0) })), links, kal);
  const nr = (id: string) => erg.termine.get(id)?.nr ?? 0;
  const zeilen: Druckzeile[] = reihe.map((v) => ({
    id: v.id, nr: nr(v.id), name: String(v.werte.name ?? ''), ebene: Number(v.werte.ebene ?? 0), termin: erg.termine.get(v.id)!,
    dauer: abschnitteLesen(v.werte.unterbrechung as string)?.reduce((a, b) => a + b.dauer, 0) ?? Number(v.werte.dauer ?? 0),
    gewerk: String(v.werte.gewerk ?? ''), unternehmer: String(v.werte.unternehmer ?? ''), farbe: balkenFarbe(v.werte, farben), fortschritt: Number(v.werte.fortschritt ?? 0),
    vorg: vorgaengerSchreiben(links.filter((l) => l.nach === v.id).map((l) => ({ nr: nr(l.von), art: l.art, abstand: l.abstand })).sort((a, b) => a.nr - b.nr)),
  }));
  return { kal, erg, reihe, zeilen, links };
}
