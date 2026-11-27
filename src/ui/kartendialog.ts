// Eine Detailkarte als Fenster über der Ansicht (wie bisher „Projektdaten …“ und „Ausschreibungsdaten …“): man bleibt, wo man ist.
// Hier nur der Auftrag; gezeigt wird das Fenster in ansichten.tsx (dort sitzen die Stellschrauben der Karten).
import { createSignal } from 'solid-js';

export interface KartenAuftrag { objekt: string; id: string; titel: string; ohneOben?: boolean }
const [karteImFenster, setKarteImFenster] = createSignal<KartenAuftrag | null>(null);
export { karteImFenster, setKarteImFenster };
/** Karte eines Eintrags im Fenster öffnen (ohneOben: ohne den Überblick über den Feldern, nur die Angaben). */
export const karteOeffnen = (a: KartenAuftrag) => setKarteImFenster(a);
