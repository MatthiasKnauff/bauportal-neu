// Planungsassistent des Bauzeitenplans: aus Gebäudeart, Maßnahmen, Bereichen und Bauweise (im Gebäudemodell erfasst) die
// passenden Leistungen mit Richtdauern und Abfolge. Reine Rechnung auf Daten des Leistungskatalogs (Kanal) – im Browser
// für die Auswahl, auf dem Server für die Übernahme in den Plan. Das Verhalten folgt dem bisherigen Assistenten:
// Empfehlung je Bauart, Bauweisen wählen Leistungen an und ab, Dauern aus Mengen, Ketten überbrücken nicht gewählte
// Leistungen, Einheiten parallel oder im Takt. Neu geschrieben; aus dem alten Programm stammen nur die Katalogdaten.
import type { Wert, Werte } from '../../kern/modell';
import type { Art } from './rechnung';

export interface KLeistung {
  id: string; n: string; ph: string; gw: string; din: string; sc: 'bau' | 'we'; d: number; fix: boolean; ms: boolean;
  bz: string; lw: number | null; kmax: number | null; w: boolean; a: { id: string; art: Art; abstand: number }[]; nb: boolean; req: string; info: string; reihe: number;
}
interface Option { k: string; n: string; on: string[]; ovr?: Record<string, Partial<{ n: string; d: number; din: string; gw: string; a: unknown[] }>>; mul?: Record<string, number>; if?: Record<string, string[]>; hidden?: boolean }
interface Gruppe { k: string; ph: string; n: string; types: string[]; onTypes?: string[]; opts: Option[] }
interface Profil { k: string; n: string; floors?: number; dg?: string; choice?: Record<string, string>; area?: number; units?: number; takt?: string; rec: string[]; opt: string[] | '*'; ovr?: Record<string, Record<string, unknown>>; naming?: string; noScale?: boolean; like?: string[]; fest?: Record<string, string>; best?: number; kenn?: { fl?: string; h?: number; wand?: number }; erw?: string }
interface Geb { k: string; n: string; fl: string; h: number; wand: number; groesse: string; area: number; units: number; floors: number; naming: string; std: string; opt: string; weg: string; eigen?: boolean }
interface Mass { k: string; n: string; base: Record<string, string>; erw?: string; neu?: boolean; std?: string; opt?: string; weg?: string; ohneOvr?: boolean }
interface Ber { k: string; n: string; ids?: string; ph?: string; prof?: string; profRec?: boolean }
interface Kombi { geb: Geb[]; mass: Mass[]; ber: Ber[]; eigenNeu?: Record<string, string>; denkmal?: { std?: string; zuschlag?: number }; aussen?: string; immer?: string; nurNeu?: string }

export interface Katalog { leistungen: Map<string, KLeistung>; abschnitte: { k: string; n: string }[]; ref: { bau: number; we: number }; profile: Map<string, Profil>; bauweisen: Gruppe[]; kombi: Kombi }
export type Mengen = { wf: number; bgf: number; gr: number; fas: number; dach: number; wand: number; u: number; g: number };
export interface Angaben {
  geb: string; mass: string[]; ber: string[]; denkmal: boolean;
  flaeche: number; einheiten: number; geschosse: number; dg: string; takt: 'parallel' | 'versetzt';
  wahl: Record<string, string>;            // Bauweise: Gruppe → Ausführung
  mengen?: Partial<Mengen>;                // aus dem Gebäudemodell, wenn bekannt (sonst aus Fläche und Geschossen überschlagen)
  auswahl?: string[];                      // von Hand gewählte Leistungen (sonst die Empfehlung)
  dauern?: Record<string, number>;         // von Hand gesetzte Dauern
}

const sp = (x: unknown) => String(x ?? '').split(/\s+/).filter(Boolean);
const NEUBAU = ['neubau_efh', 'neubau_mfh'], UMBAU = ['umbau_efh', 'umbau_mfh'];
const ERW = new Set(['aushub', 'grundl', 'grund', 'sauber', 'keller', 'keller_abd', 'verfuell', 'mauer', 'holz_mont', 'innenw', 'zimmer', 'dach_deck', 'dach_daemm', 'dampfsp', 'lattung', 'flachdach', 'gruendach', 'klempner', 'fenster_neu', 'aussenputz']);
const ARTEN: Record<string, Art> = { fs: 'ea', ss: 'aa', ff: 'ee', sf: 'ae', ea: 'ea', aa: 'aa', ee: 'ee', ae: 'ae' };

