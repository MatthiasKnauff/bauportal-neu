// Kosten der KI (Anbieter außerhalb): aus den Tokens im Protokoll des KI-Ausgangs und den Preisen der Anbindung.
// Reine Rechnung – der Server prüft damit den Kostendeckel, die Verwaltung zeigt den Verbrauch.

export interface Preise { preis_ein?: unknown; preis_aus?: unknown }
const zahl = (w: unknown) => (typeof w === 'number' ? w : Number(w) || 0);

/** Kosten in € für so viele Tokens (Preise in € je 1 Mio. Tokens). */
export const kosten = (ein: number, aus: number, p: Preise) => (ein * zahl(p.preis_ein) + aus * zahl(p.preis_aus)) / 1e6;

/** Ist der Kostendeckel des Monats erreicht? Ohne Deckel (leer oder 0) nie. */
export const deckelErreicht = (monatEuro: number, deckel: unknown) => zahl(deckel) > 0 && monatEuro >= zahl(deckel);

/** Restguthaben: aufgeladen minus Verbrauch seit der Aufladung – ohne Aufladung unbekannt. */
export const guthaben = (aufgeladen: unknown, seitherEuro: number) => (zahl(aufgeladen) > 0 ? Math.round((zahl(aufgeladen) - seitherEuro) * 100) / 100 : null);
