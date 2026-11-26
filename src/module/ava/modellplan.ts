// Gebäudemodell → LV (passend zum vereinfachten Modell): ein Bauteil hat eine Kostengruppe, eine Menge und einen Aufbau aus dem
// Katalog; der Aufbau besteht aus Schichten. Je Kostengruppe ein Titel, je Aufbau davor ein Hinweistext mit der Schichtenfolge,
// je Schicht eine Position (ohne Schichten eine für den ganzen Aufbau) – Menge = Summe der Bauteile mit diesem Aufbau. Gleicher Aufbau in mehreren Bauteilen = eine Position.
// Fenster und Türen gehen über die Fenster- & Türliste; Bauteile ohne Aufbau kommen erst, wenn sie einen haben.
// Reine Rechnung: im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import type { LvZeilePlan } from './lvplan';

type E = { id: string; werte: Werte };
export const MODELL = 'modell';
const EINHEIT: Record<string, string> = { m2: 'm²', m: 'm', stk: 'St', m3: 'm³' };
const t = (w: Werte | undefined, k: string) => String(w?.[k] ?? '').trim();
const zahl = (n: number, s = 2) => n.toLocaleString('de-DE', { maximumFractionDigits: s });
const nimmt = (b: E) => !!b.werte.aufbau && b.werte.art !== 'fenster' && b.werte.art !== 'tuer';

/** Bauteile, die nicht ins LV gehen, weil ihnen der Aufbau fehlt (ohne Fenster und Türen). */
export const ohneAufbau = (bauteile: E[]) => bauteile.filter((b) => !b.werte.aufbau && b.werte.art !== 'fenster' && b.werte.art !== 'tuer');

/** Text einer Schicht: „Kalksandstein, d = 17,5 cm“. */
export const schichtText = (s: E) => `${t(s.werte, 'material') || 'Schicht'}${Number(s.werte.dicke) ? `, d = ${zahl(Number(s.werte.dicke), 1)} cm` : ''}`;

export function bauteileInsLv(bauteile: E[], aufbauten: Record<string, E | undefined>, schichten: E[], kgs: Record<string, E | undefined>): LvZeilePlan[] {
  const aus: LvZeilePlan[] = [];
  const kgNr = (b: E) => t(kgs[String(b.werte.kostengruppe ?? '')]?.werte, 'nummer') || 'ohne';
  const jeKg = new Map<string, E[]>();
  for (const b of bauteile.filter((x) => nimmt(x) && aufbauten[String(x.werte.aufbau)])) (jeKg.get(kgNr(b)) ?? jeKg.set(kgNr(b), []).get(kgNr(b))!).push(b);
  const nach = [...jeKg.keys()].sort((a, b) => (a === 'ohne' ? 1 : b === 'ohne' ? -1 : a.localeCompare(b, 'de', { numeric: true })));
  for (const kg of nach) {
    const B = jeKg.get(kg)!, k0 = `${MODELL}|${kg}`;
    const kgZeile = Object.values(kgs).find((x) => t(x?.werte, 'nummer') === kg);
    aus.push({ schluessel: k0, art: 'titel', kurztext: kg === 'ohne' ? 'ohne Kostengruppe' : [kg, t(kgZeile?.werte, 'name')].filter(Boolean).join(' '), langtext: '', menge: null, einheit: '', herkunft: [] });
    const jeAufbau = new Map<string, E[]>();
    for (const b of B) { const a = String(b.werte.aufbau); (jeAufbau.get(a) ?? jeAufbau.set(a, []).get(a)!).push(b); }
    for (const [aid, bts] of [...jeAufbau].sort((x, y) => t(aufbauten[x[0]]?.werte, 'name').localeCompare(t(aufbauten[y[0]]?.werte, 'name'), 'de'))) {
      const a = aufbauten[aid]!, S = schichten.filter((s) => s.werte.aufbau === aid).sort((x, y) => Number(x.werte.reihe ?? 0) - Number(y.werte.reihe ?? 0));
      const dicke = S.reduce((s, x) => s + (Number(x.werte.dicke) || 0), 0);
      if (S.length) aus.push({ schluessel: `${k0}|${aid}`, art: 'hinweis', kurztext: `Aufbau ${t(a.werte, 'name')}`, menge: null, einheit: '', herkunft: [],
        langtext: [...S.map((s, i) => `${i + 1}. ${schichtText(s)}`), ...(dicke ? [`Gesamtdicke ${zahl(dicke, 1)} cm`] : [])].join('\n') });
      const namen = [...new Set(bts.map((b) => t(b.werte, 'name')).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'de', { numeric: true }));
      const jeEinheit = new Map<string, E[]>();
      for (const b of bts) { const e = t(b.werte, 'einheit') || 'm2'; (jeEinheit.get(e) ?? jeEinheit.set(e, []).get(e)!).push(b); }
      const bauteileText = `Bauteile: ${namen.length > 12 ? `${namen.slice(0, 12).join(', ')} … (${namen.length})` : namen.join(', ')}`;
      const menge = (be: E[]) => Math.round(be.reduce((x, b) => x + (Number(b.werte.menge) || 0), 0) * 100) / 100;
      // ohne Schichten (z. B. vom Assistenten geschätzt): eine Position für den ganzen Aufbau
      if (!S.length) for (const [e, be] of jeEinheit) aus.push({ schluessel: `${k0}|${aid}|-|${e}`, art: 'normal', kurztext: t(a.werte, 'name'), einheit: EINHEIT[e] ?? e, menge: menge(be), langtext: bauteileText, herkunft: be.map((b) => b.id) });
      S.forEach((s, i) => {
        for (const [e, be] of jeEinheit) {
          aus.push({
            schluessel: `${k0}|${aid}|${s.id}|${e}`, art: 'normal', kurztext: schichtText(s), einheit: EINHEIT[e] ?? e,
            menge: menge(be), langtext: `Gemäß vorangegangenem Aufbau „${t(a.werte, 'name')}“, Schicht ${i + 1} von ${S.length}.\n${bauteileText}`,
            herkunft: be.map((b) => b.id),
          });
        }
      });
    }
  }
  return aus;
}
