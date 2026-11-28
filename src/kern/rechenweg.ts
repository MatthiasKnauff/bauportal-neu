// Rechenweg eines Aufmaßes (wie im bisherigen Bauportal): je Zeile ein Ansatz, z. B. „Wand Nord: 2,5 * 3,10 - 0,8*2“.
// Erlaubt sind Zahlen mit Komma, + − * / und Klammern; Text vor einem Doppelpunkt ist Beschriftung. Die Zeilen werden
// zusammengezählt. Gerechnet wird mit einem eigenen kleinen Leser – nie mit eval.

export interface Ansatz { text: string; wert: number | null }
export interface Rechenweg { zeilen: Ansatz[]; summe: number | null; fehler: boolean }

/** Ein Ausdruck – null, wenn er nicht lesbar ist. */
export function ausdruck(text: string): number | null {
  const t = text.replace(/\s+/g, '').replace(/[×x·]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-');
  if (!t) return null;
  let i = 0;
  const zahl = (): number | null => {
    const m = /^\d+(?:[.,]\d+)?/.exec(t.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0].replace(',', '.'));
  };
  const faktor = (): number | null => {
    if (t[i] === '-') { i++; const f = faktor(); return f == null ? null : -f; }
    if (t[i] === '+') { i++; return faktor(); }
    if (t[i] === '(') { i++; const s = summe(); if (s == null || t[i] !== ')') return null; i++; return s; }
    return zahl();
  };
  const produkt = (): number | null => {
    let a = faktor();
    while (a != null && (t[i] === '*' || t[i] === '/')) {
      const op = t[i++], b = faktor();
      if (b == null || (op === '/' && b === 0)) return null;
      a = op === '*' ? a * b : a / b;
    }
    return a;
  };
  const summe = (): number | null => {
    let a = produkt();
    while (a != null && (t[i] === '+' || t[i] === '-')) {
      const op = t[i++], b = produkt();
      if (b == null) return null;
      a = op === '+' ? a + b : a - b;
    }
    return a;
  };
  const w = summe();
  return w != null && i === t.length ? w : null;
}

const runden = (n: number) => Math.round(n * 1000) / 1000;

/** Den ganzen Rechenweg lesen: je Zeile (oder durch „;“ getrennt) ein Ansatz, Beschriftung vor dem letzten „:“ – „Wand: 2*3“. */
export function rechenweg(text: unknown): Rechenweg {
  const zeilen = String(text ?? '').split(/[\n;]/).map((z) => z.trim()).filter(Boolean).map((z): Ansatz => {
    const teil = /^[^:]*[A-Za-zÄÖÜäöüß][^:]*:(.*)$/.exec(z);
    const w = ausdruck(teil ? teil[1]! : z);
    return { text: z, wert: w == null ? null : runden(w) };
  });
  const fehler = zeilen.some((z) => z.wert == null);
  return { zeilen, fehler, summe: zeilen.length && !fehler ? runden(zeilen.reduce((s, z) => s + z.wert!, 0)) : null };
}
