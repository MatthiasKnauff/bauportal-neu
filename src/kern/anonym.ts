// Anonymisierung vor einer KI außerhalb des Büros: Namen (Kontakte, Projekte, Benutzer, Büro), Anschriften,
// E-Mail-Adressen, Telefonnummern und Kontonummern werden durch zufällige zwölfstellige Nummern ersetzt.
// Die Zuordnung bleibt im Bauportal; in der Antwort der KI werden die Nummern wieder zu Klartext.
// Reine Textfunktion – gleich für jeden, der nach außen gibt (KI-Text, später Mails und Diktat).

export interface Ersetzt { text: string; karte: Map<string, string> }   // karte: Nummer -> Klartext

const MUSTER = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                               // E-Mail
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g,   // IBAN
  /(?<![\w/])(?:\+\d{2}|0)[\d ()/-]{6,}\d/g,                     // Telefon
];
const maske = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nummer(vergeben: Set<string>): string {
  for (;;) {
    const z = crypto.getRandomValues(new Uint32Array(2));
    const n = String((BigInt(z[0]!) << 32n | BigInt(z[1]!)) % 900000000000n + 100000000000n);
    if (!vergeben.has(n)) { vergeben.add(n); return n; }
  }
}

/** namen: alles, was als Name oder Anschrift bekannt ist. Kürzer als drei Zeichen wird nicht ersetzt (zu viele Zufallstreffer). */
export function anonymisieren(text: string, namen: Iterable<string>): Ersetzt {
  const karte = new Map<string, string>();
  const rueck = new Map<string, string>();   // Klartext (klein) -> Nummer: derselbe Name bekommt überall dieselbe Nummer
  const vergeben = new Set<string>();
  const marke = (klar: string) => {
    const k = klar.toLowerCase();
    let n = rueck.get(k);
    if (!n) { n = nummer(vergeben); rueck.set(k, n); karte.set(n, klar); }
    return `[[${n}]]`;
  };
  let aus = text;
  for (const m of MUSTER) aus = aus.replace(m, (treffer) => marke(treffer));
  // die längsten zuerst: „Müller Bau GmbH“ vor „Müller“
  const liste = [...new Set([...namen].map((n) => n.trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  for (const n of liste) {
    aus = aus.replace(new RegExp(`(?<![\\p{L}\\p{N}\\[])${maske(n).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'), (treffer) => marke(treffer));
  }
  return { text: aus, karte };
}

/** Setzt in der Antwort die Nummern wieder zu Klartext – auch wenn die KI die Klammern weggelassen hat. */
export function klartext(text: string, karte: Map<string, string>): string {
  return text.replace(/\[{0,2}(\d{12})\]{0,2}/g, (ganz, n: string) => karte.get(n) ?? ganz);
}

/** Hinweis an die KI, damit sie die Nummern stehen lässt. */
export const PLATZHALTER_HINWEIS = 'Zwölfstellige Nummern in doppelten eckigen Klammern, z. B. [[123456789012]], stehen für Namen und Anschriften. Übernimm sie unverändert und erfinde keine neuen.';
