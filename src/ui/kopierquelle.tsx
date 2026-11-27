// Kopierquelle (wie im bisherigen Bauportal): rechts neben dem LV ein anderes LV (dieses oder ein anderes Projekt) oder die
// Positionsdatenbank – nur lesen. Zeilen anhaken (ein Titel bringt alles darunter mit) und „← Übernehmen“: sie kommen unter die
// markierte Zeile des LV (ohne Markierung ans Ende der Ebene, in der zuletzt gearbeitet wurde). Mengen und Preise wahlweise.
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { lvZeilen } from '../module/ava/lvbaum';
import { ablageAus, ablageAusKatalog, type Ablage } from '../module/ava/kopierquelle';
import { istText } from '../kern/lvarten';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Kartenrahmen } from './baukasten/kartenrahmen';
import { Klappe, Ordner } from './baukasten/baum';
import { lvFolge } from './avakopf';
import { lebende, sicht } from './unterbau/abgleich';
import { hinweis } from './unterbau/meldungen';
import { zeilenZiehen } from './baukasten/zeilenzug';

/** Ist die Kopierquelle rechts offen? (Knopf „Kopierquelle“ in der Menüleiste, × schließt) */
export const [kopierquelleOffen, setKopierquelleOffen] = createSignal(false);
/** Wohin gezogene Zeilen fallen: „LV bearbeiten“ meldet sich hier an (Einfügelinie unter der Maus, Einfügen an der Stelle). */
export interface LvZielfeld { ziel: (ev: PointerEvent) => { nach: string | null; y: number } | null; zug: (z: { nach: string | null; y: number } | null) => void; ablegen: (a: Ablage, nach: string | null) => void; rollen: () => HTMLElement }
export const [lvZielfeld, setLvZielfeld] = createSignal<LvZielfeld | null>(null);
/** Auftrag an „LV bearbeiten“: diese Zeilen einfügen (dort entscheidet die Markierung, wohin). */
export const [lvAblage, setLvAblage] = createSignal<Ablage | null>(null);

