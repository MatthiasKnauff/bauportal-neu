// Eine Position in einer anderen Ansicht der Ausschreibung zeigen (Kontextmenü „Im Leistungsverzeichnis zeigen“, „In der Aufmaßprüfung
// zeigen“, Treffer der Suche): die Ansicht öffnen, der LV-Baum dort wählt das LV und markiert die Zeile. Eigenes Modul, damit Suche und
// LV-Baum einander nicht einbinden.
import { createSignal } from 'solid-js';
import { appOeffnen } from './sprung';

export const [zuZeigen, setZuZeigen] = createSignal<{ id: string; ansicht: string } | null>(null);
export function positionZeigen(id: string, ansicht: 'lv' | 'aufmass'): void { setZuZeigen({ id, ansicht }); appOeffnen('ava', ansicht); }
