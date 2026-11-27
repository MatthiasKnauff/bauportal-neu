// Eine Datei vom Rechner wählen (Einlesen von Excel, GAEB, IFC, E-Rechnung, Plan …): die eine Stelle dafür, statt in jeder App
// ein eigenes Dateifeld. Was beim Lesen schiefgeht, steht als Hinweis da – die App bekommt nur die gelesene Datei.
import { tabelleLesen } from '../../kern/tabellendatei';
import { hinweis } from '../unterbau/meldungen';

/** Datei wählen lassen (Endungen wie „.ifc“ oder „.xlsx,.csv“) und damit weitermachen. */
export function dateiWaehlen(endungen: string, tun: (datei: File) => void | Promise<void>): void {
  const wahl = document.createElement('input');
  wahl.type = 'file'; wahl.accept = endungen;
  wahl.onchange = async () => {
    const d = wahl.files?.[0]; if (!d) return;
    try { await tun(d); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
  };
  wahl.click();
}

/** Tabelle wählen lassen (Excel oder CSV) – gelesen als Kopf und Zeilen. */
export const TABELLEN = '.xlsx,.xlsm,.csv,.txt';
export const tabelleWaehlen = (tun: (name: string, zeilen: string[][]) => void): void =>
  dateiWaehlen(TABELLEN, async (d) => { const t = await tabelleLesen(d.name, new Uint8Array(await d.arrayBuffer())); tun(d.name, [t.kopf, ...t.zeilen]); });