/** Katalog aus den Einträgen „Leistung im Katalog“ und „Regel des Planungsassistenten“. */
export function katalogAus(vorlagen: { werte: Werte }[], regeln: { werte: Werte }[]): Katalog {
  const regel = (art: string) => regeln.filter((r) => r.werte.art === art).sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0)).map((r) => { try { return JSON.parse(String(r.werte.daten ?? 'null')); } catch { return null; } }).filter(Boolean);
  const abschnitte = (regel('abschnitte')[0] ?? []) as { k: string; n: string }[];
  const bezug = (regel('bezug')[0] ?? { ref: { bau: 140, we: 80 }, leistung: {} }) as { ref: { bau: number; we: number }; leistung: Record<string, { ph: string }> };
  const phName = new Map(abschnitte.map((a) => [a.n, a.k]));
  const leistungen = new Map<string, KLeistung>();
  for (const v of vorlagen) {
    const w = v.werte, id = String(w.kennung || '') || `eigen:${String(w.name)}`;
    leistungen.set(id, {
      id, n: String(w.name ?? ''), ph: bezug.leistung[id]?.ph ?? phName.get(String(w.abschnitt ?? '')) ?? 'ausbau', gw: String(w.gewerk ?? ''), din: String(w.din ?? ''),
      sc: w.bezug === 'we' ? 'we' : 'bau', d: Number(w.dauer ?? 1) || 1, fix: w.fest === true, ms: w.meilenstein === true, bz: String(w.bezugsgroesse ?? ''),
      lw: w.leistungswert == null ? null : Number(w.leistungswert), kmax: w.kolonnen == null ? null : Number(w.kolonnen), w: w.wartezeit === true,
      a: sp(w.vorgaenger).map((x) => { const [id_, art, ab] = x.split(':'); return { id: id_!, art: ARTEN[(art ?? 'fs').toLowerCase()] ?? 'ea', abstand: Number(ab ?? 0) || 0 }; }),
      nb: w.ohne_bruecke === true, req: String(w.voraussetzung ?? ''), info: String(w.info ?? ''), reihe: Number(w.reihe ?? 9999),
    });
  }
  return { leistungen, abschnitte, ref: bezug.ref, profile: new Map((regel('profil') as Profil[]).map((p) => [p.k, p])), bauweisen: regel('bauweise') as Gruppe[], kombi: (regel('kombi')[0] ?? { geb: [], mass: [], ber: [] }) as Kombi };
}

