// Speicher im Browser (je Gerät): kleine Einstellungen merken – ohne Speicher (gesperrt, voll) geht es auch, dann mit der Vorgabe.
export const merken = (k: string, w: unknown): void => { try { localStorage.setItem(k, JSON.stringify(w)); } catch { /* ohne Speicher geht es auch */ } };
export const holen = <T,>(k: string, d: T): T => { try { const x = localStorage.getItem(k); return x ? (JSON.parse(x) as T) : d; } catch { return d; } };
