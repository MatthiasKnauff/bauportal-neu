// Unterbau: die Liste der kurzen Meldungen (Hinweise) – wer etwas melden will, ruft hinweis(); gezeigt werden sie vom
// Baustein „Hinweise“. Liegt im Unterbau, damit auch der Abgleich melden kann, ohne den Baukasten zu kennen.
import { createStore, produce } from 'solid-js/store';

export interface Hinweis { nr: number; text: string; art: 'info' | 'fehler'; aktion?: { titel: string; tun: () => void } }
const [liste, setListe] = createStore<Hinweis[]>([]);
export const meldungen = liste;
let zaehler = 0;

export function hinweis(text: string, o: { art?: Hinweis['art']; aktion?: Hinweis['aktion'] } = {}): void {
  const nr = ++zaehler;
  const art = o.art ?? 'info';
  // wie im bisherigen Bauportal immer nur eine Meldung: die neue ersetzt die vorige (nie ein Stapel)
  setListe(produce((l) => { l.splice(0, l.length, { nr, text, art, aktion: o.aktion }); }));
  setTimeout(() => meldungSchliessen(nr), art === 'fehler' || o.aktion ? 12000 : 5000);
}
export function meldungSchliessen(nr: number): void { setListe((l) => l.filter((h) => h.nr !== nr)); }
