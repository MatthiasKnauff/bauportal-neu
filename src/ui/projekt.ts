// Das gewählte Projekt (eine Auswahl oben, gilt in allen Apps) und die gewählte Version je Projekt und Bereich.
// Beides merkt sich das Gerät.
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

const lies = <T>(k: string, sonst: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? sonst; } catch { return sonst; } };
const merke = (k: string, w: unknown) => { try { localStorage.setItem(k, JSON.stringify(w)); } catch { /* gesperrt */ } };

const [projektIdRoh, setProjektIdRoh] = createSignal<string | null>(lies('bp_projekt', null));
export const projektId = projektIdRoh;
export function setProjektId(id: string | null): void { setProjektIdRoh(id); merke('bp_projekt', id); }

const [versionen, setVersionen] = createStore<Record<string, string>>(lies('bp_versionen', {}));
export const gewaehlteVersion = (projekt: string, bereich: string): string | undefined => versionen[`${projekt}:${bereich}`];
export function waehleVersion(projekt: string, bereich: string, id: string): void { setVersionen(`${projekt}:${bereich}`, id); merke('bp_versionen', { ...versionen }); }

/** Name der Bauherr:in eines Projekts (Kontakt aus den Projektdaten). */
export const bauherrVon = (w: Record<string, unknown> | undefined, kontakte: Record<string, { werte: Record<string, unknown> }> | undefined): string =>
  (w?.bauherrschaft ? String(kontakte?.[String(w.bauherrschaft)]?.werte.name ?? '') : '');
