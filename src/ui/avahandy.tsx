// Ausschreibung & Abrechnung auf dem Handy (wie im bisherigen Bauportal: übersichtlich, nur ansehen – bearbeitet wird am Computer).
// Oben Suche und LV-Wahl, darunter vier Bereiche: LVs (Tippen öffnet die Positionen mit Titelsummen, Tippen auf eine Position den
// Langtext), Aufträge (Summen und Balken Leistung/abgerechnet), Aufmaß je Position und Rechnungen. Gerechnet wird nichts Eigenes:
// die Zahlen kommen aus denselben Bausteinen wie am Computer (lvZahlen, Aufmaß, Rechenleiter).
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { geprueft as istGeprueft, rechnungTitel, standAus, zeilenBis } from '../module/ava/aufmass';
import { NACHTRAGSSTAENDE } from '../module/ava/beipackzettel';
import { bedingungenAus, gp, leiter, nachOz, zaehlt, zahl } from '../module/ava/rechnung';
import { angeboteVon, epVon, lvZahlen, name } from './ava';
import { gewaehltesLv, lvFolge, setAktivesLv } from './avakopf';
import { Auswahlliste } from './baukasten/auswahlliste';
import { projektId } from './projekt';
import { leistungJetzt, rechnungenVon } from './rechnungpruefen';
import { lebende, sicht } from './unterbau/abgleich';

const eur0 = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const zt = (n: unknown) => (n == null || n === '' ? '' : zahl(n).toLocaleString('de-DE', { maximumFractionDigits: 3 }));
const pct = (a: number, b: number) => (b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0);
const lvName = (l: Zeile) => [l.werte.nummer, l.werte.name].filter(Boolean).join(' · ');
const NT: Record<string, string> = Object.fromEntries(NACHTRAGSSTAENDE.map((x) => [x.wert, x.titel]));

type Bereich = 'lvs' | 'auftraege' | 'aufmass' | 'rechnungen';
const [bereich, setBereich] = createSignal<Bereich>('lvs');
const [lvOffen, setLvOffen] = createSignal(false);   // in „LVs“/„Aufträge“: die Positionen des gewählten LV