/** Bauart aus Gebäudeart, Maßnahmen und Bereichen: Empfehlung, Angebot, Vorgaben – wie ein Gebäudetyp. */
export function bauart(k: Katalog, a: Pick<Angaben, 'geb' | 'mass' | 'ber' | 'denkmal'>): Profil | null {
  const KB = k.kombi, G = KB.geb.find((g) => g.k === a.geb);
  if (!G) return null;
  let massK = KB.mass.map((m) => m.k).filter((x) => a.mass.includes(x));
  if (massK.includes('nb')) massK = massK.filter((x) => x === 'nb' || x === 'ab');   // Neubau schließt Bestandsmaßnahmen aus (Abbruch darf dazu)
  const M = KB.mass.filter((m) => massK.includes(m.k)), Mx = M.length ? M : KB.mass.slice(0, 1);
  const rec = new Set<string>(), opt = new Set<string>(), like = new Set<string>(), choice: Record<string, string> = {}, ovr: Record<string, Record<string, unknown>> = {}, fest: Record<string, string> = {};
  let erster: Profil | undefined;
  for (const m of Mx) {
    if (m.k === 'nb' && G.eigen) { sp(KB.eigenNeu?.[G.k]).forEach((x) => rec.add(x)); continue; }
    const b = k.profile.get(m.base?.[G.groesse] ?? '');
    if (b) {
      const nurAngebot = new Set(sp(m.weg));
      erster ??= b;
      b.rec.forEach((x) => (nurAngebot.has(x) ? opt : rec).add(x));
      if (Array.isArray(b.opt)) b.opt.forEach((x) => opt.add(x));
      for (const [g, v] of Object.entries(b.choice ?? {})) if (!(g in choice)) choice[g] = v;
      if (!m.ohneOvr) Object.assign(ovr, b.ovr ?? {});
      if (!G.eigen || ![...NEUBAU, ...UMBAU].includes(b.k)) like.add(b.k);
    }
    sp(m.std).forEach((x) => rec.add(x)); sp(m.opt).forEach((x) => opt.add(x));
  }
  const erw = Mx.filter((m) => m.erw).map((m) => m.erw!);
  if (erw.length) fest.erweiterung = erw.length > 1 ? 'beides' : erw[0]!;
  else if (Mx.some((m) => UMBAU.includes(m.base?.[G.groesse] ?? ''))) fest.erweiterung = 'keine';
  sp(G.std).forEach((x) => rec.add(x)); sp(G.opt).forEach((x) => opt.add(x));
  const neuOderErw = Mx.some((m) => m.k === 'nb' || m.erw);
  if (!sp(G.weg).includes('aussenanl') && neuOderErw) { sp(KB.aussen).forEach((x) => rec.add(x)); for (const l of k.leistungen.values()) if (l.ph === 'aussen') opt.add(l.id); }
  if (a.denkmal) sp(KB.denkmal?.std).forEach((x) => rec.add(x));
  for (const x of sp(G.weg)) if (rec.delete(x)) opt.add(x);
  if (!neuOderErw) for (const x of sp(KB.nurNeu)) if (rec.delete(x)) opt.add(x);
  const ber = KB.ber.map((b) => b.k).filter((x) => a.ber.includes(x));
  let noScale = false;
  if (ber.length) {   // nur die gewählten Bereiche (+ Planung, Vorbereitung, Abschluss)
    const immer = new Set(sp(KB.immer)), ok = new Set([...k.leistungen.values()].filter((l) => immer.has(l.ph)).map((l) => l.id)), okAngebot = new Set<string>();
    for (const bk of ber) {
      const B0 = KB.ber.find((b) => b.k === bk)!;
      sp(B0.ids).forEach((x) => { ok.add(x); opt.add(x); });
      if (bk === 'ah') sp(KB.aussen).forEach((x) => { ok.add(x); rec.add(x); });
      const phs = new Set(sp(B0.ph));
      for (const l of k.leistungen.values()) if (phs.has(l.ph)) { ok.add(l.id); opt.add(l.id); }
      const bp = B0.prof ? k.profile.get(B0.prof) : undefined;
      if (bp) { bp.rec.forEach((x) => { if (B0.profRec) { ok.add(x); rec.add(x); } else { okAngebot.add(x); opt.add(x); } }); if (Array.isArray(bp.opt)) bp.opt.forEach((x) => { okAngebot.add(x); opt.add(x); }); }
    }
    for (const x of [...rec]) if (!ok.has(x)) { rec.delete(x); if (okAngebot.has(x)) opt.add(x); }
    for (const x of [...opt]) if (!ok.has(x) && !okAngebot.has(x)) opt.delete(x);
    if (ber.every((b) => b === 'ba' || b === 'ku')) { noScale = true; Object.assign(ovr, k.profile.get('bad')?.ovr ?? {}); }   // nur Bäder/Küchen: feste Dauern wie bei der Badsanierung
  }
  const neu = Mx.every((m) => m.neu);
  const da = (x: string) => k.leistungen.has(x);
  return {
    k: `k:${G.k}:${Mx.map((m) => m.k).join('.')}:${ber.join('.')}${a.denkmal ? ':d' : ''}`,
    n: `${G.n} · ${Mx.map((m) => m.n).join(' + ')}${ber.length ? ` (${KB.ber.filter((b) => ber.includes(b.k)).map((b) => b.n).join(', ')})` : ''}${a.denkmal ? ' · Denkmal' : ''}`,
    floors: G.floors, dg: erster?.dg ?? 'kalt', area: G.area, units: G.units, naming: G.naming, takt: erster?.takt ?? 'versetzt',
    choice: { ...choice, ...fest }, fest, ovr, like: [...like], kenn: { fl: G.fl, h: G.h, wand: G.wand }, erw: fest.erweiterung && fest.erweiterung !== 'keine' ? fest.erweiterung : '',
    best: neu ? 1 : a.denkmal ? KB.denkmal?.zuschlag ?? 1.4 : 1.25, noScale,
    rec: [...rec].filter(da), opt: [...opt].filter((x) => da(x) && !rec.has(x)),
  };
}

