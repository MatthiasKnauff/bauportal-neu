// Sprung zu einem Eintrag – aus der Suche über alles: Die Oberfläche öffnet Modul und Ansicht, wählt Projekt und Version,
// und die Ansicht des Objekts zeigt den Eintrag in ihrer Karte. Ein Signal, das die Ansicht beim Öffnen einmal abholt.
import { createSignal } from 'solid-js';

export const [sprung, setSprung] = createSignal<{ objekt: string; id: string } | null>(null);
/** Abholen (einmal): die Kennung, wenn der Sprung dieser Objektart gilt. */
export function sprungAbholen(objekt: string): string | null {
  const s = sprung();
  if (!s || s.objekt !== objekt) return null;
  setSprung(null);
  return s.id;
}
