// Baustein „Zeilenwahl“: Zeilen wählen wie in Windows – Klick wählt eine, Strg+Klick dazu/ab, Umschalt+Klick (oder Umschalt+↑/↓)
// von … bis, Strg+A alle, Esc nur noch die eine. Die markierte Zeile ist der Zeiger (ihr folgt die Karte rechts), die Auswahl die
// Menge, auf die Befehle wirken. Für jede Baumtabelle gleich (Balkenplan, LV …).
import { createSignal } from 'solid-js';

export function zeilenwahl(o: { reihe: () => string[]; sichtbar: () => string[]; onZeiger: (id: string | null) => void }) {
  const [markiertRoh, markieren] = createSignal<string | null>(null);
  // eine Zeile, die es nicht mehr gibt (gelöscht, Rückgängig), ist nicht mehr markiert
  const markiert = () => { const m = markiertRoh(); return m && o.reihe().includes(m) ? m : null; };
  const [auswahl, setAuswahl] = createSignal<Set<string>>(new Set());
  let anker: string | null = null;
  const zeiger = (id: string) => { markieren(id); o.onZeiger(id); };   // die Karte folgt, die Auswahl bleibt
  const w = {
    markiert, auswahl,
    /** Zeiger auf eine Zeile setzen, die Auswahl bleibt (z. B. Rechtsklick auf eine der gewählten). */
    zeiger,
    /** Eine Zeile wählen (Auswahl = nur sie); null: keine. */
    setMarkiert(id: string | null) { markieren(id); o.onZeiger(id); setAuswahl(new Set(id ? [id] : [])); anker = id; },
    /** Mehrere wählen, die erste wird Zeiger (z. B. nach Einfügen oder Duplizieren). */
    mehrere(ids: string[]) { if (!ids.length) return; markieren(ids[0]!); o.onZeiger(ids[0]!); setAuswahl(new Set(ids)); anker = ids[0]!; },
    /** Nur den Zeiger setzen, ohne die Karte zu benachrichtigen (z. B. Sprung von außen). */
    zeigerStill: (id: string) => markieren(id),
    bisZu(id: string) {
      const l = o.sichtbar(), a = l.indexOf(anker ?? id), b = l.indexOf(id);
      setAuswahl(new Set(l.slice(Math.min(a, b), Math.max(a, b) + 1))); zeiger(id);
    },
    klick(e: MouseEvent, id: string) {
      if (e.ctrlKey || e.metaKey) { const n = new Set(auswahl()); if (n.has(id) && n.size > 1) n.delete(id); else n.add(id); setAuswahl(n); anker = id; zeiger(id); }
      else if (e.shiftKey && anker) w.bisZu(id);
      else w.setMarkiert(id);
    },
    alle() { const l = o.sichtbar(); setAuswahl(new Set(l)); anker = l[0] ?? null; },
    /** Umschalt+↑/↓: die Auswahl um eine Zeile erweitern bzw. verkleinern. */
    erweitern(id: string) { if (!anker) anker = markiert(); w.bisZu(id); },
    istGewaehlt: (id: string) => auswahl().has(id),
    /** Die gewählten in der Reihenfolge – ohne Auswahl die markierte. */
    gewaehlt(): string[] { const s = auswahl(); return s.size ? o.reihe().filter((id) => s.has(id)) : markiert() ? [markiert()!] : []; },
  };
  return w;
}
