// Baustein „Zeilen ziehen“: gewählte Zeilen mit der Maus an eine andere Stelle ziehen – überall gleich (LV, Bauzeitenplan).
// Die ganze Zeile ist der Griff (erst ab ein paar Pixeln Weg wird gezogen, ein Klick bleibt ein Klick); sind mehrere gewählt,
// wandern alle; mit Strg wird kopiert. Hält man über einem zugeklappten Punkt kurz still, klappt er auf. Am Rand rollt die
// Fläche mit; Esc bricht ab. Wohin es geht und was beim Loslassen geschieht, sagt die Ansicht.

/** Kurz stillhalten über einem zugeklappten Punkt, dann klappt er auf (ms). */
export const AUFKLAPPEN_NACH = 600;
const SCHWELLE = 6;

export interface Zug<Z> { ids: string[]; ziel: Z; kopie: boolean }

export function zeilenZiehen<Z>(o: {
  start: PointerEvent;
  /** die gezogenen Kennungen – erst wenn wirklich gezogen wird (vorher ggf. die angefasste Zeile wählen) */
  ids: () => string[];
  /** Ziel unter der Maus (oder keins) */
  ziel: (ev: PointerEvent) => Z | null;
  /** zum Zeichnen der Einfügelinie: der Zug, solange er läuft; null am Ende */
  onZug: (z: Zug<Z> | null) => void;
  onAblegen: (z: Zug<Z>) => void;
  /** zugeklappter Punkt unter der Maus (Kennung) – und wie er aufklappt */
  zu?: (ev: PointerEvent) => string | null; aufklappen?: (id: string) => void;
  /** rollt am oberen/unteren Rand mit */
  rollen?: HTMLElement;
}): void {
  const y0 = o.start.clientY;
  let zug: Zug<Z> | null = null, ids: string[] | null = null, letzte: PointerEvent | null = null;
  let warten: { id: string; uhr: ReturnType<typeof setTimeout> } | null = null;
  const stillhalten = (ev: PointerEvent) => {
    const id = o.zu?.(ev) ?? null;
    if (warten && warten.id === id) return;
    if (warten) clearTimeout(warten.uhr);
    warten = id && o.aufklappen ? { id, uhr: setTimeout(() => { o.aufklappen!(id); warten = null; if (letzte) bewegt(letzte); }, AUFKLAPPEN_NACH) } : null;
  };
  const bewegt = (ev: PointerEvent) => {
    letzte = ev;
    if (!ids) { if (Math.abs(ev.clientY - y0) < SCHWELLE) return; ids = o.ids(); }
    const z = o.ziel(ev);
    if (z !== null) { zug = { ids, ziel: z, kopie: ev.ctrlKey || ev.metaKey }; o.onZug(zug); }
    stillhalten(ev);
  };
  const rand = setInterval(() => {
    if (!o.rollen || !letzte || !ids) return;
    const r = o.rollen.getBoundingClientRect(), d = letzte.clientY < r.top + 30 ? -12 : letzte.clientY > r.bottom - 30 ? 12 : 0;
    if (d) { o.rollen.scrollTop += d; bewegt(letzte); }
  }, 30);
  const ende = () => { removeEventListener('pointermove', bewegt); removeEventListener('pointerup', los); removeEventListener('keydown', taste, true); clearInterval(rand); if (warten) clearTimeout(warten.uhr); o.onZug(null); };
  const los = (ev: PointerEvent) => { const z = zug; ende(); if (z) { z.kopie = ev.ctrlKey || ev.metaKey; o.onAblegen(z); } };
  const taste = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && ids) { ev.preventDefault(); ev.stopPropagation(); zug = null; ende(); } };
  addEventListener('pointermove', bewegt); addEventListener('pointerup', los); addEventListener('keydown', taste, true);
}
