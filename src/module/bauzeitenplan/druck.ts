// Ausdruck des Balkenplans: eine reine Textfunktion, die im Browser (Vorschau) und auf dem Server (PDF über den
// Druckdienst) dieselben Seiten baut. Formate von A6 bis A0, US- und ARCH-Formate, eigenes Maß und Rolle für Plotter;
// an die Seitenbreite angepasst (auf N Seiten breit) oder mit fester Zeitskala; Tabelle auf jeder Seite wiederholt.
import { isoAus, wochentag, type Kalender } from './kalender';
import type { Termin } from './rechnung';

export const FORMATE: Record<string, { titel: string; b: number; h: number }> = {
  A0: { titel: 'A0', b: 841, h: 1189 }, A1: { titel: 'A1', b: 594, h: 841 }, A2: { titel: 'A2', b: 420, h: 594 }, A3: { titel: 'A3', b: 297, h: 420 },
  A4: { titel: 'A4', b: 210, h: 297 }, A5: { titel: 'A5', b: 148, h: 210 }, A6: { titel: 'A6', b: 105, h: 148 },
  B3: { titel: 'B3', b: 353, h: 500 }, B4: { titel: 'B4', b: 250, h: 353 }, B5: { titel: 'B5', b: 176, h: 250 },
  LETTER: { titel: 'US Letter', b: 216, h: 279 }, LEGAL: { titel: 'US Legal', b: 216, h: 356 }, TABLOID: { titel: 'Tabloid', b: 279, h: 432 },
  ANSI_C: { titel: 'ANSI C', b: 432, h: 559 }, ANSI_D: { titel: 'ANSI D', b: 559, h: 864 }, ANSI_E: { titel: 'ANSI E', b: 864, h: 1118 },
  ARCH_C: { titel: 'ARCH C', b: 457, h: 610 }, ARCH_D: { titel: 'ARCH D', b: 610, h: 914 }, ARCH_E: { titel: 'ARCH E', b: 914, h: 1219 },
  EIGEN: { titel: 'eigenes Maß', b: 0, h: 0 }, ROLLE: { titel: 'Rolle / Endlospapier', b: 0, h: 0 },
};
export const DRUCKSPALTEN: { id: string; titel: string; mm: number }[] = [
  { id: 'nr', titel: 'Nr.', mm: 8 }, { id: 'name', titel: 'Leistung', mm: 55 }, { id: 'dauer', titel: 'Dauer', mm: 13 }, { id: 'anfang', titel: 'Anfang', mm: 17 },
  { id: 'ende', titel: 'Ende', mm: 17 }, { id: 'vorg', titel: 'Vorgänger', mm: 18 }, { id: 'gewerk', titel: 'Gewerk', mm: 25 }, { id: 'unternehmer', titel: 'Unternehmer', mm: 28 }, { id: 'pct', titel: '%', mm: 9 },
];

export interface Druckoptionen {
  format: string; quer: boolean; eigenB?: number; eigenH?: number; rolle?: number;   // mm
  rand: number;                    // mm
  anpassen: 'breite' | 'fest';     // an Seitenbreite anpassen oder feste Zeitskala
  seitenBreit: number;             // bei „breite“: auf so vielen Seiten nebeneinander
  seitenHoch?: number;             // Zeilen auf so viele Seiten hoch verteilen (0: Zeilenhöhe aus der Schrift)
  mmJeTag: number;                 // bei „fest“
  von?: string; bis?: string;      // Zeitraum, sonst der ganze Plan
  spalten: string[]; tabelleJedeSeite: boolean;
  kritisch: boolean; heute: boolean; legende: boolean; kopf: boolean; seitenzahl: boolean;
  pfeile: 'keine' | 'kritisch' | 'alle';
  schrift: number;                 // pt
}
export const STANDARD: Druckoptionen = {
  format: 'A3', quer: true, rand: 10, anpassen: 'breite', seitenBreit: 1, mmJeTag: 2, spalten: ['nr', 'name', 'dauer', 'anfang', 'ende'], tabelleJedeSeite: true,
  kritisch: true, heute: true, legende: true, kopf: true, seitenzahl: true, pfeile: 'keine', schrift: 7,
};

