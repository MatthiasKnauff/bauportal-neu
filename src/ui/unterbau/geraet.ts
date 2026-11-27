// Das Gerät: Handy oder Rechner – ein Baustein für alle (wie im bisherigen Bauportal schaltet die Handyansicht bis 820 px
// Breite; ein Tablet quer bleibt normal). Dazu die Handystufe der geöffneten App (Beipackzettel „handy“) und das ＋,
// das eine App am Handy in die Leiste unten legt.
import { createSignal } from 'solid-js';
import type { Handystufe } from '../../kern/modul';
import { holen, merken } from './speicher';

export const HANDY_BREITE = 820;
const abfrage = typeof matchMedia === 'function' ? matchMedia(`(max-width: ${HANDY_BREITE}px)`) : null;
const [handy, setHandy] = createSignal(!!abfrage?.matches);
abfrage?.addEventListener('change', (e) => setHandy(e.matches));
/** Schmales Fenster (Handy): die Plätze stehen nacheinander, unten die Leiste. */
export { handy };

const [stufe, setStufe] = createSignal<Handystufe>('voll');
/** Was die geöffnete App am Handy darf – setzt die Oberfläche beim Wechsel der App (Startseite: voll). */
export { stufe as handystufe, setStufe as setHandystufe };
/** Am Handy nur ansehen? Dann gilt jedes Recht zum Ändern als nicht da (die Bausteine fragen ohnehin darf()). */
export const nurAnsehen = () => handy() && (stufe() === 'lesen' || stufe() === 'keine');

export interface HandyPlus { titel: string; tun: () => void }
const [plus, setPlus] = createSignal<HandyPlus | null>(null);
/** Das ＋ der Leiste unten: der Hauptknopf („Neu“) der geöffneten Ansicht – nur in Apps, die am Handy alles können. */
export { plus as handyPlus, setPlus as setHandyPlus };

// Leiste unten: Vorgabe wie im bisherigen Bauportal (Start · Bautagebuch · Aufgaben · Adressen · Suche); fehlt eine App,
// rückt die nächste aus ERSATZ nach – vor die Suche, damit das ＋ immer in der Mitte steht.
export const LEISTE_VORGABE = ['start', 'bautagebuch', 'aufgaben', 'adressen', 'suche'];
export const ERSATZ = ['aufgaben', 'bautagebuch', 'adressen', 'dateien', 'bauzeitenplan', 'ava'];
/** Die gewählten Plätze aus der Darstellung („start,bautagebuch,…“) – leer: die Vorgabe. */
export const handyleistePlaetze = (w: unknown): string[] => { const l = String(w ?? '').split(',').map((x) => x.trim()).filter(Boolean); return l.length ? l : LEISTE_VORGABE; };

/** Apps mit eigener Handyansicht: am Handy auf „Desktop-Ansicht“ umgeschaltet (wie bisher, je Gerät gemerkt) – zurück über „Handy-Ansicht“. */
const [desktop, setDesktop] = createSignal<string[]>(holen('bp_desktop_apps', []));
export const desktopGewaehlt = (app: string) => desktop().includes(app);
export function desktopWaehlen(app: string, an: boolean): void {
  setDesktop(an ? [...new Set([...desktop(), app])] : desktop().filter((x) => x !== app)); merken('bp_desktop_apps', desktop());
}
