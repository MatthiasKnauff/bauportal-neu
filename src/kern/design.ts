// Designs: Farben, Ecken, Schatten und Schriften des Bauportals als ein Satz Variablen (siehe ui/stil.css :root).
// Standard hell und dunkel sind eingebaut. Weitere Designs werden im shadcn-Format eingefügt (tweakcn, shadcn.io …)
// und hier in unsere Variablen übersetzt – gespeichert im Büro, nie live von außen geladen.

export type Satz = Record<string, string>;
export interface Design { hell: Satz; dunkel: Satz }

/** Unsere Variablen – genau diese darf ein Design setzen. */
export const VARIABLEN = ['grund', 'flaeche', 'rand', 'rand-stark', 'text', 'text-still', 'akzent', 'akzent-hell', 'auf-akzent', 'gefahr', 'gut', 'warn',
  'kopf', 'auf-kopf', 'auf-kopf-still', 'still', 'still-hell', 'rund', 'schatten', 'schrift', 'schrift-mono', 'abstand-buchstaben'] as const;

export const STANDARD: Design = {
  hell: {},   // die Werte aus stil.css
  dunkel: {
    grund: '#15181d', flaeche: '#1d2128', rand: '#2c323b', 'rand-stark': '#3a414c', text: '#e7e9ec', 'text-still': '#9aa3ad',
    akzent: '#6d9bff', 'auf-akzent': '#0b1220', gefahr: '#f0796f', gut: '#6cc483', warn: '#f2b35b',
    kopf: '#0f1216', 'auf-kopf': '#f3f4f6', 'auf-kopf-still': '#9aa3ad', still: '#252a32', 'still-hell': '#21252c', schatten: '0 14px 40px rgba(0, 0, 0, .55)',
  },
};

// shadcn-Name → unsere Variable
const ABBILDUNG: Record<string, string> = {
  background: 'grund', card: 'flaeche', foreground: 'text', 'muted-foreground': 'text-still', border: 'rand', input: 'rand-stark',
  primary: 'akzent', 'primary-foreground': 'auf-akzent', muted: 'still', secondary: 'still-hell', destructive: 'gefahr',
  sidebar: 'kopf', 'sidebar-foreground': 'auf-kopf', 'font-sans': 'schrift', 'font-mono': 'schrift-mono', 'shadow-xl': 'schatten', 'tracking-normal': 'abstand-buchstaben',
};

/** Liest ein Theme im shadcn-Format (:root { … } und .dark { … }) und übersetzt es. Unbekanntes bleibt weg. */
export function themeLesen(css: string): Design {
  const block = (sel: RegExp): Satz => {
    const m = sel.exec(css); if (!m) return {};
    const aus: Satz = {};
    for (const [, name, wert] of m[1]!.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const w = wert!.trim();
      if (/[{}<>]|url\(|expression|javascript:/i.test(w) || w.length > 300) continue;   // nur Werte, keine eingeschmuggelten Regeln
      if (name === 'radius') { const r = /^([\d.]+)(rem|px)$/.exec(w); if (r) aus.rund = String(Math.round((Number(r[1]) * (r[2] === 'rem' ? 16 : 1) / 8) * 100) / 100); continue; }
      const ziel = ABBILDUNG[name!]; if (!ziel) continue;
      aus[ziel] = /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(w) ? `hsl(${w})` : w;   // ältere shadcn-Themes: nur die HSL-Zahlen
    }
    if (aus.kopf && !aus['auf-kopf-still'] && aus['text-still']) aus['auf-kopf-still'] = aus['text-still'];
    return aus;
  };
  const d: Design = { hell: block(/:root\s*\{([^}]*)\}/), dunkel: block(/\.dark\s*\{([^}]*)\}/) };
  if (!Object.keys(d.hell).length && !Object.keys(d.dunkel).length) throw new Error('Darin steht kein Design im shadcn-Format (:root { --background: … }).');
  return d;
}

/** Schriftfamilien, die ein Design braucht (erste Familie aus schrift und schrift-mono, ohne Systemschriften). */
export function schriften(d: Design): string[] {
  const SYSTEM = /^(system-ui|ui-[a-z-]+|sans-serif|serif|monospace|-apple-system|inherit|Inter|Segoe UI|Arial|Helvetica|Consolas)$/i;
  const aus = new Set<string>();
  for (const s of [d.hell, d.dunkel]) for (const k of ['schrift', 'schrift-mono']) {
    const erste = s[k]?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    if (erste && !SYSTEM.test(erste) && /^[A-Za-z0-9 ]{2,40}$/.test(erste)) aus.add(erste);
  }
  return [...aus];
}

/** Die Variablen, die für Benutzer und Modus gelten: Standard, darüber das gewählte Design, darüber die eigene Rundung. */
export function satzFuer(design: Design | null, dunkel: boolean, rund?: number | null): Satz {
  const s: Satz = { ...(dunkel ? STANDARD.dunkel : STANDARD.hell), ...(design ? (dunkel ? (Object.keys(design.dunkel).length ? design.dunkel : design.hell) : design.hell) : {}) };
  if (rund !== null && rund !== undefined && Number.isFinite(rund)) s.rund = String(rund);
  return s;
}