export interface Druckzeile {
  id: string; nr: number; name: string; ebene: number; termin: Termin; dauer: number;
  gewerk: string; unternehmer: string; farbe: string; vorg: string; fortschritt: number;
}
export interface Plandaten { titel: string; unter: string; buero: string; zeilen: Druckzeile[]; links: { von: string; nach: string; art: string }[]; kal: Kalender; ende: string; heute: string }

const s = (t: string) => t.replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!);
const kurz = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '');
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Blattgröße in mm (Breite × Höhe, nach Ausrichtung). Bei der Rolle ist die Höhe die Rollenbreite, die Länge folgt dem Plan. */
export function blatt(o: Druckoptionen, laengeRolle = 0): { b: number; h: number } {
  if (o.format === 'ROLLE') return { b: Math.max(200, laengeRolle), h: o.rolle || 914 };
  const f = o.format === 'EIGEN' ? { b: o.eigenB || 297, h: o.eigenH || 420 } : FORMATE[o.format] ?? FORMATE.A3!;
  const [k, g] = [Math.min(f.b, f.h), Math.max(f.b, f.h)];
  return o.quer ? { b: g, h: k } : { b: k, h: g };
}

/** Die Seiten des Ausdrucks als HTML-Dokument (mit @page in der richtigen Größe). */
export function planDruck(d: Plandaten, o: Druckoptionen): { html: string; seiten: number; blatt: { b: number; h: number } } {
  const k = d.kal, pt = Math.max(5, Math.min(14, o.schrift || 7));
  let zeileMm = pt * 0.3528 * 1.9;
  const kopfMm = o.kopf ? pt * 0.3528 * 6 : 0, achseMm = pt * 0.3528 * 3.4;
  const legendeMm = o.legende ? pt * 0.3528 * 3 : 0, fussMm = o.seitenzahl ? pt * 0.3528 * 2.4 : 0;
  const spalten = DRUCKSPALTEN.filter((x) => o.spalten.includes(x.id)).map((x) => ({ ...x, mm: x.mm * pt / 7 }));
  const tabMm = spalten.reduce((a, x) => a + x.mm, 0);
  // Zeitraum in Kalendertagen
  const termine = d.zeilen.map((z) => z.termin);
  let t0 = o.von ? tagNr(o.von) : Math.min(k.tag(0), ...termine.map((t) => k.tag(t.s)));
  let t1 = o.bis ? tagNr(o.bis) : Math.max(k.tag(0), ...termine.map((t) => k.tag(Math.max(t.s, t.f - 1))));
  if (!o.von) t0 -= wochentag(t0);
  if (!o.bis) t1 += 6 - wochentag(t1) + 7;
  const tage = Math.max(7, t1 - t0 + 1);
  // Seitengröße und Maßstab
  let b0 = blatt(o);
  const nutzB = (b: number) => b - 2 * o.rand;
  let mmTag: number;
  let streifen: number;   // Seiten nebeneinander
  if (o.format === 'ROLLE') {
    mmTag = o.anpassen === 'fest' ? o.mmJeTag : 2;
    b0 = blatt(o, 2 * o.rand + tabMm + tage * mmTag);
    streifen = 1;
  } else if (o.anpassen === 'breite') {
    streifen = Math.max(1, Math.round(o.seitenBreit || 1));
    const verfuegbar = streifen * nutzB(b0.b) - (o.tabelleJedeSeite ? streifen : 1) * tabMm;
    mmTag = Math.max(0.2, verfuegbar / tage);
  } else {
    mmTag = Math.max(0.2, o.mmJeTag);
    const erste = nutzB(b0.b) - tabMm, weitere = nutzB(b0.b) - (o.tabelleJedeSeite ? tabMm : 0);
    streifen = Math.max(1, 1 + Math.ceil(Math.max(0, tage * mmTag - erste) / Math.max(10, weitere)));
  }
  const nutzH = b0.h - 2 * o.rand - kopfMm - achseMm - legendeMm - fussMm;
  // auf N Seiten hoch: die Zeilen füllen die Höhe (höchstens dreimal so hoch wie aus der Schrift)
  if (o.seitenHoch && o.seitenHoch > 0 && o.format !== 'ROLLE' && d.zeilen.length) zeileMm = Math.min(zeileMm * 3, Math.max(zeileMm * 0.6, (nutzH * o.seitenHoch) / d.zeilen.length - 0.01));
  const jeSeite = Math.max(1, Math.floor(nutzH / zeileMm));
  const hoch = o.format === 'ROLLE' ? 1 : Math.max(1, Math.ceil(d.zeilen.length / jeSeite));
  const zeilenJeBlatt = o.format === 'ROLLE' ? d.zeilen.length : jeSeite;
  if (o.format === 'ROLLE') b0 = { b: b0.b, h: Math.max(b0.h, 2 * o.rand + kopfMm + achseMm + legendeMm + fussMm + d.zeilen.length * zeileMm) };

  // Zeitstreifen je Seite (in Kalendertagen)
  const streifenTage: [number, number][] = [];
  let start = t0;
  for (let i = 0; i < streifen; i++) {
    const breite = nutzB(b0.b) - (i === 0 || o.tabelleJedeSeite ? tabMm : 0);
    const n = i === streifen - 1 ? t1 - start + 1 : Math.max(1, Math.floor(breite / mmTag));
    streifenTage.push([start, Math.min(t1, start + n - 1)]);
    start += n;
  }

  const gesamt = hoch * streifen;
  const seiten: string[] = [];
  let nr = 0;
  for (let h = 0; h < hoch; h++) for (let w = 0; w < streifen; w++) {
    nr++;
    const zeilen = d.zeilen.slice(h * zeilenJeBlatt, (h + 1) * zeilenJeBlatt);
    const mitTabelle = w === 0 || o.tabelleJedeSeite;
    const [a, e] = streifenTage[w]!;
    seiten.push(seite(d, o, { zeilen, mitTabelle, spalten, tabMm, a, e, mmTag, zeileMm, achseMm, kopfMm, legendeMm, fussMm, pt, nr, gesamt, blatt: b0 }));
  }
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${s(d.titel)}</title><style>
    @page { size: ${b0.b}mm ${b0.h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font: ${pt}pt/1.25 Arial, "Liberation Sans", Helvetica, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .blatt { width: ${b0.b}mm; height: ${b0.h}mm; padding: ${o.rand}mm; box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; break-after: page; background: #fff; }
    .blatt:last-child { page-break-after: auto; break-after: auto; }
    .kopf { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: .3mm solid #111; padding-bottom: 1.2mm; margin-bottom: 1.5mm; height: ${kopfMm - 2.7}mm; box-sizing: border-box; }
    .kopf b { font-size: 1.6em; display: block; } .kopf .r { text-align: right; color: #333; }
    .fuss { position: absolute; left: ${o.rand}mm; right: ${o.rand}mm; bottom: ${o.rand}mm; display: flex; justify-content: space-between; color: #555; font-size: .9em; }
    .legende { display: flex; flex-wrap: wrap; gap: 1mm 4mm; margin-top: 1.5mm; font-size: .95em; }
    .legende i { display: inline-block; width: 4mm; height: 2mm; margin-right: 1mm; vertical-align: middle; border-radius: .4mm; }
    svg { display: block; }
    svg text { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; }
  </style></head><body>${seiten.join('')}</body></html>`;
  return { html, seiten: gesamt, blatt: b0 };
}

function tagNr(iso: string): number { return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000); }

function kw(t: number): number {
  const d = t + 3 - wochentag(t);
  return 1 + Math.floor((d - tagNr(`${isoAus(d).slice(0, 4)}-01-01`)) / 7);
}

interface Teil {
  zeilen: Druckzeile[]; mitTabelle: boolean; spalten: { id: string; titel: string; mm: number }[]; tabMm: number;
  a: number; e: number; mmTag: number; zeileMm: number; achseMm: number; kopfMm: number; legendeMm: number; fussMm: number; pt: number; nr: number; gesamt: number; blatt: { b: number; h: number };
}

function seite(d: Plandaten, o: Druckoptionen, t: Teil): string {
  const k = d.kal, links = t.mitTabelle ? t.tabMm : 0, zeitB = (t.e - t.a + 1) * t.mmTag;
  const breite = links + zeitB, hoehe = t.achseMm + t.zeilen.length * t.zeileMm;
  const X = (tag: number) => links + (tag - t.a) * t.mmTag;
  const xs = (w: number) => X(k.tag(w)), xe = (s_: number, f: number) => (f > s_ ? X(k.tag(f - 1) + 1) : xs(s_));
  const fs = t.pt * 0.3528;   // Schrift in mm
  const teile: string[] = [];
  // freie Tage
  for (let tag = t.a; tag <= t.e; tag++) if (!k.arbeit(tag) && (k.frei(tag) || t.mmTag >= 1.2)) teile.push(`<rect x="${X(tag)}" y="${t.achseMm}" width="${t.mmTag}" height="${hoehe - t.achseMm}" fill="${k.frei(tag) ? '#fbe3e0' : '#f2f2ee'}"/>`);
  // Zeitachse: Monate oben, Wochen (oder Tage) unten
  const oben = t.achseMm / 2;
  for (let tag = t.a; tag <= t.e; tag++) {
    const iso = isoAus(tag);
    if (iso.endsWith('-01') || tag === t.a) {
      teile.push(`<line x1="${X(tag)}" x2="${X(tag)}" y1="0" y2="${hoehe}" stroke="#bbb" stroke-width=".2"/>`);
      const rest = Math.min(t.e + 1, tagNr(`${iso.slice(0, 7)}-01`) + 32) - tag;
      if (rest * t.mmTag > fs * 6) teile.push(`<text x="${X(tag) + 1}" y="${oben - 1}" font-size="${fs}" font-weight="bold">${MONATE[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}</text>`);
    }
    if (t.mmTag >= fs * 1.6) {
      teile.push(`<line x1="${X(tag)}" x2="${X(tag)}" y1="${oben}" y2="${t.achseMm}" stroke="#ccc" stroke-width=".15"/>`);
      teile.push(`<text x="${X(tag) + t.mmTag / 2}" y="${t.achseMm - 1}" font-size="${fs * 0.85}" text-anchor="middle">${+iso.slice(8, 10)}</text>`);
    } else if (wochentag(tag) === 0) {
      teile.push(`<line x1="${X(tag)}" x2="${X(tag)}" y1="${oben}" y2="${hoehe}" stroke="#e2e2dc" stroke-width=".15"/>`);
      if (7 * t.mmTag > fs * 2.2) teile.push(`<text x="${X(tag) + 0.6}" y="${t.achseMm - 1}" font-size="${fs * 0.85}">${7 * t.mmTag > fs * 6 ? `KW ${kw(tag)} · ${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : kw(tag)}</text>`);
    }
  }
  teile.push(`<line x1="${links}" x2="${breite}" y1="${oben}" y2="${oben}" stroke="#ccc" stroke-width=".2"/><line x1="0" x2="${breite}" y1="${t.achseMm}" y2="${t.achseMm}" stroke="#111" stroke-width=".3"/>`);
  if (o.heute && d.heute) { const h = tagNr(d.heute); if (h >= t.a && h <= t.e) teile.push(`<line x1="${X(h)}" x2="${X(h)}" y1="${t.achseMm}" y2="${hoehe}" stroke="#d32f2f" stroke-width=".3" stroke-dasharray="1.2 .8"/>`); }
  // Tabelle
  if (t.mitTabelle) {
    let x = 0;
    for (const sp of t.spalten) {
      teile.push(`<text x="${x + 1}" y="${t.achseMm - 1}" font-size="${fs}" font-weight="bold">${s(sp.titel)}</text>`);
      x += sp.mm;
      teile.push(`<line x1="${x}" x2="${x}" y1="0" y2="${hoehe}" stroke="${x === links ? '#111' : '#ddd'}" stroke-width="${x === links ? '.3' : '.15'}"/>`);
    }
  }
  const zeileY = new Map<string, number>();
  t.zeilen.forEach((z, i) => zeileY.set(z.id, t.achseMm + i * t.zeileMm));
  t.zeilen.forEach((z, i) => {
    const y = t.achseMm + i * t.zeileMm, mitte = y + t.zeileMm / 2;
    teile.push(`<line x1="0" x2="${breite}" y1="${y + t.zeileMm}" y2="${y + t.zeileMm}" stroke="#eee" stroke-width=".15"/>`);
    if (t.mitTabelle) {
      let x = 0;
      for (const sp of t.spalten) {
        const w = zelle(z, sp.id), rechts = sp.id === 'nr' || sp.id === 'dauer' || sp.id === 'pct';
        const ein = sp.id === 'name' ? 1 + z.ebene * 2.5 : 1;
        const max = Math.max(1, Math.floor((sp.mm - ein - 1) / (fs * 0.5)));
        const text = w.length > max ? `${w.slice(0, max - 1)}…` : w;
        teile.push(`<text x="${rechts ? x + sp.mm - 1 : x + ein}" y="${mitte + fs * 0.35}" font-size="${fs}"${rechts ? ' text-anchor="end"' : ''}${z.termin.gruppe ? ' font-weight="bold"' : ''}${o.kritisch && z.termin.kritisch && sp.id === 'name' ? ' fill="#b71c1c"' : ''}>${s(text)}</text>`);
        x += sp.mm;
      }
    }
    // Balken (beschnitten auf den Streifen)
    const tt = z.termin;
    const clipA = links, clipE = breite;
    if (tt.gruppe) {
      const a = Math.max(clipA, xs(tt.s)), e = Math.min(clipE, xe(tt.s, tt.f));
      if (e > a) teile.push(`<path d="M${a},${y + t.zeileMm * 0.3} H${e} v${t.zeileMm * 0.35} l-1.2,-.9 H${a + 1.2} l-1.2,.9 z" fill="#333"/>`);
    } else if (tt.f === tt.s) {
      const x = xs(tt.s), r = t.zeileMm * 0.32;
      if (x >= clipA && x <= clipE) teile.push(`<path d="M${x},${mitte - r} l${r},${r} l-${r},${r} l-${r},-${r} z" fill="#111"/>`);
    } else {
      tt.abschnitte.forEach((ab, j) => {
        const a = Math.max(clipA, xs(ab.s)), e = Math.min(clipE, xe(ab.s, ab.f));
        if (j > 0) { const pa = Math.max(clipA, xe(tt.abschnitte[j - 1]!.s, tt.abschnitte[j - 1]!.f)), pe = Math.min(clipE, xs(ab.s)); if (pe > pa) teile.push(`<line x1="${pa}" x2="${pe}" y1="${mitte}" y2="${mitte}" stroke="#888" stroke-width=".2" stroke-dasharray=".8 .6"/>`); }
        if (e > a) teile.push(`<rect x="${a}" y="${y + t.zeileMm * 0.22}" width="${e - a}" height="${t.zeileMm * 0.56}" rx=".5" fill="${z.farbe}" stroke="${o.kritisch && tt.kritisch ? '#d32f2f' : 'rgba(0,0,0,.25)'}" stroke-width="${o.kritisch && tt.kritisch ? '.4' : '.15'}"/>`);
      });
      if (z.fortschritt > 0) {
        const a = Math.max(clipA, xs(tt.s)), e = Math.min(clipE, xs(tt.s) + (xe(tt.s, tt.f) - xs(tt.s)) * Math.min(100, z.fortschritt) / 100);
        if (e > a) teile.push(`<rect x="${a}" y="${mitte - t.zeileMm * 0.08}" width="${e - a}" height="${t.zeileMm * 0.16}" fill="rgba(0,0,0,.5)"/>`);
      }
    }
    const xr = xe(tt.s, tt.f) + 1.2;
    if (xr > clipA && xr < clipE - 5) teile.push(`<text x="${xr}" y="${mitte + fs * 0.35}" font-size="${fs * 0.9}" fill="#444">${s(z.name)}${z.unternehmer ? ` · ${s(z.unternehmer)}` : ''}</text>`);
  });
  // Pfeile
  if (o.pfeile !== 'keine') {
    const termin = new Map(t.zeilen.map((z) => [z.id, z.termin]));
    for (const l of d.links) {
      const a = termin.get(l.von), b = termin.get(l.nach);
      if (!a || !b || (o.pfeile === 'kritisch' && !(a.kritisch && b.kritisch))) continue;
      const vonEnde = l.art === 'ea' || l.art === 'ee', nachEnde = l.art === 'ee' || l.art === 'ae';
      const x1 = vonEnde ? xe(a.s, a.f) : xs(a.s), x2 = nachEnde ? xe(b.s, b.f) : xs(b.s);
      if (Math.min(x1, x2) < links || Math.max(x1, x2) > breite) continue;
      const y1 = zeileY.get(l.von)! + t.zeileMm / 2, y2 = zeileY.get(l.nach)! + t.zeileMm / 2, rot = o.kritisch && a.kritisch && b.kritisch;
      const k1 = vonEnde ? x1 + 1.2 : x1 - 1.2, k2 = nachEnde ? x2 + 1.2 : x2 - 1.2;
      teile.push(`<path d="M${x1},${y1} H${k1} V${y2} H${k2} L${x2},${y2}" fill="none" stroke="${rot ? '#d32f2f' : '#666'}" stroke-width=".2"/>`);
      teile.push(`<path d="M${x2},${y2} l${nachEnde ? 1 : -1},-.6 v1.2 z" fill="${rot ? '#d32f2f' : '#666'}"/>`);
    }
  }
  const gewerke = [...new Map(d.zeilen.filter((z) => z.gewerk).map((z) => [z.gewerk, z.farbe])).entries()];
  return `<div class="blatt">
    ${o.kopf ? `<div class="kopf"><div><b>${s(d.titel)}</b>${s(d.unter)}</div><div class="r">${s(d.buero)}<br>Ende: ${kurz(d.ende)}</div></div>` : ''}
    <svg width="${breite}mm" height="${hoehe}mm" viewBox="0 0 ${breite} ${hoehe}">${teile.join('')}</svg>
    ${o.legende ? `<div class="legende">${gewerke.map(([g, f]) => `<span><i style="background:${f}"></i>${s(g)}</span>`).join('')}${o.kritisch ? '<span><i style="background:#fff;border:.4mm solid #d32f2f"></i>kritischer Weg</span>' : ''}<span><i style="background:#fbe3e0"></i>Feiertag / frei</span></div>` : ''}
    ${o.seitenzahl ? `<div class="fuss"><span>${s(d.buero)} · ${s(d.titel)} · Stand ${kurz(d.heute)}</span><span>Seite ${t.nr} von ${t.gesamt}</span></div>` : ''}
  </div>`;
}

function zelle(z: Druckzeile, id: string): string {
  switch (id) {
    case 'nr': return String(z.nr);
    case 'name': return z.name;
    case 'dauer': return `${z.termin.gruppe ? z.termin.f - z.termin.s : z.dauer} T`;
    case 'anfang': return kurz(z.termin.anfang);
    case 'ende': return kurz(z.termin.ende);
    case 'vorg': return z.vorg;
    case 'gewerk': return z.gewerk;
    case 'unternehmer': return z.unternehmer;
    case 'pct': return z.fortschritt ? `${z.fortschritt}` : '';
    default: return '';
  }
}
