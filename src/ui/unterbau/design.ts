// Wendet das Design des angemeldeten Benutzers an: Standard, darüber das gewählte Design (hell/dunkel/wie das Gerät),
// darüber eigene Rundung und Akzentfarbe. Schriften kommen vom eigenen Server (/api/schriften.css).
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { GROESSEN, SCHRIFTWAHL, STIL, helligkeit, satzFuer, VARIABLEN, type Design } from '../../kern/design';
import { sicht } from './abgleich';
import { ich } from './api';
import type { Zeile } from '../../kern/befehl';

const json = (w: unknown) => { try { return JSON.parse(String(w || '{}')) as Record<string, string>; } catch { return {}; } };
export const designAus = (z: Zeile | undefined): Design | null => (z ? { hell: json(z.werte.hell), dunkel: json(z.werte.dunkel) } : null);
export const meineWahl = () => Object.values(sicht.design_wahl ?? {}).find((z) => !z.geloescht && z.werte.benutzer === ich()?.id);

const [schriftStand, setSchriftStand] = createSignal(0);
/** Nach dem Holen neuer Schriften: Stylesheet neu laden. */
export const schriftenNeu = () => setSchriftStand((n) => n + 1);

/** Variablen setzen – auch für die Vorschau im Design-Fenster. */
export function anwenden(satz: Record<string, string>, dunkel: boolean, ziel: HTMLElement = document.documentElement) {
  for (const v of VARIABLEN) { if (satz[v] !== undefined) ziel.style.setProperty(`--${v}`, satz[v]!); else ziel.style.removeProperty(`--${v}`); }
  // dunkle Designs (z. B. Schiefer) bleiben dunkel, auch wenn hell gewählt ist – maßgeblich ist der Hintergrund
  ziel.style.colorScheme = (satz.grund && /^#[0-9a-f]{6}$/i.test(satz.grund) ? helligkeit(satz.grund) < 0.5 : dunkel) ? 'dark' : 'light';
}

export function designBeobachten() {
  const geraetDunkel = matchMedia('(prefers-color-scheme: dark)');
  const [dunkelGeraet, setDunkelGeraet] = createSignal(geraetDunkel.matches);
  const los = (e: MediaQueryListEvent) => setDunkelGeraet(e.matches);
  geraetDunkel.addEventListener('change', los); onCleanup(() => geraetDunkel.removeEventListener('change', los));
  createEffect(() => {
    const w = meineWahl(), modus = String(w?.werte.modus ?? 'hell');
    const dunkel = modus === 'dunkel' || (modus === 'system' && dunkelGeraet());
    const d = w?.werte.design ? designAus(sicht.design?.[String(w.werte.design)]) : null;
    anwenden(satzFuer(d, dunkel, w?.werte.rund === null || w?.werte.rund === undefined ? null : Number(w.werte.rund), w?.werte.akzent ? String(w.werte.akzent) : null), dunkel);
    schriftUndStil(w?.werte ?? {});
  });
  createEffect(() => {
    const n = schriftStand();
    let l = document.getElementById('bp-schriften') as HTMLLinkElement | null;
    if (!l) { l = document.createElement('link'); l.id = 'bp-schriften'; l.rel = 'stylesheet'; document.head.appendChild(l); }
    l.href = `/api/schriften.css?${n}`;
  });
}

/** Schrift, Schriftgröße und Stil der Person: Schrift über --schrift, Größe als Maßstab der Oberfläche, Stil als data-Attribute am <html> (Regeln in stil.css). */
export function schriftUndStil(w: Record<string, unknown>, ziel: HTMLElement = document.documentElement) {
  const s = SCHRIFTWAHL.find(([k]) => k && k === w.schrift);
  if (s) ziel.style.setProperty('--schrift', s[2]);
  ziel.style.zoom = String(GROESSEN.find(([k]) => k === (w.groesse ?? ''))?.[2] ?? 1);
  for (const x of STIL) { const v = String(w[x.feld] ?? ''); if (v) ziel.dataset[x.feld] = v; else delete ziel.dataset[x.feld]; }
}
