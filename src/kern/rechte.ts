// Rollen ab Werk. Was eine Rolle darf, steht als Objekt „recht“ in der Datenbank
// und wird dort durchgesetzt – nicht im Programmcode der Module.

export interface Rolle { name: string; titel: string; alleProjekte: boolean; erklaerung: string }

export const ROLLEN: Rolle[] = [
  { name: 'admin', titel: 'Administrator:in', alleProjekte: true, erklaerung: 'Darf alles, auch Benutzer und Rechte ändern.' },
  { name: 'bueroleitung', titel: 'Büroleitung', alleProjekte: true, erklaerung: 'Sieht alle Projekte.' },
  { name: 'bauleitung', titel: 'Bauleitung', alleProjekte: false, erklaerung: 'Sieht die Projekte, in denen sie Mitglied ist.' },
  { name: 'mitarbeiter', titel: 'Mitarbeiter:in', alleProjekte: false, erklaerung: 'Sieht die Projekte, in denen sie Mitglied ist.' },
  { name: 'gast', titel: 'Gast (extern)', alleProjekte: false, erklaerung: 'Sieht nur, was ausdrücklich freigegeben ist.' },
];

export const ROLLEN_OPTIONEN = ROLLEN.map((r) => ({ wert: r.name, titel: r.titel }));
export const ALLE = ROLLEN.map((r) => r.name);
export const OHNE_GAST = ALLE.filter((r) => r !== 'gast');

export type Rechte = Record<string, { lesen: boolean; schreiben: boolean; loeschen: boolean }>;
