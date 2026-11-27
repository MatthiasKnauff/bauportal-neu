// Positionsarten eines LV: die eine Stelle für die Regel, welche Zeilen nur Text sind (ohne Menge und Preis).
// Im Kern neben oz.ts, weil Druckwerk, GAEB, Rechenwege und Oberfläche sie gleichermaßen brauchen.

/** Hinweistext oder Vorbemerkung (GAEB: Remark). */
export const istHinweis = (art: unknown) => art === 'hinweis' || art === 'vorbemerkung';
/** Zeile ohne Menge und Preis: Titel, Hinweistext, Vorbemerkung. */
export const istText = (art: unknown) => art === 'titel' || istHinweis(art);