export function AvaHandy(): JSX.Element {
  const lvs = createMemo(() => lebende('lv').filter((l) => l.werte.projekt === projektId() && !l.werte.archiviert).sort(lvFolge));
  const lv = () => gewaehltesLv();
  const [suche, setSuche] = createSignal('');
  const [lang, setLang] = createSignal<string | null>(null);
  const [zu, setZu] = createSignal(new Set<string>());
  const oeffne = (id: string, pos?: string) => { setAktivesLv(id); setLvOffen(true); setLang(pos ?? null); setSuche(''); scrollTo(0, 0);
    if (pos) setTimeout(() => document.querySelector(`[data-mp="${CSS.escape(pos)}"]`)?.scrollIntoView({ block: 'center' }), 60); };
  const treffer = createMemo(() => {
    const w = suche().trim().toLowerCase().split(/\s+/).filter(Boolean); if (!w.length || suche().trim().length < 2) return [];
    const ids = new Set(lvs().map((l) => l.id)), passt = (t: string) => w.every((x) => t.toLowerCase().includes(x));
    const pos = lebende('lv_position').filter((q) => ids.has(String(q.werte.lv)) && passt(`${q.werte.oz ?? ''} ${q.werte.kurztext ?? ''} ${q.werte.langtext ?? ''}`)).slice(0, 60);
    const re = lebende('rechnung').filter((r) => ids.has(String(r.werte.lv)) && passt(`${r.werte.nummer ?? ''} ${name(r.werte.firma)}`)).slice(0, 20);
    return [...pos.map((q) => ({ art: 'pos' as const, z: q })), ...re.map((r) => ({ art: 're' as const, z: r }))];
  });
  return (
    <div class="mv">
      <div class="mv-oben">
        <input type="search" class="mv-suche" placeholder="🔍 Suchen – Text, OZ, Firma …" value={suche()} onInput={(e) => setSuche(e.currentTarget.value)} enterkeyhint="search" aria-label="Suchen" />
        <Show when={lvs().length}><Auswahlliste titel="Leistungsverzeichnis" wert={lv()?.id ?? null} optionen={lvs().map((l) => ({ wert: l.id, titel: lvName(l) }))} onWert={(id) => oeffne(id)} /></Show>
        <div class="ph-umschalter" role="tablist">
          <For each={[['lvs', 'LVs'], ['auftraege', 'Aufträge'], ['aufmass', 'Aufmaß'], ['rechnungen', 'Rechnungen']] as const}>{([k, t]) =>
            <button role="tab" aria-selected={bereich() === k} classList={{ an: bereich() === k }} onClick={() => { setBereich(k); setLvOffen(false); setSuche(''); }}>{t}</button>}</For>
        </div>
      </div>
      <Show when={!treffer().length && suche().trim().length < 2} fallback={
        <div class="mv-liste"><For each={treffer()} fallback={<p class="still-text">Nichts gefunden zu „{suche()}“.</p>}>{(t) => {
          const l = sicht.lv?.[String(t.z.werte.lv)];
          return t.art === 'pos'
            ? <button type="button" class="mv-karte" onClick={() => { setBereich('lvs'); oeffne(String(t.z.werte.lv), t.z.id); }}><small>{l ? lvName(l) : ''}</small><b>{String(t.z.werte.oz ?? '')} {String(t.z.werte.kurztext ?? '')}</b></button>
            : <button type="button" class="mv-karte" onClick={() => { setAktivesLv(String(t.z.werte.lv)); setBereich('rechnungen'); setSuche(''); }}><small>{l ? lvName(l) : ''} · Rechnung</small><b>{String(t.z.werte.nummer ?? '')} · {name(t.z.werte.firma)}</b></button>;
        }}</For></div>}>
        <Show when={lvOffen() && lv()} fallback={
          <>
            <Show when={bereich() === 'lvs'}><Lvs lvs={lvs()} oeffne={oeffne} /></Show>
            <Show when={bereich() === 'auftraege'}><Auftraege lvs={lvs()} oeffne={oeffne} /></Show>
            <Show when={bereich() === 'aufmass'}><Aufmass lv={lv()} lang={lang()} setLang={setLang} /></Show>
            <Show when={bereich() === 'rechnungen'}><Rechnungen lvs={lvs()} /></Show>
          </>}>
          <button type="button" class="mv-zurueck" onClick={() => setLvOffen(false)}>‹ {bereich() === 'auftraege' ? 'Aufträge' : 'alle LVs'}</button>
          <LvPositionen lv={lv()!} lang={lang()} setLang={setLang} zu={zu()} setZu={setZu} />
        </Show>
      </Show>
      <p class="mv-fuss still-text">Nur Ansicht – bearbeitet wird am Computer.</p>
    </div>
  );
}

function Kennzahlen(p: { werte: [string, string, string?][] }): JSX.Element {
  return <div class="mv-kz"><For each={p.werte}>{([t, w, u]) => <div><small>{t}</small><b>{w}</b><Show when={u}><span>{u}</span></Show></div>}</For></div>;
}
const Balken = (p: { leistung: number; abgerechnet: number; von: number }) => (
  <div class="mv-balken" title="Leistungsstand · abgerechnet"><u style={{ width: `${pct(p.leistung, p.von)}%` }} /><i style={{ width: `${pct(p.abgerechnet, p.von)}%` }} /></div>);

