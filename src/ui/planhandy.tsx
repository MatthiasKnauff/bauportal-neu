// Bauzeitenplan auf dem Handy: „Jetzt“ (was läuft, was beginnt in 14 Tagen, was hängt), „Ablauf“ (Woche für Woche) und
// „Gewerke“ (wer wann dran ist) – als Karten, die man auf der Baustelle mit dem Daumen liest. Der Balkenplan bleibt einen
// Wisch entfernt. Gerechnet wird nichts Eigenes: alles kommt aus derselben Terminrechnung (plan.ts).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Plan } from '../module/bauzeitenplan/plan';
import type { Druckzeile } from '../module/bauzeitenplan/druck';
import { isoAus, tagAus, wochentag } from '../module/bauzeitenplan/kalender';
import { firmaDesGewerks } from './gewerke';
import { projektId } from './projekt';

const TAG = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const kurz = (iso: string) => `${TAG[wochentag(tagAus(iso))]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export function PlanHandy(p: { plan: Plan; heute: string; onOeffnen: (id: string) => void; ansicht: 'jetzt' | 'ablauf' | 'gewerke' }) {
  const blaetter = createMemo(() => p.plan.zeilen.filter((z) => !z.termin.gruppe));
  const span = createMemo(() => {
    const l = blaetter();
    if (!l.length) return null;
    const a = l.reduce((m, z) => (z.termin.anfang < m ? z.termin.anfang : m), l[0]!.termin.anfang), e = p.plan.erg.endeDatum;
    const gesamt = l.reduce((s, z) => s + Math.max(1, z.dauer), 0), fertig = l.reduce((s, z) => s + Math.max(1, z.dauer) * Math.min(100, z.fortschritt) / 100, 0);
    return { a, e, t0: tagAus(a), t1: tagAus(e), rest: Math.max(0, tagAus(e) - tagAus(p.heute)), pct: Math.round((fertig / gesamt) * 100) };
  });
  const h = () => p.heute;
  const laeuft = createMemo(() => blaetter().filter((z) => z.termin.anfang <= h() && z.termin.ende >= h() && z.fortschritt < 100));
  const bald = createMemo(() => { const bis = isoAus(tagAus(h()) + 14); return blaetter().filter((z) => z.termin.anfang > h() && z.termin.anfang <= bis).sort((x, y) => (x.termin.anfang < y.termin.anfang ? -1 : 1)); });
  const haengt = createMemo(() => blaetter().filter((z) => z.termin.ende < h() && z.fortschritt < 100 && z.termin.f > z.termin.s));
  const wochen = createMemo(() => {
    const m = new Map<number, Druckzeile[]>();
    for (const z of [...blaetter()].sort((x, y) => (x.termin.anfang < y.termin.anfang ? -1 : 1))) { const t = tagAus(z.termin.anfang), mo = t - wochentag(t); (m.get(mo) ?? m.set(mo, []).get(mo)!).push(z); }
    return [...m.entries()];
  });
  const gewerke = createMemo(() => {
    const m = new Map<string, Druckzeile[]>();
    for (const z of blaetter()) (m.get(z.gewerk || 'ohne Gewerk') ?? m.set(z.gewerk || 'ohne Gewerk', []).get(z.gewerk || 'ohne Gewerk')!).push(z);
    return [...m.entries()].map(([g, l]) => ({ g, l: l.sort((x, y) => (x.termin.anfang < y.termin.anfang ? -1 : 1)), a: l.reduce((x, z) => (z.termin.anfang < x ? z.termin.anfang : x), '9999'), e: l.reduce((x, z) => (z.termin.ende > x ? z.termin.ende : x), '') })).sort((x, y) => (x.a < y.a ? -1 : 1));
  });
  const [offen, setOffen] = createSignal<string | null>(null);
  const Karte = (k: { z: Druckzeile; markiert?: boolean }) => {
    const s = span()!, breite = Math.max(1, s.t1 - s.t0 + 1);
    const x = (iso: string) => `${((tagAus(iso) - s.t0) / breite) * 100}%`;
    return (
      <button class="ph-karte" classList={{ jetzt: !!k.markiert, kritisch: k.z.termin.kritisch }} style={{ 'border-color': k.markiert ? undefined : k.z.farbe }} onClick={() => p.onOeffnen(k.z.id)}>
        <strong><i style={{ background: k.z.farbe }} />{k.z.name}</strong>
        <span class="still-text">{kurz(k.z.termin.anfang)}{k.z.termin.ende !== k.z.termin.anfang ? ` – ${kurz(k.z.termin.ende)}` : ''} · {k.z.termin.f === k.z.termin.s ? 'Meilenstein' : `${k.z.dauer} AT`}{k.z.gewerk ? ` · ${k.z.gewerk}` : ''}{k.z.unternehmer ? ` · ${k.z.unternehmer}` : ''}{k.z.fortschritt ? ` · ${k.z.fortschritt} %` : ''}</span>
        <span class="ph-leiste"><span class="ph-balken" style={{ left: x(k.z.termin.anfang), width: `max(4px, calc(${x(isoAus(tagAus(k.z.termin.ende) + 1))} - ${x(k.z.termin.anfang)}))`, background: k.z.farbe }} /><span class="ph-heute" style={{ left: x(h()) }} /></span>
      </button>
    );
  };
  return (
    <div class="ph">
      <Show when={span()} fallback={<p class="still-text">Noch keine Leistungen im Plan.</p>}>{(s) => (
        <>
          <p class="still-text ph-kopf">{kurz(s().a)} – {kurz(s().e)} · {s().rest ? `noch ${s().rest} Tage` : 'fertig geplant'} · {s().pct} % erledigt</p>
          <Show when={p.ansicht === 'jetzt'}>
            <Show when={haengt().length}><h3>Hängt hinterher <span class="anzahl">{haengt().length}</span></h3><For each={haengt()}>{(z) => <Karte z={z} markiert />}</For></Show>
            <h3>Läuft gerade <span class="anzahl">{laeuft().length}</span></h3>
            <For each={laeuft()} fallback={<p class="still-text">Heute läuft nichts.</p>}>{(z) => <Karte z={z} markiert />}</For>
            <h3>Beginnt in den nächsten 14 Tagen <span class="anzahl">{bald().length}</span></h3>
            <For each={bald()} fallback={<p class="still-text">In den nächsten zwei Wochen beginnt nichts Neues.</p>}>{(z) => <Karte z={z} />}</For>
          </Show>
          <Show when={p.ansicht === 'ablauf'}>
            <For each={wochen()}>{([mo, l]) => <><h3>KW {kw(mo)} · ab {kurz(isoAus(mo))}</h3><For each={l}>{(z) => <Karte z={z} markiert={z.termin.anfang <= h() && z.termin.ende >= h()} />}</For></>}</For>
          </Show>
          <Show when={p.ansicht === 'gewerke'}>
            <For each={gewerke()}>{(g) => (
              <div class="ph-gewerk">
                <button class="ph-gewerk-kopf" classList={{ vorbei: g.e < h(), laeuft: g.a <= h() && g.e >= h() }} onClick={() => setOffen(offen() === g.g ? null : g.g)} aria-expanded={offen() === g.g}>
                  <strong><i style={{ background: g.l[0]!.farbe }} />{g.g}</strong><span class="still-text">{kurz(g.a)} – {kurz(g.e)} · {g.l.length} {g.l.length === 1 ? 'Leistung' : 'Leistungen'}</span>
                  <Show when={g.a <= h() && g.e >= h()}><b class="ph-baustelle">auf der Baustelle</b></Show>
                </button>
                {/* wie im bisherigen Bauportal: die Firma des Gewerks mit Anrufen und E-Mail (aus „Gewerke & Firmen“) */}
                <Show when={projektId() && g.g !== 'ohne Gewerk' ? firmaDesGewerks(projektId()!, g.g) : undefined} fallback={<Show when={g.g !== 'ohne Gewerk'}><p class="ph-firma still-text">keine Firma eingetragen</p></Show>}>{(f) => { const w = () => f().werte, tel = () => String(w().mobil || w().telefon || ''); return (
                  <p class="ph-firma"><span>{String(w().name ?? '')}{w().ansprechpartner ? ` · ${String(w().ansprechpartner)}` : ''}</span>
                    <Show when={tel()}><a href={`tel:${tel().replace(/[^\d+]/g, '')}`} aria-label={`${String(w().name)} anrufen`}>☎</a></Show>
                    <Show when={w().email}><a href={`mailto:${String(w().email)}`} aria-label={`${String(w().name)} E-Mail`}>✉</a></Show></p>); }}</Show>
                <Show when={offen() === g.g}><For each={g.l}>{(z) => <Karte z={z} markiert={z.termin.anfang <= h() && z.termin.ende >= h()} />}</For></Show>
              </div>
            )}</For>
          </Show>
        </>
      )}</Show>
    </div>
  );
}

function kw(t: number): number {
  const d = t + 3 - wochentag(t);
  return 1 + Math.floor((d - tagAus(`${isoAus(d).slice(0, 4)}-01-01`)) / 7);
}
