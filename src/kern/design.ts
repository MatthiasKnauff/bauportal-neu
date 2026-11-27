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

// Vorinstallierte Designs: die Farbschemen des bisherigen Bauportals (Hintergrund, Karte, Linie, Schrift, gedämpfte Schrift, Reiter,
// Akzent), in unsere Variablen übersetzt. Dunkle Schemen sind immer dunkel. Das Büro bekommt sie beim Start als eigene Designs.
interface Schema { bg: string; card: string; line: string; ink: string; mute: string; tabs: string; akzent: string; dunkel: boolean }
const mische = (a: string, b: string, t: number) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t).toString(16).padStart(2, '0')).join('');
export const helligkeit = (c: string) => { const n = parseInt(c.slice(1, 7), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
/** Schrift auf der Akzentfarbe: dunkel auf hellen Farben, weiß auf dunklen. */
export const aufFarbe = (c: string) => (helligkeit(c) > 0.55 ? '#111111' : '#ffffff');
function ausSchema(f: Schema): Satz {
  const kopf = f.dunkel ? mische(f.bg, '#000000', 0.35) : mische(f.ink, f.akzent, 0.12);
  return {
    grund: f.bg, flaeche: f.card, rand: f.line, 'rand-stark': mische(f.line, f.ink, 0.18), text: f.ink, 'text-still': f.mute,
    still: f.tabs, 'still-hell': mische(f.bg, f.card, 0.5), akzent: f.akzent, 'auf-akzent': aufFarbe(f.akzent),
    kopf, 'auf-kopf': f.dunkel ? f.ink : '#f6f5f2', 'auf-kopf-still': f.dunkel ? f.mute : mische('#f6f5f2', kopf, 0.4),
    ...(f.dunkel ? { gefahr: '#ff7a6b', gut: '#3ddc84', warn: '#ffad5c', schatten: '0 14px 40px rgba(0, 0, 0, .55)' } : {}),
  };
}
const S = (bg: string, card: string, line: string, ink: string, mute: string, tabs: string, akzent: string, dunkel = false): Schema => ({ bg, card, line, ink, mute, tabs, akzent, dunkel });
export const VORINSTALLIERT: { schluessel: string; name: string; gruppe: string; beschreibung: string; design: Design }[] = ([
  ['bauportal_dunkel', 'Bauportal Dunkel', 'Wie bisher', 'das dunkle Bauportal mit Pink', S('#26282b', '#2d2f33', '#3b3e42', '#f3f3f1', '#9a9c9e', '#303236', '#ff5fb3', true)],
  ['bauportal_hell', 'Bauportal Hell', 'Wie bisher', 'helle Flächen, kräftiger Akzent', S('#f3f2ef', '#ffffff', '#d9d8d3', '#232427', '#686a6d', '#e7e5e0', '#d6338a')],
  ['klassisch_gruen', 'Klassisch Grün', 'Wie bisher', 'hell mit Grün wie der Bauzeitenplan', S('#f3f2ef', '#ffffff', '#d9d8d3', '#232427', '#686a6d', '#e7e5e0', '#1f9d55')],
  ['sand', 'Sand & Salbei', 'Gedämpft', 'warm, ruhig, naturnah', S('#f1eee7', '#fbfaf6', '#ddd7cb', '#2b2a26', '#66625a', '#e6e1d5', '#56775f')],
  ['nebel', 'Nebel', 'Gedämpft', 'kühles Grau-Blau, sachlich', S('#eef1f4', '#ffffff', '#d5dbe2', '#1f2730', '#58636f', '#e2e7ed', '#3f6496')],
  ['schiefer', 'Schiefer', 'Gedämpft', 'dunkel, entsättigt, augenschonend', S('#22262b', '#2a2f35', '#3a414a', '#e8eaed', '#9ea7b1', '#2d333a', '#8fb3c9', true)],
  ['papier', 'Papier & Tusche', 'Klassisch', 'wie ein Plan: Schwarz auf Weiß, Rot als Korrektur', S('#f6f5f1', '#ffffff', '#d8d6cf', '#161616', '#5c5c57', '#ebe9e3', '#c8372a')],
  ['bauhaus', 'Bauhaus', 'Klassisch', 'Grundfarbe Blau auf warmem Weiß', S('#f4f1ea', '#fffdf8', '#ddd8cc', '#1d1d1b', '#5e5b55', '#e9e4d8', '#2a5caa')],
  ['graphit', 'Graphit', 'Klassisch', 'neutrales Dunkel mit Bernstein', S('#1c1c1e', '#252527', '#38383b', '#f2f2f0', '#a09f9b', '#29292b', '#f0b429', true)],
  ['mitternacht', 'Mitternacht', 'Modern & kräftig', 'tiefes Blau, Indigo-Akzent', S('#0f1420', '#161c2b', '#273049', '#e6e9f2', '#939cb2', '#141a28', '#7c9cff', true)],
  ['aubergine', 'Aubergine', 'Modern & kräftig', 'dunkles Violett mit Pink', S('#1d1724', '#251e2e', '#3a3047', '#f1ecf6', '#aaa0b8', '#221b2b', '#ff7ab6', true)],
  ['mint', 'Mint & Koralle', 'Modern & kräftig', 'frisch, komplementär', S('#f2f7f5', '#ffffff', '#d3e3dd', '#1d2b27', '#56695f', '#e3efea', '#e5533d')],
  ['terrakotta', 'Terrakotta', 'Modern & kräftig', 'erdig-warm, wie Ziegel', S('#f6efe8', '#fffaf5', '#e4d6c8', '#2e2420', '#715f55', '#eee2d6', '#b8562a')],
  ['neon', 'Neon', 'Modern & kräftig', 'Schwarz mit Limette – hoher Kontrast', S('#0d0d0f', '#151518', '#2a2a30', '#f5f5f7', '#9d9da6', '#121215', '#c6ff3d', true)],
] as [string, string, string, string, Schema][]).map(([schluessel, name, gruppe, beschreibung, f]) => {
  const satz = ausSchema(f);
  return { schluessel, name, gruppe, beschreibung, design: f.dunkel ? { hell: satz, dunkel: satz } : { hell: satz, dunkel: {} } };
});

/** Akzentfarben zur Wahl (wie im bisherigen Bauportal) – dazu eine eigene. */
export const AKZENTE: [string, string][] = [['#ff5fb3', 'Pink'], ['#ffd200', 'Gelb'], ['#ff9a2e', 'Orange'], ['#ff6b5e', 'Rot'], ['#3ddc84', 'Grün'], ['#2fd6c9', 'Türkis'], ['#4da3ff', 'Blau'], ['#b18cff', 'Violett']];

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

/** Die Variablen, die für Benutzer und Modus gelten: Standard, darüber das gewählte Design, darüber eigene Rundung und Akzentfarbe.
 *  Ein dunkles Design (hell und dunkel gleich) bleibt auch im hellen Modus dunkel. Eine helle Akzentfarbe wird auf hellem Grund
 *  so weit abgedunkelt, dass sie lesbar bleibt (wie im bisherigen Bauportal). */
export function satzFuer(design: Design | null, dunkel: boolean, rund?: number | null, akzent?: string | null): Satz {
  const s: Satz = { ...(dunkel ? STANDARD.dunkel : STANDARD.hell), ...(design ? (dunkel ? (Object.keys(design.dunkel).length ? design.dunkel : design.hell) : design.hell) : {}) };
  if (rund !== null && rund !== undefined && Number.isFinite(rund)) s.rund = String(rund);
  if (akzent && /^#[0-9a-f]{6}$/i.test(akzent)) {
    const grundHell = s.grund ? /^#[0-9a-f]{6}$/i.test(s.grund) ? helligkeit(s.grund) > 0.5 : !dunkel : !dunkel;
    let c = akzent; while (grundHell && helligkeit(c) > 0.62) c = mische(c, '#000000', 0.15);
    s.akzent = c; s['auf-akzent'] = aufFarbe(c);
  }
  return s;
}

// ---------- Schrift und Stil je Person (wie im bisherigen Bauportal unter „Darstellung“, gebündelt) ----------
/** Schriften zur Wahl – '' = wie das Design. */
export const SCHRIFTWAHL: [string, string, string][] = [
  ['', 'wie das Design', ''], ['system', 'Systemschrift', 'system-ui, "Segoe UI", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'],
  ['arial', 'Arial', 'Arial, Helvetica, sans-serif'], ['verdana', 'Verdana', 'Verdana, Geneva, sans-serif'],
  ['calibri', 'Calibri', 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif'], ['georgia', 'Georgia', 'Georgia, "Times New Roman", serif'],
];
/** Schriftgröße: Maßstab der ganzen Oberfläche in Prozent (Schieberegler). */
export const SCHRIFTMASS = { min: 80, max: 130, schritt: 5 };
/** So dicht wie das bisherige Bauportal (Schrift 12 px statt 15 px). */
export const DICHT_WIE_BISHER = 80;
export const schriftmass = (w: unknown): number => { const n = Number(w); return Number.isFinite(n) && n > 0 ? Math.min(SCHRIFTMASS.max, Math.max(SCHRIFTMASS.min, n)) : 100; };
/** Feinheiten des Stils (Feld der Design-Wahl → Werte); '' = Vorgabe. */
export const STIL: { feld: string; titel: string; werte: [string, string][] }[] = [
  { feld: 'schatten', titel: 'Schatten', werte: [['', 'an'], ['aus', 'aus']] },
  { feld: 'rahmen', titel: 'Rahmen der Flächen', werte: [['', 'Linie'], ['mac', 'Mac – Hauch und Schatten'], ['glas', 'Glas'], ['verlauf', 'Verlauf'], ['strich', 'Strich in App-Farbe'], ['kantig', 'Kantig']] },
  { feld: 'verlauf', titel: 'Verlauf in den Flächen', werte: [['', 'keiner'], ['app', 'App-Farbe'], ['akzent', 'Akzentfarbe'], ['kopf', 'oben'], ['licht', 'Licht'], ['zwei', 'zwei Farben']] },
  { feld: 'fenster', titel: 'Fenster', werte: [['', 'Standard'], ['mac', 'Mac – Leuchtrand, Milchglas']] },
  { feld: 'schalter', titel: 'Häkchen in Einstellungen', werte: [['', 'Häkchen'], ['an', 'Schalter']] },
  { feld: 'scrollbalken', titel: 'Rollbalken', werte: [['', 'wie das Gerät'], ['faden', 'Faden'], ['pille', 'Pille'], ['mac', 'Mac'], ['verlauf', 'Verlauf'], ['rinne', 'Rinne'], ['glas', 'Glas']] },
  { feld: 'effekte', titel: 'Unschärfe-Effekte', werte: [['', 'an'], ['aus', 'aus – für langsame Rechner']] },
  { feld: 'bewegung', titel: 'Bewegung', werte: [['', 'an'], ['aus', 'aus – für langsame Rechner']] },
];
/** Fertige Zusammenstellungen: Rundung und Stil – Farben und Schrift bleiben, wie gewählt. */
export const STIL_PAKETE: { titel: string; rund: number | null; stil: Record<string, string> }[] = [
  { titel: 'Standard', rund: null, stil: {} },
  { titel: 'Ruhig', rund: 0.5, stil: { schatten: 'aus', scrollbalken: 'faden' } },
  { titel: 'Technisch', rund: 0, stil: { scrollbalken: 'faden' } },
  { titel: 'Kacheln', rund: 1.5, stil: { scrollbalken: 'pille' } },
  { titel: 'Schnell', rund: 0.5, stil: { schatten: 'aus', scrollbalken: 'faden', bewegung: 'aus', effekte: 'aus' } },
  { titel: 'Mac', rund: 1.5, stil: { rahmen: 'mac', verlauf: 'app', fenster: 'mac', schalter: 'an', scrollbalken: 'mac' } },
];

// ---------- Umzug aus dem bisherigen Bauportal: Darstellung je Person ----------
/** So gab das bisherige Bauportal die Darstellung einer Person heraus (/api/bp/umzug/benutzer). */
export interface AlteDarstellung { theme?: string; accent?: string; farbschema?: string; schrift?: string; schrift_g?: string; stil?: Record<string, string> }
const ALT_STIL: Record<string, string> = { sb: 'scrollbalken', schatten: 'schatten', rahmen: 'rahmen', verlauf: 'verlauf', fenster: 'fenster', schalter: 'schalter', bewegung: 'bewegung', effekte: 'effekte' };
const ALT_ECKEN: Record<string, number> = { rund: 1.4, dezent: 0.5, eckig: 0 };
/** Übersetzt die bisherige Darstellung in die Felder der Design-Wahl. design ist der Schlüssel eines vorinstallierten Designs
 *  (Schema, sonst nach Hell/Dunkel/Klassisch). Unbekanntes bleibt leer (= Vorgabe). */
export function darstellungAusAlt(a: AlteDarstellung): { design: string; werte: Record<string, string | number | null> } {
  const theme = String(a.theme ?? '');
  const schema = VORINSTALLIERT.some((v) => v.schluessel === a.farbschema) ? String(a.farbschema) : '';
  const design = schema || (theme === 'dunkel' ? 'bauportal_dunkel' : theme === 'klassisch' ? 'klassisch_gruen' : 'bauportal_hell');
  const werte: Record<string, string | number | null> = {
    modus: theme === 'dunkel' ? 'dunkel' : 'hell',
    akzent: /^#[0-9a-f]{6}$/i.test(String(a.accent ?? '')) ? String(a.accent).toLowerCase() : '',
    schrift: SCHRIFTWAHL.some(([k]) => k && k === a.schrift) ? String(a.schrift) : '',
    schriftmass: a.schrift_g === 'klein' ? 90 : a.schrift_g === 'gross' ? 110 : null,
    rund: a.stil?.ecken !== undefined && a.stil.ecken in ALT_ECKEN ? ALT_ECKEN[a.stil.ecken]! : null,
  };
  for (const x of STIL) {
    const altName = Object.keys(ALT_STIL).find((k) => ALT_STIL[k] === x.feld);
    const v = altName ? String(a.stil?.[altName] ?? '') : '';
    werte[x.feld] = x.werte.some(([w]) => w && w === v) ? v : '';
  }
  return { design, werte };
}
