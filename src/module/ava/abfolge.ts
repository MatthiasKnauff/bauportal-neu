// Ablauf eines Leistungsverzeichnisses (wie im bisherigen Bauportal): LV → Versand & Rücklauf → Angebote → Besprechung →
// Vergabe → Aufmaß → Abrechnung. Wie weit ein LV ist, ergibt sich aus seinem Inhalt; jeder Schritt öffnet seine Ansicht.
// Aufgehoben: die Stufe „Vergabe“ heißt „nicht vergeben“, Aufmaß und Abrechnung entfallen.

/** id = die Ansicht der AVA, die der Schritt öffnet. */
export interface AvaSchritt { id: string; titel: string; weg?: boolean }

export interface AvaInhalt {
  status: string;          // Stand des LV (bearbeitung, versendet, angebote, vergeben, aufgehoben)
  angeschrieben: number;   // Bieter:innen, die das LV bekommen haben
  eingegangen: number;     // Angebote, die eingegangen sind
  besprochen: boolean;     // eine Angebotsbesprechung ist abgeschlossen
  vergeben: boolean;       // ein Angebot ist beauftragt
  aufmass: boolean;        // es gibt Aufmaß
  abgerechnet: boolean;    // es gibt eine Rechnung
}

const SCHRITTE: AvaSchritt[] = [
  { id: 'lv', titel: 'LV' }, { id: 'versand', titel: 'Versand & Rücklauf' }, { id: 'preisspiegel', titel: 'Angebote' },
  { id: 'besprechungen', titel: 'Besprechung' }, { id: 'auftraege', titel: 'Vergabe' }, { id: 'aufmass', titel: 'Aufmaß' }, { id: 'rechnungen', titel: 'Abrechnung' },
];

/** Ansichten, die zu einem Schritt gehören, ohne selbst einer zu sein (Nachverfolgen gehört zu Versand & Rücklauf …). */
const DAZU: Record<string, string> = { nachverfolgen: 'versand', angebote: 'preisspiegel', bauvertraege: 'auftraege', nachtraege: 'auftraege', positionen: 'lv', lvs: 'lv' };

export function avaAbfolge(i: AvaInhalt): { schritte: AvaSchritt[]; stand: string } {
  const erreicht: Record<string, boolean> = {
    lv: true,
    versand: ['versendet', 'angebote', 'vergeben'].includes(i.status) || i.angeschrieben > 0,
    preisspiegel: ['angebote', 'vergeben'].includes(i.status) || i.eingegangen > 0,
    besprechungen: i.besprochen,
    auftraege: i.vergeben,
    aufmass: i.vergeben && i.aufmass,
    rechnungen: i.vergeben && i.abgerechnet,
  };
  if (i.status === 'aufgehoben' && !i.vergeben) {
    const schritte = SCHRITTE.map((s) => (s.id === 'auftraege' ? { ...s, titel: 'nicht vergeben' } : s.id === 'aufmass' || s.id === 'rechnungen' ? { ...s, weg: true } : s));
    return { schritte, stand: 'auftraege' };
  }
  let stand = 'lv';
  for (const s of SCHRITTE) if (erreicht[s.id]) stand = s.id;
  return { schritte: SCHRITTE, stand };
}

/** Der Schritt einer Ansicht der AVA (für die Markierung „hier“); keiner, wenn die Ansicht nicht im Ablauf steht. */
export function avaSchrittVon(ansicht: string): string | undefined {
  return SCHRITTE.some((s) => s.id === ansicht) ? ansicht : DAZU[ansicht];
}
