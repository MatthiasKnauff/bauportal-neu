import { createSignal } from 'solid-js';
import type { Beipackzettel } from '../kern/modul';
import type { Rechtart } from '../kern/modell';
import type { Rechte, Rolle } from '../kern/rechte';

export interface Benutzer { id: string; name: string; anmeldename: string; rolle: string }
export interface Zustand {
  version: string; umgebung: string; kennung: string; eingerichtet: boolean;
  benutzer: Benutzer | null; module: Beipackzettel[]; rollen: Rolle[];
  rechte?: Rechte; projekte?: string[]; sichtKennung?: string;
}

/** Der Zustand des Programms für diesen Benutzer – eine Stelle für die ganze Oberfläche. */
export const [zustand, setZustand] = createSignal<Zustand | null>(null);
export const ich = () => zustand()!.benutzer!;
export const istAdmin = () => zustand()?.benutzer?.rolle === 'admin';
/** Für die Oberfläche: Knopf zeigen oder nicht. Entschieden wird in der Datenbank. */
export const darf = (objekt: string, art: Rechtart) => zustand()?.rechte?.[objekt]?.[art] === true;
export const modell = (name: string) => zustand()!.module.flatMap((m) => m.objekte).find((m) => m.name === name)!;
export const MERKER = 'bp_zustand';
export function merkeZustand(z: Zustand): void {
  setZustand(z);
  if (z.benutzer) localStorage.setItem(MERKER, JSON.stringify(z)); else localStorage.removeItem(MERKER);
}

export class Serverfehler extends Error {
  constructor(text: string, public status: number, public felder?: Record<string, string>) { super(text); }
}
/** Kein Netz oder Server nicht erreichbar. */
export class Netzfehler extends Error {}

export async function ruf<T>(pfad: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(pfad, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Netzfehler('Keine Verbindung zum Server');
  }
  if (r.status >= 502 && r.status <= 504) throw new Netzfehler('Server nicht erreichbar');
  const daten = await r.json().catch(() => ({}));
  if (!r.ok) throw new Serverfehler(daten.fehler ?? `Fehler ${r.status}`, r.status, daten.felder);
  return daten as T;
}

export function neueKennung(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // ohne https bietet der Browser randomUUID nicht an
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