/** Der Assistent für eine Bauart: Fragen zur Bauweise, Auswahl, Dauern, Plan. */
export function assistent(k: Katalog, a: Angaben) {
  const p = bauart(k, a);
  if (!p) return null;
  const like = (types: string[]) => (p.like ?? []).some((t) => types.includes(t));
  const GR = new Map(k.bauweisen.map((g) => [g.k, g]));
  const sichtbar = (g: Gruppe) => like(g.types);
  const optionen = (g: Gruppe, tiefe = 0): Option[] => g.opts.filter((o) => !o.hidden && (!o.if || tiefe > 3 || Object.entries(o.if).every(([gk, l]) => !GR.get(gk) || !sichtbar(GR.get(gk)!) || l.includes(wahl(gk, tiefe + 1)))));
  function wahl(gk: string, tiefe = 0): string {
    const g = GR.get(gk);
    if (!g) return '';
    if (p!.fest?.[gk]) return p!.fest[gk]!;
    const ok = optionen(g, tiefe), will = a.wahl[gk] ?? p!.choice?.[gk];
    return (ok.find((o) => o.k === will) ?? ok[0] ?? g.opts[0]!).k;
  }
  const lebt = (g: Gruppe) => sichtbar(g) && optionen(g).length > 0;
  const gewaehlt = k.bauweisen.filter(lebt).map((g) => g.opts.find((o) => o.k === wahl(g.k))!).filter(Boolean);

  const mitVoraussetzung = (s: Set<string>, id: string) => { for (let x: string | undefined = id; x && k.leistungen.has(x) && !s.has(x); x = k.leistungen.get(x)!.req || undefined) s.add(x); };
  /** Empfehlung zur gewählten Bauweise: was eine Bauweise an- oder abwählt, folgt der Wahl. */
  function empfehlung(): string[] {
    const s = new Set(p!.rec);
    for (const g of k.bauweisen) {
      if (!lebt(g)) continue;
      const schaltet = !g.onTypes || like(g.onTypes);
      if (!schaltet) continue;
      for (const o of g.opts) for (const x of o.on) s.delete(x);
      for (const x of g.opts.find((o) => o.k === wahl(g.k))!.on) mitVoraussetzung(s, x);
    }
    for (const x of [...s]) mitVoraussetzung(s, x);
    return [...s].filter((x) => k.leistungen.has(x));
  }
  /** Die Leistung so, wie sie für diese Bauart und Bauweise gilt (Name, Dauer, VOB, Vorgänger). */
  function leistung(id: string): KLeistung | undefined {
    const b = k.leistungen.get(id);
    if (!b) return undefined;
    const r: KLeistung = { ...b };
    const anwenden = (o: Record<string, unknown> | undefined) => {
      if (!o) return;
      if (typeof o.n === 'string') r.n = o.n;
      if (typeof o.d === 'number') r.d = o.d;
      if (o.din != null) r.din = String(o.din);
      if (typeof o.gw === 'string') r.gw = o.gw;
      if (typeof o.info === 'string') r.info = o.info;
      if (Array.isArray(o.a)) r.a = o.a.map((x) => (Array.isArray(x) ? { id: String(x[0]), art: ARTEN[String(x[1] ?? 'fs').toLowerCase()] ?? 'ea', abstand: Number(x[2] ?? 0) || 0 } : { id: String(x), art: 'ea' as Art, abstand: 0 }));
    };
    anwenden(p!.ovr?.[id]);
    for (const o of gewaehlt) { anwenden(o.ovr?.[id] as Record<string, unknown> | undefined); const m = o.mul?.[id]; if (m) r.d = Math.max(1, Math.round(r.d * m)); }
    return r;
  }

  // ---------- Mengen und Dauern ----------
  const kn = p.kenn ?? {};
  const dgFaktor = (dg: string) => (dg === 'aus' ? 0.6 : dg === 'staffel' ? 0.7 : 0);
  const flach = () => k.bauweisen.some((g) => g.k === 'dachform' && lebt(g)) ? wahl('dachform') === 'flach' : kn.fl === 'bgf';
  const geo = (A: number, n: number, dg: string, mitDach = flach()): Mengen => {
    const dgA = dgFaktor(dg), bgf = kn.fl === 'bgf' ? A : 1.25 * A, wf = kn.fl === 'bgf' ? A / 1.25 : A, gr = bgf / (n + dgA), u = 4 * Math.sqrt(gr);
    return { wf, bgf, gr, u, g: n + dgA, fas: u * (n * (kn.h ?? 2.9) + (dgA ? 1.5 : 0)), dach: gr * (mitDach ? 1.05 : 1.35), wand: (kn.wand ?? 2.8) * A };
  };
  // Referenzhaus: Einfamilienhaus, 140 m², EG + ausgebautes DG, Satteldach – dort gilt die Richtdauer des Katalogs
  const ref = (() => { const dgA = 0.6, A = k.ref.bau, bgf = 1.25 * A, gr = bgf / (1 + dgA), u = 4 * Math.sqrt(gr); return { wf: A, bgf, gr, u, g: 1 + dgA, fas: u * (2.9 + 1.5), dach: gr * 1.35, wand: 2.8 * A } as Mengen; })();
  const flaeche = a.flaeche || p.area || k.ref.bau, einheiten = Math.max(1, Math.round(a.einheiten || p.units || 1)), geschosse = Math.max(1, Math.round(a.geschosse || p.floors || 1)), dg = a.dg || p.dg || 'kalt';
  const mengen: Mengen = { ...geo(flaeche, geschosse, dg), ...Object.fromEntries(Object.entries(a.mengen ?? {}).filter(([, v]) => Number(v) > 0)) } as Mengen;
  const erwFlaeche = p.erw === 'aufstock' ? Math.round(flaeche / geschosse) : p.erw === 'anbau' ? Math.round(flaeche * 0.3) : p.erw === 'beides' ? Math.round(flaeche * 0.3 + flaeche / geschosse) : 0;
  function rechenweg(l: KLeistung): { d: number; weg: string } {
    if (l.ms) return { d: 0, weg: 'Meilenstein' };
    if (l.fix || p!.noScale) return { d: Math.max(1, Math.round(l.d)), weg: 'feste Dauer' };
    const base = k.leistungen.get(l.id);
    if (base?.bz && (ref as Record<string, number>)[base.bz]) {
      const lw = base.lw || (ref as Record<string, number>)[base.bz]! / Math.max(0.5, base.d);
      let m = mengen, best = p!.best ?? 1, erw = false;
      if (p!.erw && ERW.has(base.id) && erwFlaeche) { m = geo(erwFlaeche, p!.erw === 'aufstock' ? 1 : Math.min(2, geschosse), p!.erw === 'aufstock' ? dg : 'kalt'); best = 1; erw = true; }
      const je = l.sc === 'we' && !erw ? einheiten : 1, menge = (m as Record<string, number>)[base.bz]! / je;
      const t1 = menge / lw, kol = Math.min(base.kmax || 5, 1 + Math.max(0, t1 - 30) / 60);
      const anteil = base.d ? l.d / base.d : 1;
      return { d: Math.max(1, Math.round((t1 / kol) * best * anteil)), weg: `${erw ? 'Erweiterung: ' : ''}${Math.round(menge)} ${base.bz} ÷ ${Math.round(lw * 10) / 10}/Tag${kol >= 1.05 ? ` ÷ ${Math.round(kol * 10) / 10} Kolonnen` : ''}${best > 1 ? ` + ${Math.round((best - 1) * 100)} % Bestand` : ''}` };
    }
    const r = l.sc === 'bau' ? k.ref.bau : k.ref.we, A = l.sc === 'bau' ? flaeche : flaeche / einheiten;
    return { d: Math.max(1, Math.round(l.d * Math.min(5, Math.max(0.35, Math.pow(A / r, 0.7))))), weg: 'Richtwert, nach Fläche hochgerechnet' };
  }
  const dauer = (id: string) => { const l = leistung(id); if (!l) return 1; if (l.ms) return 0; const h = a.dauern?.[id]; return h != null && h >= 0 ? Math.round(h) : rechenweg(l).d; };

  const auswahl = () => new Set((a.auswahl ?? empfehlung()).filter((x) => k.leistungen.has(x)));
  const reihe = (id: string) => k.leistungen.get(id)?.reihe ?? 9999;
  const namen = Array.from({ length: einheiten }, (_, i) => {
    const og = i ? `${i}.OG` : 'EG';
    switch (p.naming) { case 'whg': return `Wohnung ${i + 1}`; case 'gesch': return `Wohnung ${og}`; case 'ge': return og; default: return `Einheit ${i + 1}`; }
  });

  /** Der Plan: Zeilen (mit Kennung, Gliederung, Dauer) und Verknüpfungen. blk -1 = Gebäude, 0… = Einheit. */
  function plan(): { zeilen: { kennung: string; werte: Record<string, Wert> }[]; links: { kennung: string; von: string; nach: string; werte: Record<string, Wert> }[] } {
    const sel = auswahl(), mehr = einheiten > 1, Z: { kennung: string; id: string; blk: number; werte: Record<string, Wert> }[] = [];
    const zeile = (kennung: string, id: string, blk: number, werte: Record<string, Wert>) => Z.push({ kennung: `assistent:${kennung}`, id, blk, werte: { dauer: 0, fortschritt: 0, gewerk: '', unternehmer: '', notiz: '', farbe: '', unterbrechung: '', anfang_nicht_vor: null, ...werte } });
    zeile('_start', '_start', -1, { name: 'Projektstart', ebene: 0 });
    const liste = [...sel].sort((x, y) => reihe(x) - reihe(y)).map((id) => leistung(id)!);
    const gruppen = (l: KLeistung[], blk: number, ebene: number) => {
      for (const ph of k.abschnitte) {
        const t = l.filter((x) => x.ph === ph.k);
        if (!t.length) continue;
        zeile(`_grp:${ph.k}@${blk}`, '_grp', blk, { name: ph.n, ebene });
        for (const x of t) zeile(`${x.id}@${x.sc === 'bau' ? -1 : blk < 0 ? 0 : blk}`, x.id, x.sc === 'bau' ? -1 : blk < 0 ? 0 : blk, { name: x.n, ebene: ebene + 1, dauer: dauer(x.id), gewerk: x.gw, notiz: x.info });
      }
    };
    if (!mehr) gruppen(liste, -1, 0);
    else {
      const bau = liste.filter((x) => x.sc === 'bau'), we = liste.filter((x) => x.sc === 'we');
      if (bau.length) { zeile('_bau', '_bau', -1, { name: 'Gebäude / Allgemein', ebene: 0 }); gruppen(bau, -1, 1); }
      namen.forEach((nm, b) => { zeile(`_unit@${b}`, '_unit', b, { name: nm, ebene: 0 }); gruppen(we, b, 1); zeile(`_fertig@${b}`, '_fertig', b, { name: `${nm} fertiggestellt`, ebene: 1 }); });
    }
    zeile('_end', '_end', -1, { name: mehr ? 'Gesamtabnahme / Übergabe' : 'Abnahme / Übergabe', ebene: 0 });
    Z.forEach((z, i) => (z.werte.reihe = i + 1));

    // Verknüpfungen aus dem Katalog: nicht gewählte Vorgänger werden überbrückt (außer „nicht überbrücken“), doppelte über die Kette entfallen
    const schl = (id: string, blk: number) => `${id}@${blk}`;
    const da = new Map(Z.map((z) => [schl(z.id, z.blk), z]));
    const sc = (id: string) => k.leistungen.get(id)?.sc ?? 'bau';
    const vorhanden = (id: string, ctx: number | 'alle') => (sc(id) === 'bau' ? da.has(schl(id, -1)) : ctx === 'alle' ? namen.some((_, b) => da.has(schl(id, b))) : da.has(schl(id, ctx)));
    const ctxVon = (id: string, ctx: number | 'alle') => (sc(id) === 'bau' ? 'alle' : ctx);
    type V = { id: string; art: Art; abstand: number };
    const aufloesen = (id: string, ctx: number | 'alle', gesehen = new Set<string>()): V[] => {
      const out: V[] = [];
      for (const v of leistung(id)?.a ?? []) {
        if (v.id === 'start') { out.push({ id: '_start', art: v.art, abstand: v.abstand }); continue; }
        const b = k.leistungen.get(v.id);
        if (!b || gesehen.has(v.id)) continue;
        if (vorhanden(v.id, ctx)) out.push(v);
        else if (!b.nb) { gesehen.add(v.id); for (const r of aufloesen(v.id, ctx, gesehen)) out.push({ id: r.id, art: 'ea', abstand: 0 }); }
      }
      return out;
    };
    const vorfahrenMerk = new Map<string, Set<string>>();
    const vorfahren = (id: string, ctx: number | 'alle'): Set<string> => {
      const key = `${id}|${ctx}`;
      let s = vorfahrenMerk.get(key);
      if (s) return s;
      vorfahrenMerk.set(key, (s = new Set()));
      for (const r of aufloesen(id, ctx)) if (r.id !== '_start') { s.add(r.id); for (const x of vorfahren(r.id, ctxVon(r.id, ctx))) s.add(x); }
      return s;
    };
    const reduziert = (id: string, ctx: number | 'alle'): V[] => {
      const m = new Map<string, V>();
      for (const r of aufloesen(id, ctx)) if (!m.has(r.id)) m.set(r.id, r);
      let rs = [...m.values()];
      const ids = rs.map((r) => r.id);
      rs = rs.filter((r) => !ids.some((q) => q !== r.id && q !== '_start' && vorfahren(q, ctxVon(q, ctx)).has(r.id)));
      if (rs.length > 1) rs = rs.filter((r) => r.id !== '_start');
      return rs.length ? rs : [{ id: '_start', art: 'ea', abstand: 0 }];
    };
    const L = new Map<string, Map<string, { art: Art; abstand: number }>>();
    const dazu = (s: { kennung: string } | undefined, v: { kennung: string } | undefined, art: Art = 'ea', abstand = 0) => {
      if (!s || !v || s === v) return;
      let m = L.get(s.kennung);
      if (!m) L.set(s.kennung, (m = new Map()));
      if (!m.has(v.kennung)) m.set(v.kennung, { art, abstand });
    };
    const start = da.get(schl('_start', -1)), ende = da.get(schl('_end', -1));
    const regulaer = Z.filter((z) => k.leistungen.has(z.id));
    for (const s of regulaer) {
      const ctx: number | 'alle' = sc(s.id) === 'bau' ? 'alle' : s.blk;
      for (const r of reduziert(s.id, ctx)) {
        if (r.id === '_start') dazu(s, start);
        else if (sc(r.id) === 'bau') dazu(s, da.get(schl(r.id, -1)), r.art, r.abstand);
        else if (ctx === 'alle') namen.forEach((_, b) => dazu(s, da.get(schl(r.id, b)), r.art, r.abstand));
        else dazu(s, da.get(schl(r.id, s.blk)), r.art, r.abstand);
      }
      // Takt: dieselbe Kolonne zieht von Einheit zu Einheit; Wartezeiten (Trocknen) laufen überall zugleich
      if (sc(s.id) === 'we' && mehr && a.takt === 'versetzt' && !k.leistungen.get(s.id)!.w) for (let b = s.blk - 1; b >= 0; b--) { const v = da.get(schl(s.id, b)); if (v) { dazu(s, v); break; } }
    }
    const nachfolger = new Map<string, string[]>();
    for (const s of regulaer) for (const v of (L.get(s.kennung) ?? new Map()).keys()) (nachfolger.get(v) ?? nachfolger.set(v, []).get(v)!).push(s.kennung);
    const blkVon = new Map(Z.map((z) => [z.kennung, z.blk]));
    const fertig = Z.filter((z) => z.id === '_fertig');
    for (const f of fertig) regulaer.filter((t) => t.blk === f.blk && sc(t.id) === 'we' && !(nachfolger.get(t.kennung) ?? []).some((x) => blkVon.get(x) === f.blk)).forEach((t) => dazu(f, t));
    if (ende) {
      if (mehr) { fertig.forEach((f) => dazu(ende, f)); regulaer.filter((t) => t.blk === -1 && !(nachfolger.get(t.kennung) ?? []).length).forEach((t) => dazu(ende, t)); }
      else regulaer.filter((t) => !(nachfolger.get(t.kennung) ?? []).length).forEach((t) => dazu(ende, t));
      if (!L.get(ende.kennung)) dazu(ende, start);
    }
    for (const f of fertig) if (!L.get(f.kennung)) dazu(f, start);
    const links = [...L.entries()].flatMap(([nach, m]) => [...m.entries()].map(([von, v]) => ({ kennung: `${von}>${nach}`, von, nach, werte: { art: v.art, abstand: v.abstand, von_abschnitt: null, nach_abschnitt: null } as Record<string, Wert> })));
    return { zeilen: Z.map((z) => ({ kennung: z.kennung, werte: z.werte })), links };
  }

  const fragen = k.bauweisen.filter((g) => lebt(g) && !p.fest?.[g.k]).map((g) => ({ k: g.k, ph: g.ph, n: g.n, wert: wahl(g.k), optionen: optionen(g).map((o) => ({ k: o.k, n: o.n })) })).filter((g) => g.optionen.length > 1);
  return { bauart: p, fragen, empfehlung, angebot: () => (p.opt === '*' ? [...k.leistungen.keys()] : p.opt), auswahl, leistung, dauer, rechenweg, plan, einheiten, namen, flaeche, geschosse, mengen };
}

