// Bauzeitenplan auf dem Handy – wie im bisherigen Bauportal (nur ansehen): oben die Version, Zeitraum, wie lange noch,
// wie viel erledigt; darunter „Jetzt“ (läuft gerade, beginnt in 14 Tagen, danach, erledigt), „Ablauf“ (nach den Gruppen des
// Plans) und „Gewerke“ (wer wann dran ist, Firma mit Anrufen und E-Mail). Bearbeitet wird am Computer – „Desktop-Ansicht“
// schaltet am Handy auf den Balkenplan um. Gerechnet wird nichts Eigenes: alles kommt aus derselben Terminrechnung (plan.ts).
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Plan } from '../module/bauzeitenplan/plan';
import type { Druckzeile } from '../module/bauzeitenplan/druck';
import { isoAus, tagAus, wochentag } from '../module/bauzeitenplan/kalender';
import { Auswahlliste } from './baukasten/auswahlliste';
import { karteOeffnen } from './kartendialog';
import { firmaDesGewerks } from './gewerke';
import { aktuelleVersion, planDerVersion, planVersionen } from './plandaten';
import { projektId, waehleVersion } from './projekt';
import { holen, merken } from './unterbau/speicher';
import { modell } from './unterbau/api';
import { desktopWaehlen } from './unterbau/geraet';

