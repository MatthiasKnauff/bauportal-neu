// Suche der Ausschreibung links oben (wie im bisherigen Bauportal): eine für alle Ansichten, mit „dieses LV · Projekt · alle Projekte“.
// Im geöffneten LV blendet der LV-Baum aus, was nicht passt; hier links stehen die Treffer in anderen LVs, bei Firmen und in der Türliste.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { SUCHBEREICHE, firmaPasst, suchworte, trefferJeLv, type SuchBereich } from '../module/ava/suche';
import { gewaehltesLv, lvFolge, setAktivesLv } from './avakopf';
import { name } from './avadaten';
import { projektId } from './projekt';
import { springeZu } from './sprung';
import { lebende, sicht } from './unterbau/abgleich';

const [suchtext, setSuchtext] = createSignal('');
const [bereich, setBereich] = createSignal<SuchBereich>('lv');
/** Der Suchtext – der LV-Baum blendet danach aus. */
export { suchtext as avaSuchtext };

export function AvaSuche() {
  const worte = createMemo(() => suchworte(suchtext()));
  const lvs = createMemo(() => {
    const pr = projektId(), lv = gewaehltesLv();
    return lebende('lv').filter((l) => (bereich() === 'alle' ? true : bereich() === 'projekt' ? l.werte.projekt === pr : l.id === lv?.id)).sort(lvFolge);
  });
  const imLv = createMemo(() => { const ids = new Set(lvs().map((l) => l.id)); return ids; });
  const positionen = createMemo(() => (worte().length ? trefferJeLv(lebende('lv_position').filter((q) => imLv().has(String(q.werte.lv ?? ''))), worte(), lvs()) : []));
  const firmen = createMemo(() => (worte().length ? lebende('angebot').filter((a) => imLv().has(String(a.werte.lv ?? '')) && firmaPasst(name(a.werte.bieter), worte())).slice(0, 8) : []));
  const tueren = createMemo(() => {
    if (!worte().length) return [];
    const pr = projektId();
    return lebende('tuer').filter((t) => (bereich() === 'alle' || t.werte.projekt === pr) && firmaPasst(`${String(t.werte.nr ?? '')} ${String(t.werte.raumname ?? '')} ${String(t.werte.art ?? '')}`, worte())).slice(0, 8);
  });
  const lvName = (id: unknown) => { const l = sicht.lv?.[String(id ?? '')]?.werte; return `LV ${[l?.nummer, l?.name].filter(Boolean).join(' ')}`; };
  const oeffne = (lv: string, ansicht = 'lv') => { setAktivesLv(lv); springeZu('lv', lv, { modul: 'ava', ansicht, projekt: String(sicht.lv?.[lv]?.werte.projekt ?? '') || null }); };
  const leer = () => worte().length > 0 && !positionen().length && !firmen().length && !tueren().length;
  return (
    <div class="ava-suche">
      <input type="search" placeholder="Suchen: LV, Firma, OZ, Text …" aria-label="Suchen in der Ausschreibung" value={suchtext()}
        onInput={(e) => setSuchtext(e.currentTarget.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setSuchtext(''); }} />
      <div class="auswahl" role="radiogroup" aria-label="Suchen in"><For each={SUCHBEREICHE}>{(b) =>
        <button type="button" role="radio" aria-checked={bereich() === b.wert} classList={{ aktiv: bereich() === b.wert }} title={b.hilfe} onClick={() => setBereich(b.wert)}>{b.titel}</button>}</For></div>
      <Show when={worte().length}>
        <div class="ava-treffer" role="list" aria-label="Treffer">
          <For each={positionen()}>{(t) => <button type="button" role="listitem" onClick={() => oeffne(t.lv)}>
            <b>{lvName(t.lv)}</b><span class="pille">{t.anzahl}</span><small>{t.erste.map((q) => `${String(q.werte.oz ?? '')} ${String(q.werte.kurztext ?? '')}`.trim()).join(' · ')}</small></button>}</For>
          <For each={firmen()}>{(a) => <button type="button" role="listitem" onClick={() => oeffne(String(a.werte.lv), 'preisspiegel')}>
            <b>{name(a.werte.bieter)}</b><small>Angebot · {lvName(a.werte.lv)}</small></button>}</For>
          <For each={tueren()}>{(t) => <button type="button" role="listitem" onClick={() => springeZu('tuer', t.id, { modul: 'ava', ansicht: 'tueren', projekt: String(t.werte.projekt ?? '') || null })}>
            <b>{String(t.werte.nr ?? '')} {String(t.werte.raumname ?? '')}</b><small>Fenster- & Türliste</small></button>}</For>
          <Show when={leer()}><p class="still-text klein-text">Nichts gefunden{bereich() === 'lv' ? ' – „Projekt“ oder „alle Projekte“ sucht weiter.' : '.'}</p></Show>
        </div>
      </Show>
    </div>
  );
}