function Lvs(p: { lvs: Zeile[]; oeffne: (id: string) => void }): JSX.Element {
  return (
    <div class="mv-liste"><For each={p.lvs} fallback={<p class="still-text">In diesem Projekt gibt es noch kein Leistungsverzeichnis.</p>}>{(l) => {
      const z = lvZahlen(l.id), n = lebende('lv_position').filter((q) => q.werte.lv === l.id && q.werte.art !== 'titel' && q.werte.art !== 'hinweis' && !q.werte.nachtrag).length, ang = angeboteVon(l.id).length;
      return (
        <button type="button" class="mv-karte" classList={{ gut: !!z.auftrag, warn: !z.auftrag && ang > 0 }} onClick={() => p.oeffne(l.id)}>
          <span class="mv-kopf"><b>{lvName(l)}</b><span class="pille" classList={{ gut: !!z.auftrag }}>{z.auftrag ? 'vergeben' : ang ? `${ang} Angebot${ang === 1 ? '' : 'e'}` : 'in Ausschreibung'}</span></span>
          <small>{[l.werte.gewerk, z.auftrag ? name(z.auftrag.werte.bieter) : ''].filter(Boolean).join(' · ')}</small>
          <span class="mv-zeile"><span>{n} Positionen</span>{z.auftrag ? eur0(z.stand.aktuell) : z.schaetzung ? `Schätzung ${eur0(z.schaetzung)}` : ''}</span>
        </button>);
    }}</For></div>
  );
}

function Auftraege(p: { lvs: Zeile[]; oeffne: (id: string) => void }): JSX.Element {
  const A = createMemo(() => p.lvs.map((l) => ({ l, z: lvZahlen(l.id) })).filter((x) => x.z.auftrag));
  const S = createMemo(() => A().reduce((s, { z }) => ({ a: s.a + z.haupt, n: s.n + z.stand.beauftragt, p: s.p + z.stand.prognose, ab: s.ab + z.abgerechnet }), { a: 0, n: 0, p: 0, ab: 0 }));
  return (
    <Show when={A().length} fallback={<p class="still-text mv-leer">In diesem Projekt ist noch nichts vergeben.</p>}>
      <Kennzahlen werte={[['Aufträge', eur0(S().a)], ['Nachträge beauftragt', eur0(S().n)], ['Prognose', eur0(S().p)], ['abgerechnet', eur0(S().ab), `${pct(S().ab, S().a + S().n)} %`]]} />
      <div class="mv-liste"><For each={A()}>{({ l, z }) => (
        <button type="button" class="mv-karte gut" onClick={() => p.oeffne(l.id)}>
          <span class="mv-kopf"><b>{lvName(l)}</b></span><small>{name(z.auftrag!.werte.bieter)}</small>
          <span class="mv-zeile"><span>Auftrag</span>{eur0(z.haupt)}</span>
          <Show when={z.stand.beauftragt || z.stand.offen}><span class="mv-zeile"><span>Nachträge</span>{eur0(z.stand.beauftragt)}<Show when={z.stand.offen}><small class="mv-offen"> + {eur0(z.stand.offen)} offen</small></Show></span></Show>
          <span class="mv-zeile"><span>Leistungsstand · abgerechnet</span>{eur0(z.leistung)} · {eur0(z.abgerechnet)}</span>
          <Balken leistung={z.leistung} abgerechnet={z.abgerechnet} von={z.stand.aktuell} />
        </button>)}</For></div>
    </Show>
  );
}

