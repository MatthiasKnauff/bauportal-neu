// Seite „Ablauf der Teile“ (wie bisher): je Gebäudeteil eine Kiste mit Zeitraum und Leistungen, Pfeile zeigen, welcher Teil
// auf welchen folgt (aus den Verknüpfungen zwischen ihren Leistungen). Vom Punkt rechts an einer Kiste auf eine andere ziehen
// verknüpft die Teile (Ende → Anfang); Rechtsklick auf einen Pfeil löst ihn. Klick auf eine Kiste zeigt ihre erste Leistung
// rechts in der Karte. Gibt es nur einen Teil, sagt die Seite, wie Teile entstehen (Assistent, Spalte „Gebäudeteil“).
import { For, Show, createMemo, createResource, createSignal, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Vorlage } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { planAus } from '../module/bauzeitenplan/plan';
import type { Mitte } from './baukasten/anpassung';
import { zeigeMenue } from './baukasten/kontextmenue';
import { ausfuehrenMehrere, geaendert, sicht } from './unterbau/abgleich';
import { darf, neueKennung, ruf } from './unterbau/api';

const B = 210, HK = 92, LUECKE_X = 70, LUECKE_Y = 30;
const datum = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '');

export function PlanAblauf(p: Mitte) {
  const z = () => p.fest() as Record<string, Wert> & { projekt: string; version: string };
  const lebend = (o: string) => { geaendert(o); return untrack(() => Object.values(sicht[o] ?? {}).map((x) => unwrap(x)).filter((x) => !x.geloescht && x.werte.version === z().version)); };
  const vorgaenge = createMemo(() => [...p.alle()].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0)));
  const links = createMemo(() => lebend('verknuepfung'));
  const [land] = createResource(() => z().projekt, (id) => ruf<{ land: string }>('/api/projekt/land', { projekt: id }).then((r) => r.land, () => ''));
  const plan = createMemo(() => planAus({ vorgaenge: vorgaenge(), links: links(), zeitplan: lebend('zeitplan')[0]?.werte, frei: lebend('freier_tag'), land: land() ?? '', heute: new Date().toLocaleDateString('sv') }));
  // Teile in der Reihenfolge des Plans; je Teil die Leistungen (ohne Gruppen) und der Zeitraum
  const teile = createMemo(() => {
    const m = new Map<string, { name: string; ids: string[]; s: number; f: number; anfang: string; ende: string }>();
    for (const v of vorgaenge()) {
      const t = plan().erg.termine.get(v.id), k = String(v.werte.teil ?? '').trim();
      if (!t || t.gruppe || !k) continue;
      const x = m.get(k) ?? { name: k, ids: [], s: Infinity, f: -Infinity, anfang: '', ende: '' };
      x.ids.push(v.id);
      if (t.s < x.s) { x.s = t.s; x.anfang = t.anfang; }
      if (t.f > x.f) { x.f = t.f; x.ende = t.ende; }
      m.set(k, x);
    }
    return [...m.values()];
  });
  // Lage: Spalten nach dem Anfang (gleichzeitige untereinander)
  const lage = createMemo(() => {
    const l = new Map<string, { x: number; y: number }>(), spalten: { f: number; n: number }[] = [];
    for (const t of [...teile()].sort((a, b) => a.s - b.s)) {
      let k = spalten.findIndex((s) => s.f > t.s);   // läuft parallel zu einer Spalte → darunter
      if (k < 0) { spalten.push({ f: t.f, n: 0 }); k = spalten.length - 1; }
      l.set(t.name, { x: 20 + k * (B + LUECKE_X), y: 20 + spalten[k]!.n * (HK + LUECKE_Y) });
      spalten[k]!.n++; spalten[k]!.f = Math.max(spalten[k]!.f, t.f);
    }
    return l;
  });
  const teilVon = createMemo(() => { const m = new Map<string, string>(); for (const t of teile()) for (const id of t.ids) m.set(id, t.name); return m; });
  // Teile einer Zeile: bei einer Leistung ihr Teil, bei einer Gruppe die Teile ihrer Leistungen (Verknüpfung an der Gruppe gilt für alle darin)
  const teileVon = createMemo(() => {
    const m = new Map<string, Set<string>>(), T = plan().erg.termine;
    for (const [id, t] of teilVon()) for (let e: string | null = id; e; e = T.get(e)?.eltern ?? null) (m.get(e) ?? m.set(e, new Set()).get(e)!).add(t);
    return m;
  });
  // Pfeile Teil → Teil aus den Verknüpfungen zwischen ihren Leistungen
  const pfeile = createMemo(() => {
    const m = new Map<string, { von: string; nach: string; ids: string[] }>();
    for (const l of links()) for (const a of teileVon().get(String(l.werte.von)) ?? []) for (const b of teileVon().get(String(l.werte.nach)) ?? []) {
      if (a === b) continue;
      const k = `${a}>${b}`; const x = m.get(k) ?? { von: a, nach: b, ids: [] }; if (!x.ids.includes(l.id)) x.ids.push(l.id); m.set(k, x);
    }
    return [...m.values()];
  });
  const groesse = createMemo(() => { let w = 0, h = 0; for (const v of lage().values()) { w = Math.max(w, v.x + B + 20); h = Math.max(h, v.y + HK + 20); } return { w, h }; });

  // Ziehen vom Punkt einer Kiste auf eine andere: verknüpft die zuletzt endende Leistung des einen mit der zuerst beginnenden des anderen
  const [zug, setZug] = createSignal<{ von: string; x: number; y: number } | null>(null);
  let flaeche!: SVGSVGElement;
  const punkt = (e: PointerEvent) => { const r = flaeche.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const verknuepfen = (a: string, b: string) => {
    const ta = teile().find((t) => t.name === a), tb = teile().find((t) => t.name === b); if (!ta || !tb) return;
    const T = plan().erg.termine;
    const von = [...ta.ids].sort((x, y) => T.get(y)!.f - T.get(x)!.f)[0]!, nach = [...tb.ids].sort((x, y) => T.get(x)!.s - T.get(y)!.s)[0]!;
    if (links().some((l) => l.werte.von === von && l.werte.nach === nach)) return;
    const b0: Vorlage = { objekt: 'verknuepfung', art: 'anlegen', objektId: neueKennung(), werte: { projekt: z().projekt, version: z().version, von, nach, art: 'ea', abstand: 0, von_abschnitt: null, nach_abschnitt: null, kennung: '' } };
    ausfuehrenMehrere([b0], `„${b}“ nach „${a}“`);
  };
  const loslassen = (e: PointerEvent) => {
    const g = zug(); setZug(null); if (!g) return;
    const q = punkt(e), ziel = teile().find((t) => { const l = lage().get(t.name)!; return q.x >= l.x && q.x <= l.x + B && q.y >= l.y && q.y <= l.y + HK; });
    if (ziel && ziel.name !== g.von) verknuepfen(g.von, ziel.name);
  };
  const pfeilMenue = (e: MouseEvent, a: { von: string; nach: string; ids: string[] }) => zeigeMenue(e, [
    { titel: `${a.ids.length === 1 ? 'Verknüpfung' : `${a.ids.length} Verknüpfungen`} lösen`, gefahr: true, gesperrt: !darf('verknuepfung', 'loeschen'),
      tun: () => ausfuehrenMehrere(a.ids.map((id) => ({ objekt: 'verknuepfung', art: 'loeschen' as const, objektId: id })), `„${a.nach}“ nicht mehr nach „${a.von}“`) },
  ]);
  const weg = (a: { von: string; nach: string }) => {
    const p1 = lage().get(a.von)!, p2 = lage().get(a.nach)!;
    const x1 = p1.x + B, y1 = p1.y + HK / 2, x2 = p2.x, y2 = p2.y + HK / 2;
    if (x2 > x1) { const m = (x1 + x2) / 2; return { d: `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2 - 6},${y2}`, x2, y2, rechts: true }; }
    // rückwärts oder untereinander: unten herum
    const u = Math.max(p1.y, p2.y) + HK + 14;
    return { d: `M${p1.x + B / 2},${p1.y + HK} V${u} H${p2.x + B / 2} V${p2.y + HK + 6}`, x2: p2.x + B / 2, y2: p2.y + HK, rechts: false };
  };

  return (
    <div class="ablauf">
      <Show when={teile().length > 1} fallback={
        <div class="leer-seite"><h2>Ablauf der Teile</h2><p>Hier steht je Gebäudeteil eine Kiste – und wie die Teile aufeinander folgen.</p>
          <p class="still-text">Dafür braucht der Plan mindestens zwei Teile – sie entstehen im Assistenten (Gebäudeteile, z. B. Bestand und Anbau) oder über die Spalte „Gebäudeteil“ der Leistungen.</p></div>}>
        <div class="ablauf-flaeche">
          <svg ref={flaeche} width={Math.max(groesse().w, 400)} height={Math.max(groesse().h, 200) + 30} role="img" aria-label="Ablauf der Gebäudeteile"
            onPointerMove={(e) => { const g = zug(); if (g) setZug({ ...g, ...punkt(e) }); }} onPointerUp={loslassen}>
            <defs><marker id="ablauf-spitze" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
            <For each={pfeile()}>{(a) => { const w = () => weg(a); return (
              <g class="ablauf-pfeil" onContextMenu={(e) => pfeilMenue(e, a)}>
                <path d={w().d} class="ablauf-pfeil-breit" /><path d={w().d} marker-end="url(#ablauf-spitze)" />
                <title>{`„${a.nach}“ folgt auf „${a.von}“ (${a.ids.length} ${a.ids.length === 1 ? 'Verknüpfung' : 'Verknüpfungen'}) – Rechtsklick: lösen`}</title>
              </g>); }}</For>
            <For each={teile()}>{(t) => { const l = () => lage().get(t.name)!; return (
              <g class="ablauf-kiste" classList={{ gewaehlt: t.ids.includes(p.gewaehlt() ?? '') }} transform={`translate(${l().x},${l().y})`} onClick={() => p.onWahl(t.ids[0]!)} onDblClick={() => { p.onWahl(t.ids[0]!); p.onOeffnen(); }}>
                <rect width={B} height={HK} rx={8} />
                <text x={12} y={24} class="ablauf-name">{t.name}</text>
                <text x={12} y={46} class="ablauf-text">{datum(t.anfang)} – {datum(t.ende)}</text>
                <text x={12} y={66} class="ablauf-text">{t.ids.length} {t.ids.length === 1 ? 'Leistung' : 'Leistungen'} · {t.f - t.s} AT</text>
                <Show when={darf('verknuepfung', 'schreiben')}>
                  <circle cx={B} cy={HK / 2} r={7} class="ablauf-punkt" onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); setZug({ von: t.name, ...punkt(e) }); }}>
                    <title>Auf einen anderen Teil ziehen: er folgt auf diesen</title></circle>
                </Show>
              </g>); }}</For>
            <Show when={zug()}>{(g) => { const l = () => lage().get(g().von)!; return <line x1={l().x + B} y1={l().y + HK / 2} x2={g().x} y2={g().y} class="ablauf-zieh" />; }}</Show>
          </svg>
        </div>
        <p class="still-text klein-text ablauf-fuss">Pfeile kommen aus den Verknüpfungen zwischen den Leistungen der Teile. Vom Punkt rechts an einer Kiste auf eine andere ziehen verknüpft sie (Ende → Anfang); Rechtsklick auf einen Pfeil löst ihn.</p>
      </Show>
    </div>
  );
}
