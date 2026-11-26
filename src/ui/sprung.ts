// Sprung zu einem Eintrag – aus der Suche über alles oder aus einer Karte (z. B. vom Kontakt zu seinem Projekt): Die
// Oberfläche öffnet Modul und Ansicht, wählt Projekt und Version, und die Ansicht des Objekts zeigt den Eintrag in ihrer
// Karte. Ein Signal, das die Oberfläche (Modul öffnen) und die Ansicht (Eintrag zeigen) je einmal abholen.
import { createSignal } from 'solid-js';
import { zustand } from './unterbau/api';
import { setProjektId, waehleVersion } from './projekt';

export interface Sprung { objekt: string; id: string; modul: string; ansicht: string }
export const [sprung, setSprung] = createSignal<Sprung | null>(null);

/** Zum Eintrag springen: in die erste Ansicht, die diese Objektart zeigt; Projekt und Version wählen, wenn sie dazugehören. */
export function springeZu(objekt: string, id: string, o: { projekt?: string | null; version?: string | null; modul?: string; ansicht?: string } = {}): void {
  const z = zustand();
  const m = z?.module.find((x) => (o.modul ? x.id === o.modul : x.ansichten.some((a) => a.objekt === objekt)));
  if (!m) return;
  const modell = m.objekte.find((x) => x.name === objekt) ?? z!.module.flatMap((x) => x.objekte).find((x) => x.name === objekt);
  if (o.projekt && objekt !== 'projekt') setProjektId(o.projekt);
  if (o.projekt && o.version && modell?.versionsBereich) waehleVersion(o.projekt, modell.versionsBereich, o.version);
  setSprung({ objekt, id, modul: m.id, ansicht: o.ansicht ?? m.ansichten.find((a) => a.objekt === objekt)?.id ?? '' });
}

/** Nur eine App (und Ansicht) öffnen, ohne Eintrag – z. B. vom Bautagebuch zu den Kontakten des Projekts. */
export function appOeffnen(modul: string, ansicht = ''): void { setSprung({ objekt: '', id: '', modul, ansicht }); }

/** Abholen (einmal): die Kennung, wenn der Sprung dieser Objektart gilt. */
export function sprungAbholen(objekt: string): string | null {
  const s = sprung();
  if (!s || s.objekt !== objekt) return null;
  setSprung(null);
  return s.id;
}
