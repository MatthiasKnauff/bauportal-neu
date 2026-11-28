// Rollen ab Werk. Welche Rollen es gibt und was eine Rolle darf, steht als Objekte „rolle“ und „recht“ in der Datenbank
// und wird dort durchgesetzt – nicht im Programmcode der Module. Rollen lassen sich wie bisher selbst anlegen (Entscheidung 28.11.2026);
// diese fünf sind die Vorgabe, „admin“ ist fest und darf immer alles.

export interface Rolle { name: string; id: string; titel: string; alleProjekte: boolean; erklaerung: string }

export const ROLLEN: Rolle[] = [
  { name: 'admin', id: '00000000-0000-4000-8000-0000000a0001', titel: 'Administrator:in', alleProjekte: true, erklaerung: 'Darf alles, auch Benutzer und Rechte ändern.' },
  { name: 'bueroleitung', id: '00000000-0000-4000-8000-0000000a0002', titel: 'Büroleitung', alleProjekte: true, erklaerung: 'Sieht alle Projekte.' },
  { name: 'bauleitung', id: '00000000-0000-4000-8000-0000000a0003', titel: 'Bauleitung', alleProjekte: false, erklaerung: 'Sieht die Projekte, in denen sie Mitglied ist.' },
  { name: 'mitarbeiter', id: '00000000-0000-4000-8000-0000000a0004', titel: 'Mitarbeiter:in', alleProjekte: false, erklaerung: 'Sieht die Projekte, in denen sie Mitglied ist.' },
  { name: 'gast', id: '00000000-0000-4000-8000-0000000a0005', titel: 'Gast (extern)', alleProjekte: false, erklaerung: 'Sieht nur, was ausdrücklich freigegeben ist.' },
];
/** Kennung der Rolle ab Werk (benutzer.rolle und recht.rolle verweisen darauf). */
export const rolleId = (name: string): string => ROLLEN.find((r) => r.name === name)!.id;
export const ADMIN_ROLLE = rolleId('admin');

// Rechte ab Werk in den Beipackzetteln: je Objekt die Namen der Rollen (für neue Rollen gilt die Rolle, von der sie kopiert sind)
export const ALLE = ROLLEN.map((r) => r.name);
export const OHNE_GAST = ALLE.filter((r) => r !== 'gast');

export type Rechte = Record<string, { lesen: boolean; schreiben: boolean; loeschen: boolean }>;