/** Gebäudemodell → Angaben des Assistenten (Gebäudeart, Maßnahmen, Bereiche, Bauweise, Größe, Mengen aus den Bauteilen). */
export function angabenAusGebaeude(g: Werte, bauteile: { werte: Werte }[], geschosse: number): Omit<Angaben, 'takt'> {
  const NUTZ: Record<string, string> = { efh: 'ef', mfh: 'mf', wohnung: 'wo', wohn_geschaeft: 'wg', buero: 'bu', bildung: 'sc', gesundheit: 'pf', gewerbe: 'ha', handel: 'hg', garage: 'ga', landwirtschaft: 'lw', sonder: 'so' };
  const MASS: Record<string, string> = { neubau: 'nb', anbau: 'an', aufstockung: 'au', umbau: 'um', wohnungssanierung: 'ws', kernsanierung: 'ks', energetisch: 'es', instandsetzung: 'is', innenausbau: 'ia', abbruch: 'ab' };
  const BER: Record<string, string> = { keller: 'ke', dach: 'da', fassade: 'fa', fenster: 'fe', baeder: 'ba', kuechen: 'ku', haustechnik: 'tg', brandschutz: 'br', barrierefrei: 'bf', schadstoffe: 'sd', aussenanlagen: 'ah', tiefgarage: 'ti' };
  // Bauweise: dieselben Fragen wie im Gebäudemodell, nur andere Kürzel
  const W: Record<string, [string, Record<string, string>]> = {
    keller: ['keller', { ohne: 'none', wu: 'wu', gemauert: 'mw', fertig: 'ft' }], tragwerk: ['tragwerk', { massiv: 'massiv', stahlbeton: 'stb', holzrahmen: 'holz', brettsperrholz: 'bsp', gemischt: 'misch' }],
    dachform: ['dachform', {}], dachdeckung: ['dachdeckung', {}], fassade: ['fassade', {}], fenster: ['fenster', {}], pv: ['pv', { keine: 'none', pv: 'pv', pv_speicher: 'pvs' }],
    heizung: ['heizung', { bleibt: 'keep', fernwaerme: 'fern' }], lueftung: ['lueftung', { dezentral: 'dez', zentral: 'kwl' }], waermeverteilung: ['waermevert', { heizkoerper: 'hk' }],
    estrich: ['estrichart', { zement: 'ze', calciumsulfat: 'ca', trocken: 'te' }], innenausbau: ['innenwand', { trockenbau: 'tb', beides: 'both' }], bodenbelag: ['bodenbelag', { massivparkett: 'massiv' }],
    bestandskeller: ['bestkeller', { bleibt: 'keiner' }], anbaukeller: ['anbaukeller', { ohne: 'none', gemauert: 'mw', fertig: 'ft' }],
  };
  const wahl: Record<string, string> = {};
  for (const [feld, [gk, m]] of Object.entries(W)) if (g[feld]) wahl[gk] = m[String(g[feld])] ?? String(g[feld]);
  const summe = (art: string, einheit = 'm2') => bauteile.filter((b) => b.werte.art === art && (b.werte.einheit ?? einheit) === einheit).reduce((s, b) => s + (Number(b.werte.menge) || 0), 0);
  const fas = summe('aussenwand') + summe('fenster'), dach = summe('dach'), gr = summe('bodenplatte'), innen = summe('innenwand');
  const mengen: Partial<Mengen> = { ...(fas ? { fas } : {}), ...(dach ? { dach } : {}), ...(gr ? { gr } : {}), ...(innen || fas ? { wand: 2 * innen + summe('aussenwand') } : {}), ...(Number(g.bgf) ? { bgf: Number(g.bgf) } : {}) };
  return {
    geb: NUTZ[String(g.nutzung ?? '')] ?? 'ef', mass: sp(String(g.massnahme ?? '').replace(/,/g, ' ')).map((m) => MASS[m]).filter((x): x is string => !!x),
    ber: sp(String(g.bereiche ?? '').replace(/,/g, ' ')).map((b) => BER[b]).filter((x): x is string => !!x), denkmal: g.denkmal === true,
    flaeche: Number(g.wohnflaeche) || 0, einheiten: Number(g.einheiten) || 0, geschosse: Number(g.geschosszahl) || geschosse || 0,
    dg: g.dach_oben === 'ausgebaut' ? 'aus' : g.dach_oben === 'nichts' ? 'direkt' : g.dach_oben === 'kalt' ? 'kalt' : '', wahl, mengen,
  };
}
