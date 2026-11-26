// Duplizieren mit Master (Bauzeitenplan, wie im bisherigen Bauportal): Anzahl Kopien, Verknüpfung der Kopie (Ende → Anfang,
// eigene Verknüpfung, im Takt, parallel), Schema nach außen – mit Vorschau aus den echten Vorgängen: das Original (bzw. die letzte
// Kopie der Kette) und die erste neue Kopie als Balken, die Verknüpfung als Pfeil. Die Rechnung steckt in bauzeitenplan/bearbeiten.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { block, bloeckeVon, duplizieren, kopienVon, nummer, type Duplizierart, type L, type Paar, type VM, type Vorlage } from '../module/bauzeitenplan/bearbeiten';
import type { Plan } from '../module/bauzeitenplan/plan';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';

const ARTEN: { wert: Duplizierart; titel: string; text: string }[] = [
  { wert: 'ende', titel: 'Ende → Anfang', text: 'Ende des letzten Vorgangs → Anfang des ersten der Kopie (Standard)' },
  { wert: 'eigen', titel: 'Eigene Verknüpfung', text: 'Ende oder Anfang eines Vorgangs → Ende oder Anfang eines Vorgangs der Kopie, auch mehrere' },
  { wert: 'takt', titel: 'Im Takt', text: 'Wie im Assistenten: jede Leistung wartet auf dieselbe Leistung der vorigen Kopie' },
  { wert: 'parallel', titel: 'Parallel', text: 'Keine Verknüpfung – die Kopie beginnt zur gleichen Zeit' },
];
const PUNKT = [{ wert: 'E', titel: 'Ende' }, { wert: 'A', titel: 'Anfang' }];

/** Befehle auf eine Liste von Einträgen anwenden – für die Vorschau, ohne etwas zu speichern. */
function anwenden(liste: Zeile[], befehle: Vorlage[], objekt: string): Zeile[] {
  const m = new Map(liste.map((z) => [z.id, z]));
  for (const b of befehle) {
    if (b.objekt !== objekt) continue;
    if (b.art === 'loeschen') m.delete(b.objektId);
    else { const alt = m.get(b.objektId); m.set(b.objektId, { ...(alt ?? { id: b.objektId }), werte: { ...(alt?.werte ?? {}), ...(b.werte ?? {}) } } as Zeile); }
  }
  return [...m.values()];
}