const KATALOG = 'katalog:position';
const MERKER = 'bp.kopierquelle';
const merken = (w: Record<string, unknown>) => { try { localStorage.setItem(MERKER, JSON.stringify({ ...gemerkt(), ...w })); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
const gemerkt = (): { quelle?: string; lv?: string; mengen?: boolean; preise?: boolean } => { try { return JSON.parse(localStorage.getItem(MERKER) ?? '{}') as never; } catch { return {}; } };
const geld = (n: unknown) => (n == null || n === '' ? '' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function Kopierquelle(p: { ziel: Zeile; heftzwecke?: JSX.Element }): JSX.Element {
  const g = gemerkt();
  const projekte = () => lebende('projekt').sort((a, b) => Number(b.id === p.ziel.werte.projekt) - Number(a.id === p.ziel.werte.projekt) || String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true }));
  const [quelle, setQuelle] = createSignal<string>(g.quelle && (g.quelle === KATALOG || sicht.projekt?.[g.quelle]) ? g.quelle : String(p.ziel.werte.projekt ?? ''));
  const lvs = () => lebende('lv').filter((l) => l.werte.projekt === quelle() && l.id !== p.ziel.id && !l.werte.ohne_lv).sort(lvFolge);
  const [lvWahl, setLvWahl] = createSignal<string | null>(g.lv ?? null);
  const lvId = () => (lvs().some((l) => l.id === lvWahl()) ? lvWahl() : lvs()[0]?.id ?? null);
  const [mengen, setMengen] = createSignal(g.mengen ?? true), [preise, setPreise] = createSignal(g.preise ?? true);
  const [gewaehlt, setGewaehlt] = createSignal<Set<string>>(new Set());
  const [zu, setZu] = createSignal<Set<string>>(new Set());
  // ---- Quelle LV ----
  const positionen = createMemo(() => { const l = lvId(); return l ? lebende('lv_position').filter((q) => q.werte.lv === l && !q.werte.nachtrag) : []; });
  const nachId = createMemo(() => new Map(positionen().map((q) => [q.id, q])));
  const zeilen = createMemo(() => lvZeilen(positionen()));
  const sichtbar = createMemo(() => { const versteckt = new Set<string>(); return zeilen().filter((z) => { if (z.eltern && (versteckt.has(z.eltern) || zu().has(z.eltern))) { versteckt.add(z.id); return false; } return true; }); });
  // ---- Quelle Positionsdatenbank ----
  const [suche, setSuche] = createSignal(''), [treffer, setTreffer] = createSignal<{ id: string; werte: Werte }[]>([]), [gesamt, setGesamt] = createSignal<number | null>(null);
  const suchen = async (text: string) => {
    setSuche(text); setGewaehlt(new Set<string>());
    if (!text.trim()) { setTreffer([]); setGesamt(null); return; }
    try {
      const r = await fetch(`/api/nachschlagen/position?${new URLSearchParams({ suche: text, von: '0', anzahl: '100' })}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { gesamt: number; zeilen: { id: string; werte: Werte }[] };
      setTreffer(d.zeilen); setGesamt(d.gesamt);
    } catch { hinweis('Die Positionsdatenbank ließ sich nicht durchsuchen – keine Verbindung zum Server?', { art: 'fehler' }); }
  };
  const katalog = () => quelle() === KATALOG;
  const umschalten = (id: string) => { const n = new Set(gewaehlt()); if (n.has(id)) n.delete(id); else n.add(id); setGewaehlt(n); };
  const anzahl = () => (katalog() ? gewaehlt().size : ablage().filter((x) => !x.titel).length);
  const ablage = (): Ablage => (katalog() ? ablageAusKatalog(treffer().filter((t) => gewaehlt().has(t.id)).map((t) => t.werte), { preise: preise() })
    : ablageAus(zeilen(), (id) => nachId().get(id)?.werte, [...gewaehlt()], { mengen: mengen(), preise: preise() }));
  // Ziehen ins LV (Baustein Zeilen ziehen): die angefasste Zeile kommt zur Auswahl, alle gewählten wandern an die Einfügelinie
  const ziehen = (e: PointerEvent, id: string) => {
    const f = lvZielfeld(); if (e.button !== 0 || !f || (e.target as Element).closest('input, button, .klappe')) return;
    zeilenZiehen<{ nach: string | null; y: number }>({ start: e, rollen: f.rollen(),
      ids: () => { if (!gewaehlt().has(id)) setGewaehlt(new Set([...gewaehlt(), id])); return [...gewaehlt()]; },
      ziel: (ev) => f.ziel(ev), onZug: (z) => f.zug(z?.ziel ?? null),
      onAblegen: (z) => { const a = ablage(); if (a.length) { f.ablegen(a, z.ziel.nach); setGewaehlt(new Set<string>()); } } });
  };
  const uebernehmen = () => { const a = ablage(); if (!a.length) return; setLvAblage(a); setGewaehlt(new Set<string>()); };
  const quellen = () => [{ wert: KATALOG, titel: 'Positionsdatenbank (Katalog)' }, ...projekte().map((x) => ({ wert: x.id, titel: [x.werte.nummer, x.werte.name].filter(Boolean).join(' · ') + (x.id === p.ziel.werte.projekt ? ' (dieses Projekt)' : '') }))];
  return (
    <Kartenrahmen klasse="kopierquelle" label="Kopierquelle" titel="Kopierquelle" heftzwecke={p.heftzwecke} onZu={() => setKopierquelleOffen(false)} schliessenZeichen="×">
      <div class="kq-kopf">
        <Auswahlliste titel="Quelle" vorsatz="Quelle:" optionen={quellen()} wert={quelle()} onWert={(w) => { setQuelle(w); setGewaehlt(new Set<string>()); merken({ quelle: w }); }} />
        <Show when={!katalog()}>
          <Auswahlliste titel="LV der Quelle" vorsatz="LV:" platzhalter="kein LV" optionen={lvs().map((l) => ({ wert: l.id, titel: [l.werte.nummer, l.werte.name].filter(Boolean).join(' · ') }))} wert={lvId()}
            onWert={(w) => { setLvWahl(w); setGewaehlt(new Set<string>()); merken({ lv: w }); }} />
        </Show>
        <Show when={katalog()}>
          <input type="search" class="kq-suche" placeholder="Suchen – z. B. Kalksandstein 17,5 (Enter)" aria-label="Positionsdatenbank durchsuchen" value={suche()}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void suchen(e.currentTarget.value); } }} />
        </Show>
        <div class="kq-optionen">
          <Show when={!katalog()}><label><input type="checkbox" checked={mengen()} onChange={(e) => { setMengen(e.currentTarget.checked); merken({ mengen: e.currentTarget.checked }); }} /> Mengen</label></Show>
          <label title={katalog() ? 'Mittlerer Preis der Datenbank als Schätzpreis' : 'Preise der Quelle als Schätzpreis'}><input type="checkbox" checked={preise()} onChange={(e) => { setPreise(e.currentTarget.checked); merken({ preise: e.currentTarget.checked }); }} /> Preise als Schätzung</label>
        </div>
      </div>
      <div class="kq-liste" role="list" aria-label="Zeilen der Kopierquelle">
        <Show when={katalog()} fallback={
          <Show when={sichtbar().length} fallback={<p class="still-text">{lvId() ? 'Dieses LV hat noch keine Zeilen.' : 'In diesem Projekt gibt es kein anderes LV.'}</p>}>
            <For each={sichtbar()}>{(z) => {
              const q = () => nachId().get(z.id)?.werte ?? {};
              return <div role="listitem" class="kq-zeile" classList={{ titel: z.titel, an: gewaehlt().has(z.id) }} style={{ 'padding-left': `${z.ebene * 14 + 4}px` }} onClick={() => umschalten(z.id)} onPointerDown={(e) => ziehen(e, z.id)}>
                <input type="checkbox" checked={gewaehlt().has(z.id)} aria-label={z.titel ? 'Titel mit allem darunter wählen' : 'Position wählen'} onClick={(e) => e.stopPropagation()} onChange={() => umschalten(z.id)} />
                <Show when={z.titel} fallback={<i class="klappe-platz" />}><Klappe zu={zu().has(z.id)} onKlick={() => { const n = new Set(zu()); if (n.has(z.id)) n.delete(z.id); else n.add(z.id); setZu(n); }} /><Ordner offen={!zu().has(z.id)} /></Show>
                <span class="kq-oz">{z.oz}</span><span class="kq-text" title={String(q().langtext ?? '')}>{String(q().kurztext ?? '')}</span>
                <Show when={!z.titel && !istText(q().art)}><span class="kq-menge">{q().menge == null ? '' : `${String(q().menge).replace('.', ',')} ${String(q().einheit ?? '')}`}</span><span class="kq-ep">{geld(q().ep)}</span></Show>
              </div>;
            }}</For>
          </Show>}>
          <Show when={treffer().length} fallback={<p class="still-text">{gesamt() === 0 ? 'Nichts gefunden.' : 'Suchbegriff eingeben und Enter – z. B. „Innenputz“ oder eine Nummer.'}</p>}>
            <For each={treffer()}>{(t) => <div role="listitem" class="kq-zeile" classList={{ an: gewaehlt().has(t.id) }} onClick={() => umschalten(t.id)} onPointerDown={(e) => ziehen(e, t.id)}>
              <input type="checkbox" checked={gewaehlt().has(t.id)} aria-label="Position wählen" onClick={(e) => e.stopPropagation()} onChange={() => umschalten(t.id)} />
              <span class="kq-oz">{String(t.werte.code ?? '')}</span><span class="kq-text" title={String(t.werte.grundtext ?? '')}>{String(t.werte.kurz ?? '')}</span>
              <span class="kq-menge">{String(t.werte.einheit ?? '')}</span><span class="kq-ep">{geld(t.werte.ep_mittel)}</span></div>}</For>
            <Show when={(gesamt() ?? 0) > treffer().length}><p class="still-text klein-text">{treffer().length} von {gesamt()} Treffern – genauer suchen grenzt ein.</p></Show>
          </Show>
        </Show>
      </div>
      <div class="kq-fuss">
        <span class="still-text klein-text">{anzahl() ? `${anzahl()} ${anzahl() === 1 ? 'Position' : 'Positionen'} gewählt` : 'Anhaken wählt · ein Titel bringt alles darunter mit'}</span>
        <button type="button" class="knopf haupt" disabled={!anzahl() && !ablage().length} title="Unter der markierten Zeile des LV einfügen (ohne Markierung ans Ende der Ebene)" onClick={uebernehmen}>← Übernehmen</button>
      </div>
    </Kartenrahmen>
  );
}
