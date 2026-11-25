// Austausch des Bauzeitenplans mit Dateien und Programmen: Pläne der bisherigen Gantt-App (und eigene Sicherungen im
// selben Format) lesen, als Excel/CSV und als MS-Project-XML ausgeben. Aus dem alten Programm stammt nur das Datenformat.
import type { Wert } from '../../kern/modell';
import { abschnitteSchreiben, type Art } from './rechnung';
import { isoAus, tagAus } from './kalender';
import type { Plan } from './plan';

type W = Record<string, Wert>;
export interface Altplan {
  name: string;
  zeitplan: { anfang: string; arbeitswoche: string; bundesland: string };
  frei: { kennung: string; werte: W }[];
  vorgaenge: { kennung: string; werte: W }[];
  links: { kennung: string; von: string; nach: string; werte: W }[];   // von/nach: Kennungen der Vorgänge
  bt: number | null;               // verknüpftes Projekt des alten Bautagebuchs
  hinweise: string[];
}

const ARTEN: Record<string, Art> = { FS: 'ea', SS: 'aa', FF: 'ee', SF: 'ae', EA: 'ea', AA: 'aa', EE: 'ee', AE: 'ae' };
const LAENDER = new Set(['DE', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']);
const text = (w: unknown) => (w == null ? '' : String(w)).trim();
/** Datum als Tagnummer (so speichert die Gantt-App), ISO oder TT.MM.JJJJ → ISO; '' wenn nicht lesbar. */
function datum(w: unknown): string {
  if (typeof w === 'number' && Number.isFinite(w) && w > 3000 && w < 80000) return isoAus(Math.round(w));
  const t = text(w);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : '';
}

/** Ein Plan der Gantt-App (JSON) → Einträge für das neue Bauportal. vor: Anfang der Kennungen, z. B. „alt-gantt:7:“. */
export function altplanLesen(roh: unknown, vor: string): Altplan {
  const p = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const tasks = Array.isArray(p.tasks) ? (p.tasks as Record<string, unknown>[]) : null;
  if (!tasks) throw new Error('Das ist kein Bauzeitenplan (es fehlen die Leistungen)');
  const hinweise: string[] = [];
  const cal = (p.cal && typeof p.cal === 'object' ? p.cal : {}) as Record<string, unknown>;
  const farben = (p.gwColors && typeof p.gwColors === 'object' ? p.gwColors : {}) as Record<string, string>;
  const anfang = datum(p.startDate) || datum(p.start) || new Date().toLocaleDateString('sv');
  const land = cal.state_hand && LAENDER.has(text(cal.state)) ? text(cal.state) : '';
  const frei = (Array.isArray(cal.free) ? (cal.free as Record<string, unknown>[]) : []).flatMap((f, i) => {
    const von = datum(f.from);
    return von ? [{ kennung: `${vor}frei:${i}`, werte: { name: text(f.name) || 'frei', von, bis: datum(f.to) || null, jaehrlich: !!f.yearly } }] : [];
  });
  const kennung = (uid: unknown) => `${vor}${text(uid)}`;
  const uids = new Set(tasks.map((t) => text(t.uid)));
  const vorgaenge = tasks.map((t, i) => {
    const segs = Array.isArray(t.segs) ? (t.segs as { d?: number; gap?: number }[]) : [];
    const ab = segs.length > 1 ? segs.map((s, k) => ({ dauer: Math.max(1, Math.round(Number(s.d) || 1)), pause: k ? Math.max(0, Math.round(Number(s.gap) || 0)) : 0 })) : null;
    const gw = text(t.gw);
    const farbe = text(t.color) || (gw && farben[gw]) || '';
    return { kennung: kennung(t.uid), werte: {
      name: text(t.name) || 'Leistung', ebene: Math.max(0, Math.round(Number(t.lvl) || 0)), reihe: i + 1,
      dauer: ab ? ab.reduce((a, b) => a + b.dauer, 0) : Math.max(0, Math.round(Number(t.dur) || 0)), unterbrechung: ab ? abschnitteSchreiben(ab) : '',
      anfang_nicht_vor: t.cons != null ? datum(t.cons) || null : null, fortschritt: Math.max(0, Math.min(100, Math.round(Number(t.pct) || 0))),
      gewerk: gw, unternehmer: text(t.res), notiz: text(t.notes), farbe: /^#[0-9a-f]{3,8}$/i.test(farbe) ? farbe : '',
    } as W };
  });
  const links: Altplan['links'] = [];
  let fremd = 0;
  for (const t of tasks) for (const v of Array.isArray(t.preds) ? (t.preds as Record<string, unknown>[]) : []) {
    if (!uids.has(text(v.uid))) { fremd++; continue; }
    links.push({ kennung: `${kennung(v.uid)}>${text(t.uid)}`, von: kennung(v.uid), nach: kennung(t.uid), werte: {
      art: ARTEN[text(v.type).toUpperCase()] ?? 'ea', abstand: Math.round(Number(v.lag) || 0),
      von_abschnitt: Number.isInteger(v.ps) ? Number(v.ps) : null, nach_abschnitt: Number.isInteger(v.ss) ? Number(v.ss) : null,
    } });
  }
  if (fremd) hinweise.push(`${fremd} Verknüpfung${fremd > 1 ? 'en zeigen' : ' zeigt'} auf Leistungen, die es im Plan nicht gibt – sie bleiben weg.`);
  if (p.trades && typeof p.trades === 'object' && Object.keys(p.trades).length) hinweise.push('Firmen und Vergabestand aus „Gewerke & Firmen“ stehen im neuen Bauportal bei den Beteiligten des Projekts; sie werden nicht mit übernommen.');
  const bt = p._bt && typeof p._bt === 'object' ? Number((p._bt as Record<string, unknown>).id) : NaN;
  return { name: text(p.name) || 'Bauzeitenplan', zeitplan: { anfang, arbeitswoche: ['5', '6', '7'].includes(text(cal.week)) ? text(cal.week) : '5', bundesland: land }, frei, vorgaenge, links, bt: Number.isFinite(bt) ? bt : null, hinweise };
}

/** Sicherung eines Plans im Format der Gantt-App – lässt sich hier und dort wieder einlesen. */
export function planJsonAus(plan: Plan, name: string, zeitplan: W, frei: { werte: W }[]): string {
  const uid = new Map(plan.reihe.map((v, i) => [v.id, i + 1]));
  const zurueck: Record<Art, string> = { ea: 'FS', aa: 'SS', ee: 'FF', ae: 'SF' };
  return JSON.stringify({
    name, startDate: text(zeitplan.anfang), start: zeitplan.anfang ? tagAus(text(zeitplan.anfang)) : undefined, nextUid: plan.reihe.length + 1,
    cal: { week: Number(zeitplan.arbeitswoche || 5), state: text(zeitplan.bundesland) || 'DE', state_hand: !!zeitplan.bundesland, free: frei.map((f) => ({ from: f.werte.von, to: f.werte.bis || f.werte.von, name: f.werte.name, yearly: !!f.werte.jaehrlich })) },
    tasks: plan.reihe.map((v) => {
      const w = v.werte, ab = String(w.unterbrechung || '');
      return {
        uid: uid.get(v.id), name: w.name, lvl: Number(w.ebene ?? 0), dur: Number(w.dauer ?? 0), pct: Number(w.fortschritt ?? 0), res: w.unternehmer ?? '', gw: w.gewerk ?? '',
        color: w.farbe ?? '', notes: w.notiz ?? '', cons: w.anfang_nicht_vor ? tagAus(String(w.anfang_nicht_vor)) : null,
        segs: ab ? ab.split('+').reduce<{ d: number; gap: number }[]>((l, x) => { const m = /^\((\d+)\)$/.exec(x); if (m) l.push({ d: 0, gap: Number(m[1]) }); else if (l.length && l[l.length - 1]!.d === 0) l[l.length - 1]!.d = Number(x); else l.push({ d: Number(x), gap: 0 }); return l; }, []) : null,
        preds: plan.links.filter((l) => l.nach === v.id).map((l) => ({ uid: uid.get(l.von), type: zurueck[l.art], lag: l.abstand })),
      };
    }),
  }, null, 1);
}

const de = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
/** Excel/CSV (Semikolon, UTF-8 mit BOM – so öffnet Excel Umlaute richtig). */
export function csvAus(plan: Plan): string {
  const zelle = (w: unknown) => { const t = String(w ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const kopf = ['Nr.', 'Gliederung', 'Leistung', 'Dauer (Arbeitstage)', 'Anfang', 'Ende', 'Vorgänger', 'Gewerk', 'Unternehmer', '% abgeschlossen', 'kritisch', 'Puffer (Arbeitstage)'];
  const zeilen = plan.zeilen.map((z) => [z.nr, z.ebene, `${'  '.repeat(z.ebene)}${z.name}`, z.termin.gruppe ? z.termin.f - z.termin.s : z.dauer, de(z.termin.anfang), de(z.termin.ende), z.vorg, z.gewerk, z.unternehmer, z.fortschritt || '', z.termin.kritisch ? 'ja' : '', z.termin.gruppe ? '' : z.termin.puffer]);
  return '﻿' + [kopf, ...zeilen].map((r) => r.map(zelle).join(';')).join('\r\n') + '\r\n';
}

/** MS-Project-XML (MSPDI): öffnet sich in MS Project und anderer Projektsoftware. */
export function mspdiAus(plan: Plan, titel: string): string {
  const x = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[z]!);
  const uid = new Map(plan.reihe.map((v, i) => [v.id, i + 1]));
  const typ: Record<Art, number> = { ee: 0, ea: 1, ae: 2, aa: 3 };
  const start = plan.zeilen.length ? plan.zeilen.reduce((m, z) => (z.termin.anfang < m ? z.termin.anfang : m), plan.zeilen[0]!.termin.anfang) : plan.kal.anfangsdatum(0);
  const tasks = plan.zeilen.map((z) => {
    const t = z.termin, dauer = t.gruppe ? t.f - t.s : z.dauer;
    const preds = plan.links.filter((l) => l.nach === z.id).map((l) => `<PredecessorLink><PredecessorUID>${uid.get(l.von)}</PredecessorUID><Type>${typ[l.art]}</Type><CrossProject>0</CrossProject><LinkLag>${l.abstand * 8 * 600}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`).join('');
    return `<Task><UID>${uid.get(z.id)}</UID><ID>${z.nr}</ID><Name>${x(z.name)}</Name><OutlineLevel>${z.ebene + 1}</OutlineLevel><Summary>${t.gruppe ? 1 : 0}</Summary><Milestone>${!t.gruppe && t.f === t.s ? 1 : 0}</Milestone>`
      + `<Start>${t.anfang}T08:00:00</Start><Finish>${t.ende}T17:00:00</Finish><Duration>PT${dauer * 8}H0M0S</Duration><DurationFormat>7</DurationFormat><PercentComplete>${z.fortschritt}</PercentComplete><Critical>${t.kritisch ? 1 : 0}</Critical>`
      + `${z.unternehmer || z.gewerk ? `<Notes>${x([z.gewerk, z.unternehmer].filter(Boolean).join(' · '))}</Notes>` : ''}${preds}</Task>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><Name>${x(titel)}</Name><Title>${x(titel)}</Title><ScheduleFromStart>1</ScheduleFromStart><StartDate>${start}T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>${plan.kal.woche * 480}</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>\n<Tasks>\n${tasks}\n</Tasks></Project>\n`;
}