/** Positionen eines LV: Titel mit Summen (zuklappbar), Positionen mit Menge × EP; Tippen zeigt den Langtext. */
function LvPositionen(p: { lv: Zeile; lang: string | null; setLang: (id: string | null) => void; zu: Set<string>; setZu: (s: Set<string>) => void }): JSX.Element {
  const z = createMemo(() => lvZahlen(p.lv.id));
  const ep = createMemo(() => { const e = epVon(p.lv.id); return z().auftrag ? (q: Zeile) => e(q) : (q: Zeile) => (q.werte.ep != null && q.werte.ep !== '' ? zahl(q.werte.ep) : null); });
  const alle = createMemo(() => nachOz(lebende('lv_position').filter((q) => q.werte.lv === p.lv.id)));
  const nt = (q: Zeile) => (q.werte.nachtrag ? sicht.nachtrag?.[String(q.werte.nachtrag)] : undefined);
  const unter = (t: Zeile) => { const k = `${String(t.werte.oz ?? '')}.`; return alle().filter((q) => String(q.werte.oz ?? '').startsWith(k)); };
  const versteckt = (q: Zeile) => [...p.zu].some((id) => { const t = sicht.lv_position?.[id]; return !!t && t.id !== q.id && String(q.werte.oz ?? '').startsWith(`${String(t.werte.oz ?? '')}.`); });
  const summe = (L: Zeile[]) => L.filter(zaehlt).reduce((s, q) => s + gp(q.werte.menge, ep()(q) ?? 0), 0);
  const klappe = (id: string) => { const s = new Set(p.zu); if (s.has(id)) s.delete(id); else s.add(id); p.setZu(s); };
  return (
    <div class="mv-lv">
      <Kennzahlen werte={[[z().auftrag ? 'Auftrag' : 'Schätzung', eur0(z().auftrag ? z().haupt : z().schaetzung), z().auftrag ? name(z().auftrag!.werte.bieter) : undefined],
        ['Nachträge beauftragt', eur0(z().stand.beauftragt), z().stand.offen ? `${eur0(z().stand.offen)} offen` : undefined],
        ['Leistungsstand', eur0(z().leistung), `${pct(z().leistung, z().stand.aktuell)} %`], ['abgerechnet', eur0(z().abgerechnet)]]} />
      <h2 class="mv-titel">{lvName(p.lv)}</h2>
      <For each={alle()}>{(q) => (
        <Show when={!versteckt(q)}>
          <Show when={q.werte.art === 'titel'} fallback={
            <div class="mv-pos" classList={{ still: !zaehlt(q) && q.werte.art !== 'hinweis', hinweis: q.werte.art === 'hinweis' }} data-mp={q.id} onClick={() => p.setLang(p.lang === q.id ? null : q.id)}>
              <small>{String(q.werte.oz ?? '')}<Show when={nt(q)}> · <b class="mv-nt">{String(nt(q)!.werte.nummer ?? '')} {NT[String(nt(q)!.werte.stand ?? '')] ?? ''}</b></Show>{!zaehlt(q) && q.werte.art !== 'hinweis' ? ' · ohne GB' : ''}</small>
              <span class="mv-text">{String(q.werte.kurztext ?? '')}</span>
              <Show when={q.werte.art !== 'hinweis'}><span class="mv-zeile"><span>{zt(q.werte.menge)} {String(q.werte.einheit ?? '')}{ep()(q) != null ? ` × ${eur(ep()(q)!)}` : ''}</span><b>{ep()(q) != null && zaehlt(q) ? eur(gp(q.werte.menge, ep()(q))) : ''}</b></span></Show>
              <Show when={p.lang === q.id && q.werte.langtext}><p class="mv-lang">{String(q.werte.langtext)}</p></Show>
            </div>}>
            <h3 class="mv-gliederung" style={{ 'padding-left': `${(String(q.werte.oz ?? '').split('.').length - 1) * 12}px` }} onClick={() => klappe(q.id)}>
              <span class="klappe" classList={{ zu: p.zu.has(q.id) }} aria-hidden="true" />{String(q.werte.oz ?? '')} {String(q.werte.kurztext ?? '')}<span class="mv-summe">{(() => { const s = summe(unter(q)); return s ? eur0(s) : ''; })()}</span></h3>
          </Show>
        </Show>)}</For>
      <p class="mv-zeile mv-gesamt"><span>Summe netto</span><b>{eur(summe(alle()))}</b></p>
    </div>
  );
}

