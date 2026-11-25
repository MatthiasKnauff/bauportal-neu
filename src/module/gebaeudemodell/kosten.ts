// Kostenrahmen aus Gebäudekennwerten: Brutto-Grundfläche × Kennwert der passenden Gebäudeart, mit dem Baupreisindex vom
// Kostenstand auf heute hochgerechnet. Erster Stand sind die NHK 2010 (Katalog „Gebäudekennwerte“); Spanne Standardstufe 3 bis 4.
// Reine Rechnung ohne Datenbank: läuft in der Oberfläche und in den Tests. Das Verfahren steht in der Hilfe der Ansicht Gebäudekennwerte.
import type { Werte } from '../../kern/modell';

export interface Kennwert { nummer: string; gebaeudeart: string; ausfuehrung: string; stufen: (number | null)[]; kostenstand: number; index: string }
export interface Indexwert { jahr: number; quartal: string; wohn: number; buero: number; gewerbe: number }
export interface Kostenrahmen {
  kennwert: Kennwert;
  faktor: number;                // Index heute ÷ Index im Jahr des Kostenstands
  stand: string;                 // z. B. „3. Quartal 2026“
  von: number; bis: number;      // €/m² BGF heute (Stufe 3 bzw. 4)
  bgf: number;
  summeVon: number; summeBis: number;
  annahmen: string[];
}

const QUARTAL: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

/** Welche Zeile der NHK 2010 zum Gebäude passt – aus Gebäudeart, Keller, Geschossen, Dach und Einheiten. */
export function nhkNummer(g: Werte, annahmen: string[] = []): string | null {
  const art = String(g.nutzung ?? ''), geschosse = Number(g.geschosszahl ?? 0), einheiten = Number(g.einheiten ?? 0);
  switch (art) {
    case 'efh': {
      const keller = g.keller ? g.keller !== 'ohne' : (annahmen.push('mit Keller angenommen'), true);
      const og = geschosse >= 2 || (!geschosse && (annahmen.push('Erd- und Obergeschoss angenommen'), true));
      const dach = g.dach_oben === 'nichts' ? 3 : g.dach_oben === 'kalt' ? 2 : (g.dach_oben ? 1 : (annahmen.push('ausgebautes Dach angenommen'), 1));
      annahmen.push('freistehendes Haus angenommen (Doppel- und Reihenhäuser sind etwas günstiger)');
      return `1.${keller ? (og ? 1 : 0) : (og ? 3 : 2)}${dach}`;
    }
    case 'mfh': case 'wohnung':
      if (!einheiten) annahmen.push('bis 6 Wohnungen angenommen');
      return einheiten > 20 ? '4.3' : einheiten > 6 ? '4.2' : '4.1';
    case 'wohn_geschaeft': return '5.1';
    case 'buero': return g.tragwerk === 'stahlbeton' ? '6.2' : '6.1';
    case 'bildung': annahmen.push('Schule angenommen (Kindergärten sind etwas günstiger)'); return '8.2';
    case 'gesundheit': annahmen.push('Alten- und Pflegeheim angenommen'); return '9.2';
    case 'gewerbe': return '15.1';
    case 'handel': return '13.1';
    case 'garage': return '14.1';
    default: return null;
  }
}

/** Der jüngste Indexwert und der Jahresdurchschnitt des Kostenstands (ohne Quartal). */
function index(reihe: Indexwert[], jahr: number): { heute: Indexwert; basis: Indexwert } | null {
  const basis = reihe.find((x) => x.jahr === jahr && !x.quartal);
  const heute = [...reihe].filter((x) => x.quartal).sort((a, b) => b.jahr - a.jahr || (QUARTAL[b.quartal] ?? 0) - (QUARTAL[a.quartal] ?? 0))[0];
  return basis && heute ? { heute, basis } : null;
}

export function kostenrahmen(g: Werte, bgf: number, kennwerte: Kennwert[], reihe: Indexwert[]): Kostenrahmen | { fehlt: string } {
  if (!g.nutzung) return { fehlt: 'Für den Kostenrahmen fehlt die Gebäudeart.' };
  const massnahme = String(g.massnahme ?? '').split(',').filter(Boolean);
  if (massnahme.length && !massnahme.includes('neubau')) return { fehlt: 'Gebäudekennwerte gelten für Neubauten – für Umbau und Sanierung gibt es noch keinen Kostenrahmen.' };
  if (!(bgf > 0)) return { fehlt: 'Für den Kostenrahmen fehlt die Brutto-Grundfläche.' };
  const annahmen: string[] = [];
  const nr = nhkNummer(g, annahmen);
  const kennwert = nr ? kennwerte.find((k) => k.nummer === nr) : undefined;
  if (!kennwert) return { fehlt: 'Für diese Gebäudeart gibt es noch keinen Kennwert (Baudaten → Gebäudekennwerte).' };
  const s3 = kennwert.stufen[2], s4 = kennwert.stufen[3];
  if (s3 == null || s4 == null) return { fehlt: 'Der Kennwert hat keine Werte für die Stufen 3 und 4.' };
  const ix = index(reihe, kennwert.kostenstand);
  if (!ix) return { fehlt: 'Der Baupreisindex fehlt (Verwaltung → Updates → Katalog „Baupreisindex“ einspielen).' };
  const reiheName = (['wohn', 'buero', 'gewerbe'].includes(kennwert.index) ? kennwert.index : 'wohn') as 'wohn' | 'buero' | 'gewerbe';
  const faktor = ix.heute[reiheName] / ix.basis[reiheName];
  const von = Math.round(s3 * faktor), bis = Math.round(s4 * faktor);
  return {
    kennwert, faktor, stand: `${QUARTAL[ix.heute.quartal] ?? ''}. Quartal ${ix.heute.jahr}`, von, bis, bgf,
    summeVon: Math.round((von * bgf) / 1000) * 1000, summeBis: Math.round((bis * bgf) / 1000) * 1000, annahmen,
  };
}