export function DuplizierenFenster(p: {
  v: VM[]; l: L[]; ids: string[]; vorgaenge: Zeile[]; links: Zeile[]; plan: Plan; probe: (vorgaenge: Zeile[], links: Zeile[]) => Plan;
  werteVon: (id: string) => Record<string, Wert>; zu: Record<string, Wert>; neu: () => string;
  onFertig: (befehle: Vorlage[], tops: string[], titel: string) => void; onZu: () => void;
}) {
  // Stand beim Öffnen festhalten (Props sind Getter: jeder Zugriff baute sonst neue Listen)
  const v = p.v, l = p.l, vorgaenge = p.vorgaenge, verknuepfungen = p.links, plan = p.plan;
  const [anzahl, setAnzahl] = createSignal(1);
  const [art, setArt] = createSignal<Duplizierart>('ende');
  const [schema, setSchema] = createSignal(true);
  // Kette: Master oder eine Kopie gewählt → vom Master aus, hinten an die letzte Kopie
  const R = bloeckeVon(v, p.ids);
  const t0 = v[R[0]![0]]!, mu = R.length === 1 ? (t0.master ? t0.id : t0.kopieVon) : null;
  const master = mu ? v.find((x) => x.id === mu && x.master) : undefined, K = master ? kopienVon(v, master.id) : [], schon = K.length;
  const top = schon ? master! : t0;
  const name = (id: string) => String(vorgaenge.find((x) => x.id === id)?.werte.name ?? '');
  const titel = R.length === 1 || schon ? `„${name(top.id)}“` : `${R.length} Gruppen`;
  const bereich: [number, number][] = schon ? [[v.indexOf(master!), block(v, v.indexOf(master!))]] : R;
  const zeilen = bereich.flatMap(([a, e]) => v.slice(a, e)), drin = new Set(zeilen.map((x) => x.id));
  const blaetter = zeilen.filter((x) => { const i = v.indexOf(x); return !(i + 1 < v.length && v[i + 1]!.ebene > x.ebene && drin.has(v[i + 1]!.id)); }).map((x) => x.id);
  const vonIn = (m: string) => (schon ? K[schon - 1]!.glieder.get(m) ?? m : m);   // „von“ liegt in der letzten Kopie bzw. im Original
  const [paare, setPaare] = createSignal<Paar[]>(blaetter.length ? [{ von: blaetter[blaetter.length - 1]!, vonEnde: true, nach: blaetter[0]!, nachEnde: false }] : []);
  const lage = new Map([...plan.erg.termine].map(([id, t]) => [id, { s: t.s, f: t.f }]));
  const rechne = (n: number, neu: () => string) => duplizieren(v, l, p.ids, n, art(), schema(), p.werteVon, p.zu, neu, paare(), lage);
  // Vorschau: eine Kopie zur Probe planen
  const vorschau = createMemo(() => {
    let k = 0;
    const r = rechne(1, () => `probe-${++k}`);
    const pl = p.probe(anwenden(vorgaenge, r.befehle, 'vorgang'), anwenden(verknuepfungen, r.befehle, 'verknuepfung'));
    const neuVon = new Map(r.befehle.filter((b) => b.objekt === 'vorgang' && b.art === 'anlegen').map((b) => [String(b.werte!.kopie_von), b.objektId]));
    const zeile = (id: string, kopie: boolean) => { const t = pl.erg.termine.get(id); return t ? { id, name: name(kopie ? [...neuVon].find(([, n]) => n === id)![0] : id), s: t.s, f: t.f, kopie } : null; };
    const links = blaetter.map((m) => zeile(vonIn(m), false)), rechts = blaetter.map((m) => (neuVon.get(m) ? zeile(neuVon.get(m)!, true) : null));
    const alle = [...links, ...rechts].filter((x): x is NonNullable<typeof x> => !!x);
    if (!alle.length) return null;
    const a0 = Math.min(...alle.map((x) => x.s)), a1 = Math.max(...alle.map((x) => Math.max(x.f, x.s + 1))), W = 330, L0 = 190, sx = (d: number) => L0 + ((d - a0) / Math.max(1, a1 - a0)) * W;
    const pos = new Map<string, number>(); alle.forEach((x, i) => pos.set(x.id, i));
    const P = art() === 'ende' ? [{ von: blaetter[blaetter.length - 1]!, vonEnde: true, nach: blaetter[0]!, nachEnde: false }] : art() === 'eigen' ? paare() : [];
    const pfeile = P.flatMap((x) => {
      const iv = pos.get(vonIn(x.von)), inn = pos.get(neuVon.get(x.nach) ?? ''); if (iv == null || inn == null) return [];
      const a = alle[iv]!, b = alle[inn]!, x1 = x.vonEnde ? sx(a.f) : sx(a.s), x2 = x.nachEnde ? sx(b.f) : sx(b.s), y1 = 8 + iv * 18 + 9, y2 = 8 + inn * 18 + 9;
      return [`M${x1} ${y1} L${x1 + 6} ${y1} L${x1 + 6} ${y2} L${x2} ${y2}`];
    });
    return { alle, sx, W, L0, pfeile, trenner: links.filter(Boolean).length };
  });
  const namen = () => Array.from({ length: Math.min(anzahl(), 4) }, (_, k) => nummer(name(top.id), schon + k + 1)).join(', ') + (anzahl() > 4 ? ' …' : '');
  const optBlatt = (kopie: boolean) => blaetter.map((m) => ({ wert: m, titel: `${kopie ? 'Kopie: ' : ''}${name(m)}` }));
  const setzePaar = (i: number, x: Partial<Paar>) => setPaare(paare().map((q, k) => (k === i ? { ...q, ...x } : q)));
  const los = () => { const n = Math.max(1, Math.min(50, anzahl())), r = rechne(n, p.neu); p.onFertig(r.befehle, r.tops, `${titel} ${n}× duplizieren`); };
  return (
    <Dialog titel="Duplizieren" breit onAbbrechen={p.onZu} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" onClick={los}>Duplizieren</button></>}>
      <div class="dup">
        <p>{titel} duplizieren ({zeilen.length} {zeilen.length === 1 ? 'Leistung' : 'Leistungen'}).</p>
        <label class="dup-zahl">Anzahl Kopien <input type="number" min="1" max="50" value={anzahl()} aria-label="Anzahl Kopien" onInput={(e) => setAnzahl(Math.max(1, Math.min(50, Number(e.currentTarget.value) || 1)))} />
          <span class="still-text">→ {namen()}</span></label>
        <b>Verknüpfung der Kopie</b>
        <div class="dup-arten" role="radiogroup" aria-label="Verknüpfung der Kopie">
          <For each={ARTEN}>{(a) => (
            <button type="button" role="radio" aria-checked={art() === a.wert} classList={{ aktiv: art() === a.wert }} onClick={() => setArt(a.wert)}>
              <b>{a.titel}</b><small>{a.text}</small>
            </button>
          )}</For>
        </div>
        <Show when={art() === 'eigen'}>
          <div class="dup-paare">
            <For each={paare()}>{(x, i) => (
              <div class="dup-paar">
                <Auswahlliste titel="Ende oder Anfang" wert={x.vonEnde ? 'E' : 'A'} optionen={PUNKT} onWert={(w) => setzePaar(i(), { vonEnde: w === 'E' })} />
                <span>von</span>
                <Auswahlliste titel="Vorgang" wert={x.von} optionen={optBlatt(false)} onWert={(w) => setzePaar(i(), { von: w })} />
                <span>→</span>
                <Auswahlliste titel="Ende oder Anfang der Kopie" wert={x.nachEnde ? 'E' : 'A'} optionen={PUNKT} onWert={(w) => setzePaar(i(), { nachEnde: w === 'E' })} />
                <span>von</span>
                <Auswahlliste titel="Vorgang der Kopie" wert={x.nach} optionen={optBlatt(true)} onWert={(w) => setzePaar(i(), { nach: w })} />
                <button type="button" class="knopf klein still" aria-label="Verknüpfung entfernen" onClick={() => setPaare(paare().filter((_, k) => k !== i()))}>✕</button>
              </div>
            )}</For>
            <button type="button" class="verweis-knopf" onClick={() => setPaare([...paare(), { von: blaetter[blaetter.length - 1]!, vonEnde: true, nach: blaetter[0]!, nachEnde: false }])}>＋ weitere Verknüpfung</button>
          </div>
        </Show>
        <label class="dup-schema"><input type="checkbox" checked={schema()} onChange={(e) => setSchema(e.currentTarget.checked)} /> Verknüpfungsschema nach außen wiederholen <small class="still-text">(Vorgänger und Nachfolger außerhalb)</small></label>
        <Show when={vorschau()}>{(v) => (
          <svg class="dup-vorschau" viewBox={`0 0 ${v().L0 + v().W + 10} ${8 + v().alle.length * 18 + 6}`} width="100%" role="img" aria-label="Vorschau der Kopie">
            <defs><marker id="dupPf" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" /></marker></defs>
            <For each={v().alle}>{(x, i) => (<>
              <text x={4} y={8 + i() * 18 + 13} class="dup-text">{x.kopie ? '↳ ' : ''}{x.name.slice(0, 26)}</text>
              <rect x={v().sx(x.s)} y={8 + i() * 18 + 3} width={Math.max(3, v().sx(Math.max(x.f, x.s + 1)) - v().sx(x.s))} height={12} rx={2} class="dup-balken" classList={{ kopie: x.kopie }} />
            </>)}</For>
            <line x1={0} x2={v().L0 + v().W} y1={8 + v().trenner * 18 + 1} y2={8 + v().trenner * 18 + 1} class="dup-linie" />
            <For each={v().pfeile}>{(d) => <path d={d} class="dup-pfeil" marker-end="url(#dupPf)" />}</For>
          </svg>
        )}</Show>
        <p class="still-text klein-text">{schon ? `Hängt an die Kette von „${name(top.id)}“ an (schon ${schon} ${schon === 1 ? 'Kopie' : 'Kopien'}) – verknüpft mit der letzten Kopie.` : `„${name(top.id)}“ wird Master: Änderungen daran lassen sich später in alle Kopien übernehmen.`}</p>
      </div>
    </Dialog>
  );
}