const TAG = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const kurz = (iso: string) => `${TAG[wochentag(tagAus(iso))]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const mitJahr = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
type Modus = 'jetzt' | 'ablauf' | 'gewerke';

/** Die ganze Handyansicht der App (ansichten.tsx, HANDY_APPS): Version wählen, umschalten, Karten. */
export function BauzeitenplanHandy(): JSX.Element {
  const versionen = createMemo(() => (projektId() ? planVersionen(projektId()!) : []));
  const version = () => (projektId() ? aktuelleVersion(projektId()!) : undefined);
  const [modus, setModus] = createSignal<Modus>(holen('bzp.handy', 'jetzt') as Modus);
  const wechseln = (m: Modus) => { setModus(m); merken('bzp.handy', m); scrollTo(0, 0); };
  return (
    <div class="mv">
      <Show when={projektId()} fallback={<p class="still-text">Bitte oben ein Projekt wählen.</p>}>
        <Show when={version()} fallback={<p class="still-text">Noch kein Bauzeitenplan in diesem Projekt.</p>}>{(v) => (
          <PlanHandy plan={planDerVersion(v().id)} heute={new Date().toLocaleDateString('sv')} ansicht={modus()} onModus={wechseln} onOeffnen={(id) => karteOeffnen({ objekt: 'vorgang', id, titel: String(modell('vorgang').titel) })}
            version={<Auswahlliste titel="Version" wert={v().id} optionen={versionen().map((x) => ({ wert: x.id, titel: `${String(x.werte.name ?? '')}${x.werte.gueltig ? ' ★' : ''}` }))}
              onWert={(id) => waehleVersion(projektId()!, 'bauzeitenplan', id)} />} />
        )}</Show>
      </Show>
    </div>
  );
}

export function PlanHandy(p: { plan: Plan; heute: string; onOeffnen: (id: string) => void; ansicht: Modus; onModus: (m: Modus) => void; version: JSX.Element }) {
  const blaetter = createMemo(() => p.plan.zeilen.filter((z) => !z.termin.gruppe));
  const h = () => p.heute;
  const span = createMemo(() => {
    const l = blaetter();
    if (!l.length) return null;
    const a = l.reduce((m, z) => (z.termin.anfang < m ? z.termin.anfang : m), l[0]!.termin.anfang), e = p.plan.erg.endeDatum;
    // erledigt wie bisher: Mittel der Leistungen
    return { a, e, t0: tagAus(a), t1: tagAus(e), pct: Math.round(l.reduce((s, z) => s + Math.min(100, z.fortschritt), 0) / l.length) };
  });
  const lage = () => { const s = span()!, t = tagAus(h()); return t > s.t1 ? 'abgeschlossen' : t < s.t0 ? `Beginn in ${s.t0 - t} Tagen` : `noch ${s.t1 - t} Tage`; };
  const fertig = (z: Druckzeile) => z.fortschritt >= 100;
  const bis14 = () => isoAus(tagAus(h()) + 14);
  const nachAnfang = (l: Druckzeile[]) => [...l].sort((x, y) => (x.termin.anfang < y.termin.anfang ? -1 : 1));
  // Jetzt wie bisher – dazu oben, was hinterherhängt (vorbei, aber nicht fertig)
  const haengt = createMemo(() => blaetter().filter((z) => z.termin.ende < h() && !fertig(z) && z.termin.f > z.termin.s));
  const laeuft = createMemo(() => blaetter().filter((z) => z.termin.anfang <= h() && z.termin.ende >= h() && !fertig(z)));
  const bald = createMemo(() => nachAnfang(blaetter().filter((z) => z.termin.anfang > h() && z.termin.anfang <= bis14())));
  const danach = createMemo(() => nachAnfang(blaetter().filter((z) => z.termin.anfang > bis14())));
  const vorbei = createMemo(() => blaetter().filter((z) => z.termin.ende < h() || (fertig(z) && z.termin.anfang <= h())).sort((x, y) => (x.termin.ende > y.termin.ende ? -1 : 1)));
  const [auf, setAuf] = createSignal<Set<string>>(new Set());
  const klapp = (n: string) => { const s = new Set(auf()); if (s.has(n)) s.delete(n); else s.add(n); setAuf(s); };
  // Ablauf wie bisher: nach den Gruppen des Plans (oberste Ebene als Abschnitt, tiefere als Zwischenzeile)
  const ablauf = createMemo(() => p.plan.zeilen);
  const gewerke = createMemo(() => {
    const m = new Map<string, Druckzeile[]>();
    for (const z of blaetter()) if (z.gewerk) (m.get(z.gewerk) ?? m.set(z.gewerk, []).get(z.gewerk)!).push(z);
    return [...m.entries()].map(([g, l]) => ({ g, l: nachAnfang(l), a: l.reduce((x, z) => (z.termin.anfang < x ? z.termin.anfang : x), '9999'), e: l.reduce((x, z) => (z.termin.ende > x ? z.termin.ende : x), '') })).sort((x, y) => (x.a < y.a ? -1 : 1));
  });
  const [offen, setOffen] = createSignal<string | null>(null);
  const Firma = (f: { gewerk: string }) => (
    <Show when={projektId() && f.gewerk ? firmaDesGewerks(projektId()!, f.gewerk) : undefined}>{(k) => { const w = () => k().werte, tel = () => String(w().mobil || w().telefon || ''); return (
      <span class="ph-firma" onClick={(e) => e.stopPropagation()}><span>{String(w().name ?? '')}{w().ansprechpartner ? ` · ${String(w().ansprechpartner)}` : ''}</span>
        <Show when={tel()}><a href={`tel:${tel().replace(/[^\d+]/g, '')}`} aria-label={`${String(w().name)} anrufen`}>☎</a></Show>
        <Show when={w().email}><a href={`mailto:${String(w().email)}`} aria-label={`${String(w().name)} E-Mail`}>✉</a></Show></span>); }}</Show>
  );
  const Karte = (k: { z: Druckzeile }) => {
    const s = span()!, breite = Math.max(1, s.t1 - s.t0 + 1);
    const x = (iso: string) => `${((tagAus(iso) - s.t0) / breite) * 100}%`;
    const ms = k.z.termin.f === k.z.termin.s;
    const zustand = () => (k.z.termin.ende < h() || fertig(k.z) ? 'vorbei' : k.z.termin.anfang <= h() ? 'jetzt' : 'kommt');
    return (
      <button class="ph-karte" classList={{ [zustand()]: true, kritisch: k.z.termin.kritisch }} style={{ 'border-color': zustand() === 'jetzt' ? undefined : k.z.farbe }} onClick={() => p.onOeffnen(k.z.id)}>
        <strong><i style={{ background: k.z.farbe }} />{k.z.name}<Show when={ms}><small class="ph-marke">Meilenstein</small></Show></strong>
        <span class="still-text">{ms ? kurz(k.z.termin.anfang) : `${kurz(k.z.termin.anfang)} – ${kurz(k.z.termin.ende)} · ${k.z.dauer} AT`}{k.z.gewerk ? ` · ${k.z.gewerk}` : ''}</span>
        <Firma gewerk={k.z.gewerk} />
        <Show when={!ms}><span class="ph-leiste"><span class="ph-balken" style={{ left: x(k.z.termin.anfang), width: `max(4px, calc(${x(isoAus(tagAus(k.z.termin.ende) + 1))} - ${x(k.z.termin.anfang)}))`, background: k.z.farbe }}>
          <span class="ph-fertig" style={{ width: `${Math.min(100, k.z.fortschritt)}%` }} /></span><span class="ph-heute" style={{ left: x(h()) }} /></span></Show>
        <Show when={k.z.fortschritt && !ms}><span class="still-text klein-text">{Math.min(100, k.z.fortschritt)} % erledigt</span></Show>
      </button>
    );
  };
  const Abschnitt = (a: { titel: string; liste: Druckzeile[]; zu?: boolean; leer?: string }) => (
    <Show when={a.liste.length || !a.zu}>
      <h3 classList={{ klappbar: !!a.zu }} onClick={() => a.zu && klapp(a.titel)}>{a.titel} <span class="anzahl">{a.liste.length}</span>
        <Show when={a.zu}><small class="still-text ph-klapp">{auf().has(a.titel) ? 'ausblenden' : 'zeigen'}</small></Show></h3>
      <Show when={!a.zu || auf().has(a.titel)}><For each={a.liste} fallback={<p class="still-text">{a.leer ?? 'Nichts.'}</p>}>{(z) => <Karte z={z} />}</For></Show>
    </Show>
  );
  return (
    <div class="ph">
      <div class="mv-oben">
        {p.version}
        <Show when={span()}>{(s) => <p class="still-text ph-kopf"><span>{mitJahr(s().a)} – {mitJahr(s().e)}</span><span>{lage()}</span><span>{s().pct} % erledigt</span></p>}</Show>
        <div class="ph-umschalter" role="tablist">
          <For each={[['jetzt', 'Jetzt'], ['ablauf', 'Ablauf'], ['gewerke', 'Gewerke']] as const}>{([k, t]) =>
            <button role="tab" aria-selected={p.ansicht === k} classList={{ an: p.ansicht === k }} onClick={() => p.onModus(k)}>{t}</button>}</For>
        </div>
      </div>
      <Show when={span()} fallback={<p class="still-text">Noch keine Leistungen im Plan.</p>}>
        <Show when={p.ansicht === 'jetzt'}>
          <Show when={haengt().length}><Abschnitt titel="Hängt hinterher" liste={haengt()} /></Show>
          <Abschnitt titel="Läuft gerade" liste={laeuft()} leer="Heute läuft nichts." />
          <Abschnitt titel="Beginnt in den nächsten 14 Tagen" liste={bald()} leer="In den nächsten zwei Wochen beginnt nichts Neues." />
          <Abschnitt titel="Danach" liste={danach()} zu />
          <Abschnitt titel="Erledigt / vorbei" liste={vorbei()} zu />
        </Show>
        <Show when={p.ansicht === 'ablauf'}>
          <For each={ablauf()}>{(z) => (z.termin.gruppe
            ? (z.ebene === 0 ? <h3>{z.name} <small class="still-text">{mitJahr(z.termin.anfang)} – {mitJahr(z.termin.ende)}</small></h3> : <p class="still-text ph-unter">{z.name}</p>)
            : <Karte z={z} />)}</For>
        </Show>
        <Show when={p.ansicht === 'gewerke'}>
          <For each={gewerke()} fallback={<p class="still-text">Im Plan sind keine Gewerke eingetragen.</p>}>{(g) => (
            <div class="ph-gewerk">
              <button class="ph-gewerk-kopf" classList={{ vorbei: g.e < h(), laeuft: g.a <= h() && g.e >= h() }} onClick={() => setOffen(offen() === g.g ? null : g.g)} aria-expanded={offen() === g.g}>
                <strong><i style={{ background: g.l[0]!.farbe }} />{g.g}<small class="ph-marke">{g.l.length} {g.l.length === 1 ? 'Leistung' : 'Leistungen'}</small></strong>
                <span class="still-text">{kurz(g.a)} – {kurz(g.e)}<Show when={g.a <= h() && g.e >= h()}> · <b class="ph-baustelle">auf der Baustelle</b></Show></span>
                <Show when={projektId() && firmaDesGewerks(projektId()!, g.g)} fallback={<span class="ph-firma still-text">keine Firma eingetragen</span>}><Firma gewerk={g.g} /></Show>
              </button>
              <Show when={offen() === g.g}><For each={g.l}>{(z) => <Karte z={z} />}</For></Show>
            </div>
          )}</For>
        </Show>
      </Show>
      <p class="mv-fuss still-text">Nur Ansicht – bearbeiten am Computer. <button type="button" class="knopf klein" onClick={() => desktopWaehlen('bauzeitenplan', true)}>Desktop-Ansicht</button></p>
    </div>
  );
}