function Aufmass(p: { lv: Zeile | undefined; lang: string | null; setLang: (id: string | null) => void }): JSX.Element {
  const d = createMemo(() => {
    if (!p.lv) return null;
    const R = rechnungenVon(p.lv.id), stand = standAus(zeilenBis(lebende('aufmass').filter((a) => a.werte.lv === p.lv!.id), R, null));
    const P = nachOz(lebende('lv_position').filter((q) => q.werte.lv === p.lv!.id && q.werte.art !== 'titel' && q.werte.art !== 'hinweis'));
    return { P, stand, mit: P.filter((q) => stand.get(q.id)).length, z: lvZahlen(p.lv.id) };
  });
  return (
    <Show when={d()} fallback={<p class="still-text mv-leer">Kein LV gewählt.</p>}>{(x) => (<>
      <Kennzahlen werte={[['Positionen mit Aufmaß', String(x().mit), `von ${x().P.length}`], ['Leistungsstand', eur0(x().z.leistung)]]} />
      <h2 class="mv-titel">{lvName(p.lv!)}</h2>
      <For each={x().P}>{(q) => { const m = () => x().stand.get(q.id) ?? 0, v = () => (zahl(q.werte.menge) ? Math.round(m() / zahl(q.werte.menge) * 100) : null);
        return (
          <div class="mv-pos" classList={{ still: !m() }} data-mp={q.id} onClick={() => p.setLang(p.lang === q.id ? null : q.id)}>
            <small>{String(q.werte.oz ?? '')}</small><span class="mv-text">{String(q.werte.kurztext ?? '')}</span>
            <span class="mv-zeile"><span>LV {zt(q.werte.menge)} {String(q.werte.einheit ?? '')} · aufgemessen <b>{zt(m())}</b></span><b classList={{ 'mv-ueber': (v() ?? 0) > 110 }}>{v() != null ? `${v()} %` : ''}</b></span>
            <Show when={zahl(q.werte.menge)}><div class="mv-balken"><i style={{ width: `${Math.min(100, v() ?? 0)}%` }} /></div></Show>
            <Show when={p.lang === q.id && q.werte.langtext}><p class="mv-lang">{String(q.werte.langtext)}</p></Show>
          </div>);
      }}</For>
    </>)}</Show>
  );
}

function Rechnungen(p: { lvs: Zeile[] }): JSX.Element {
  const A = createMemo(() => p.lvs.map((l) => ({ l, R: rechnungenVon(l.id) })).filter((x) => x.R.length));
  const zahlbetrag = (r: Zeile) => {
    const lvId = String(r.werte.lv ?? ''), b = bedingungenAus(sicht.lv?.[lvId]?.werte, angeboteVon(lvId).find((a) => a.werte.beauftragt === true)?.werte);
    const L = leiter(rechnungenVon(lvId), r.id, b, (x) => leistungJetzt(x));
    return { netto: L.find((z) => z.titel.startsWith('Zahlbetrag netto') && z.summe)?.betrag ?? 0, brutto: L.find((z) => z.titel === 'Zahlbetrag')?.betrag ?? 0 };
  };
  return (
    <Show when={A().length} fallback={<p class="still-text mv-leer">Noch keine Rechnungen in diesem Projekt.</p>}>
      <For each={A()}>{({ l, R }) => (<>
        <div class="mv-gruppe">{lvName(l)}</div>
        <For each={[...R].reverse()}>{(r) => { const g = istGeprueft(r), zb = zahlbetrag(r); return (
          <div class="mv-karte" classList={{ gut: g, warn: !g }}>
            <span class="mv-kopf"><b>{rechnungTitel(r, R)}</b><span class="pille" classList={{ gut: g }}>{g ? 'geprüft' : 'in Prüfung'}</span></span>
            <small>{[r.werte.nummer ? `Nr. ${String(r.werte.nummer)}` : '', name(r.werte.firma), r.werte.eingang ? `Eingang ${String(r.werte.eingang).split('-').reverse().join('.')}` : ''].filter(Boolean).join(' · ')}</small>
            <Show when={zahl(r.werte.betrag)}><span class="mv-zeile"><span>gefordert</span>{eur(zahl(r.werte.betrag))}</span></Show>
            <span class="mv-zeile"><span>Leistungsstand {g ? 'geprüft' : '(Prüfung)'}</span>{eur(g ? zahl(r.werte.geprueft) : leistungJetzt(r))}</span>
            <span class="mv-zeile"><span>Zahlbetrag netto · brutto</span><b>{eur(zb.netto)} · {eur(zb.brutto)}</b></span>
          </div>); }}</For>
      </>)}</For>
    </Show>
  );
}
