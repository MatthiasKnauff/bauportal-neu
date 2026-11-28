// Baustein „Feld“: ein Eingabefeld, erzeugt aus der Feldbeschreibung im Datenmodell.
import { Schlagworte, vorkommen } from './schlagworte';
import { For, Match, Show, Switch, createMemo, createSignal, createUniqueId } from 'solid-js';
import type { Feld, Wert, Werte } from '../../kern/modell';
import { HERKUNFT } from '../../kern/befehl';
import { feldtext } from '../../kern/druck';
import { ausfuehren, feldWerte, gemerkt, lebende, objektname, sicht, verweisname } from '../unterbau/abgleich';
import { darf, modell, neueKennung } from '../unterbau/api';
import { Auswahlliste } from './auswahlliste';
import { Datumsfeld } from './datum';
import { hinweis } from '../unterbau/meldungen';
import { kiAnbindungen, kiOeffnen } from './ki';

// Auswahl mit eigenen Werten (wie die Kontaktart im bisherigen Bauportal): die festen Optionen, dann die eigenen, die es
// schon gibt, zuletzt „eigene … “ – das öffnet an derselben Stelle ein Eingabefeld (kein Systemdialog).
const EIGEN = '\u0000eigen';
function EigeneAuswahl(p: { id: string; feld: Feld; wert: string; objekt?: string; gesperrt?: boolean; blass?: boolean; onWert: (w: Wert) => void }) {
  const [eingabe, setEingabe] = createSignal(false);
  const [angefasst, setAngefasst] = createSignal(false);   // die eigenen Werte aller Einträge erst sammeln, wenn jemand die Auswahl öffnet
  const fest = () => p.feld.optionen!.filter((o) => o.wert !== '');
  const eigene = () => {
    const da = new Set(fest().map((o) => o.wert));
    const alle = new Set<string>(p.objekt && angefasst() ? feldWerte(p.objekt, p.feld.name) : []);
    if (p.wert) alle.add(p.wert);
    return [...alle].filter((w) => w && !da.has(w)).sort((a, b) => a.localeCompare(b, 'de'));
  };
  const optionen = () => [...fest(), ...eigene().map((w) => ({ wert: w, titel: w })), ...(p.gesperrt ? [] : [{ wert: EIGEN, titel: `eigene ${p.feld.titel} …` }])];
  const uebernehmen = (t: string) => { setEingabe(false); const w = t.replace(/\s+/g, ' ').trim(); if (w && w !== p.wert) p.onWert(w); };
  return (
    <Show when={eingabe()} fallback={<div class="eigene-auswahl" onPointerDown={() => setAngefasst(true)} onFocusIn={() => setAngefasst(true)} onKeyDown={() => setAngefasst(true)}>
      <Auswahlliste id={p.id} titel={p.feld.titel} optionen={optionen()} wert={p.wert} blass={p.blass} gesperrt={p.gesperrt} onWert={(w) => (w === EIGEN ? setEingabe(true) : p.onWert(w))} /></div>}>
      <input id={p.id} type="text" maxLength={60} autocomplete="off" placeholder={`Eigene ${p.feld.titel}, z. B. Planer:in, Versorger – Enter übernimmt`} aria-label={`Eigene ${p.feld.titel}`}
        ref={(el) => queueMicrotask(() => el.focus())}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uebernehmen(e.currentTarget.value); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEingabe(false); } }}
        onBlur={(e) => uebernehmen(e.currentTarget.value)} />
    </Show>
  );
}

// Text mit Wortvervollständigung (Feld „vorschlagen“): beim Tippen die Werte, die an anderen Einträgen schon stehen –
// die häufigsten zuerst, passende Anfänge vorn; bei Listen („Dachdecker, Zimmerer“) für den Teil nach dem letzten Komma.
// Gesammelt wird erst, wenn das Feld den Fokus hat (sonst kostet jede Karte Zeit).
const TRENN = /\s*[,;]\s*/;
function TextVorschlag(p: { id: string; feld: Feld; wert: string; objekt: string; gesperrt?: boolean; sofort?: boolean; onWert: (w: Wert) => void }) {
  const [text, setText] = createSignal(p.wert);
  const [offen, setOffen] = createSignal(false);
  const [markiert, setMarkiert] = createSignal(-1);
  let feld!: HTMLInputElement;
  const alle = () => gemerkt(p.objekt, `vorschlag:${p.feld.name}`, () => {
    const z = new Map<string, { wort: string; anzahl: number }>();
    for (const r of lebende(p.objekt)) for (const w of new Set(String(r.werte[p.feld.name] ?? '').split(TRENN).map((x) => x.trim()).filter(Boolean))) {
      const k = w.toLocaleLowerCase('de'), e = z.get(k); if (e) e.anzahl++; else z.set(k, { wort: w, anzahl: 1 });
    }
    return [...z.values()].sort((a, b) => b.anzahl - a.anzahl || a.wort.localeCompare(b.wort, 'de'));
  });
  const teile = () => text().split(TRENN);
  const vorschlaege = createMemo(() => {
    if (!offen()) return [];
    const t = teile(), q = (t[t.length - 1] ?? '').trim().toLocaleLowerCase('de'), schon = new Set(t.slice(0, -1).map((x) => x.trim().toLocaleLowerCase('de')));
    return alle().filter((x) => { const k = x.wort.toLocaleLowerCase('de'); return k !== q && !schon.has(k) && k.includes(q); })
      .sort((a, b) => Number(!a.wort.toLocaleLowerCase('de').startsWith(q)) - Number(!b.wort.toLocaleLowerCase('de').startsWith(q))).slice(0, 8);
  });
  const nehmen = (w: string) => {
    const t = text(), k = Math.max(t.lastIndexOf(','), t.lastIndexOf(';'));
    const neu = (k >= 0 ? t.slice(0, k + 1) + ' ' : '') + w;
    setText(neu); feld.value = neu; setOffen(false); setMarkiert(-1);
    if (neu !== p.wert) p.onWert(neu);
  };
  return (
    <div class="filterfeld textvorschlag">
      <input ref={feld} id={p.id} type="text" value={p.wert} autocomplete="off" readOnly={p.gesperrt} role="combobox" aria-expanded={offen() && vorschlaege().length > 0}
        onFocus={(e) => { setText(e.currentTarget.value); if (!p.gesperrt) setOffen(true); }} onBlur={() => setTimeout(() => setOffen(false), 150)}
        onInput={(e) => { setText(e.currentTarget.value); setOffen(true); setMarkiert(-1); if (p.sofort) p.onWert(e.currentTarget.value); }}
        onChange={(e) => { if (!p.sofort && e.currentTarget.value !== p.wert) p.onWert(e.currentTarget.value); }}
        onKeyDown={(e) => {
          const l = vorschlaege();
          if (e.key === 'ArrowDown' && l.length) { e.preventDefault(); setMarkiert(Math.min(l.length - 1, markiert() + 1)); }
          else if (e.key === 'ArrowUp' && markiert() >= 0) { e.preventDefault(); setMarkiert(markiert() - 1); }
          else if (e.key === 'Enter' && markiert() >= 0 && l[markiert()]) { e.preventDefault(); nehmen(l[markiert()]!.wort); }
          else if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape' && offen() && l.length) { e.preventDefault(); e.stopPropagation(); setOffen(false); }
        }} />
      <Show when={offen() && vorschlaege().length > 0}>
        <ul class="filter-vorschlaege" role="listbox" aria-label={`Vorschläge für ${p.feld.titel}`}>
          <For each={vorschlaege()}>{(x, i) => (
            <li role="option" aria-selected={markiert() === i()} classList={{ markiert: markiert() === i() }} onMouseDown={(e) => { e.preventDefault(); nehmen(x.wort); }}>
              <span>{x.wort}</span><span class="anzahl">{x.anzahl}</span>
            </li>
          )}</For>
        </ul>
      </Show>
    </div>
  );
}

export function FeldEingabe(p: {
  feld: Feld; wert: Wert; fehler?: string; onWert: (w: Wert, herkunft?: string) => void; sofort?: boolean; gesperrt?: boolean;
  herkunft?: string;     // woher der Wert stammt, wenn nicht von Hand
  zusammenhang?: Werte;  // Projekt und Version des Eintrags: Verweise bieten nur an, was dazugehört
  objekt?: string;       // Modell des Eintrags: Schlagworte schlagen vor, was an anderen Einträgen schon steht
  breit?: boolean;       // über die ganze Breite (z. B. der Name in der Karte)
  klein?: boolean;       // kleine Beschriftung (z. B. Felder neben einer Zeile der Unterliste)
  /** Feld erbt (kern/erben.ts): leer zeigt es den Wert der Ebene darüber („vom Projekt“); eigener Wert: ↺ zurück, ↑ für die Ebene darüber übernehmen. */
  erbe?: { wert: Wert; von?: string; hoch?: () => void; hochTitel?: string };
}) {
  const id = createUniqueId();
  const eigen = () => p.wert !== null && p.wert !== undefined && p.wert !== '';
  const geerbt = () => !eigen() && !!p.erbe?.von;
  const wert = (): Wert => (geerbt() ? p.erbe!.wert : p.wert);
  // Zahlen stehen mit Komma da, wie man sie hier schreibt
  const text = () => (wert() === null || wert() === undefined ? '' : typeof wert() === 'number' ? String(wert()).replace('.', ',') : String(wert()));
  // sofort = jede Eingabe melden (Fenster „Neu“), sonst erst beim Verlassen des Feldes (Detailkarte)
  const melden = (e: Event) => {
    const w = (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    if (w !== text()) p.onWert(w);
  };
  const ereignis = () => (p.sofort ? { onInput: melden } : { onChange: melden });
  const eingabe = () => <input id={id} type={typ()} inputMode={p.feld.art === 'zahl' ? 'decimal' : undefined} value={text()} autocomplete="off" readOnly={p.gesperrt}
    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} {...ereignis()} />;
  // Stellschraube „ki“: die Felder, die als Grundlage mitgehen (z. B. Kurztext und Einheit), vor dem eigenen Text
  const kiText = () => [...(p.objekt ? p.feld.ki?.aus ?? [] : []).map((n) => [n, String(p.zusammenhang?.[n] ?? '').trim()]).filter(([, w]) => w).map(([n, w]) => `${modell(p.objekt!).felder.find((f) => f.name === n)?.titel ?? n}: ${w}`), text()].filter(Boolean).join('\n\n');
  const typ = () => (p.feld.art === 'email' ? 'email' : p.feld.art === 'telefon' ? 'tel' : 'text');
  return (
    <div class="feld" data-geerbt={geerbt() || undefined} style={p.feld.kartenBreite ? { '--karten-breite': String(p.feld.kartenBreite) } : undefined} classList={{ 'mit-fehler': !!p.fehler, klein: !!p.klein, quer: p.feld.art === 'ja_nein',
      breit: p.breit || (!p.feld.kartenBreite && ['langtext', 'mehrfach', 'schlagworte'].includes(p.feld.art)) || (!p.feld.kartenBreite && p.feld.art === 'auswahl' && !p.feld.eigeneWerte && !p.feld.alsListe && p.feld.optionen!.length <= 4 && p.feld.optionen!.length > 2) }}>
      <label for={id}>{p.feld.titel}{p.feld.pflicht ? ' *' : ''}<Show when={geerbt()}><span class="herkunft herkunft-geerbt" title="Leer – es gilt dieser Wert. Wer hier etwas einträgt, weicht davon ab.">{p.erbe!.von}</span></Show>
        <Show when={p.herkunft}><span class={`herkunft herkunft-${p.herkunft}`} title="Dieser Wert wurde nicht von Hand eingegeben. Sobald du ihn änderst, gilt er als eingegeben.">{HERKUNFT[p.herkunft!] ?? p.herkunft}</span></Show>
        {/* Lange Texte: Wenn das Büro eine KI eingeschaltet hat, kann sie hier einen Vorschlag machen */}
        <Show when={p.feld.art === 'langtext' && !p.gesperrt && kiAnbindungen().length}><button type="button" class="ki-knopf" title="Die KI macht einen Vorschlag – übernommen wird erst nach deiner Bestätigung" onClick={() => kiOeffnen({ titel: p.feld.titel, text: kiText(), aufgaben: p.feld.ki?.aufgaben, onUebernehmen: (t) => p.onWert(t, 'ki') })}>✦ KI</button></Show></label>
      <Show when={p.erbe && eigen() && !p.gesperrt}>
        <span class="feld-erbe">
          <button type="button" class="knopf mini still" title={p.erbe!.von ? `Zurück auf den Wert ${p.erbe!.von}` : 'Leeren'} aria-label={`${p.feld.titel} zurücksetzen`} onClick={() => p.onWert(null)}>↺</button>
          <Show when={p.erbe!.hoch}><button type="button" class="knopf mini still" title={`Diesen Wert ${p.erbe!.hochTitel ?? ''} übernehmen – hier gilt er dann geerbt`} onClick={() => p.erbe!.hoch!()}>↑ {p.erbe!.hochTitel}</button></Show>
        </span>
      </Show>
      <Switch fallback={
        <Show when={p.feld.art === 'telefon' || p.feld.art === 'email'} fallback={eingabe()}>
          {/* Nummer und E-Mail: daneben kopieren (wie im bisherigen Bauportal) – der Knopf steht immer da, damit beim Tippen nichts springt */}
          <div class="feld-mit-knopf">{eingabe()}
            <button type="button" class="knopf klein still feld-kopieren" disabled={!text()} title={`${p.feld.titel} kopieren`} aria-label="In die Zwischenablage"
              onClick={() => void navigator.clipboard.writeText(text()).then(() => hinweis(`${p.feld.titel} kopiert`), () => hinweis('Kopieren ist in diesem Browser nicht erlaubt.'))}>⧉</button>
          </div>
        </Show>
      }>
        <Match when={p.feld.art === 'text' && p.feld.vorschlagen && p.objekt}>
          <TextVorschlag id={id} feld={p.feld} wert={text()} objekt={p.objekt!} gesperrt={p.gesperrt} sofort={p.sofort} onWert={p.onWert} />
        </Match>
        <Match when={p.feld.art === 'datum'}>
          <Datumsfeld id={id} wert={text()} titel={p.feld.titel} gesperrt={p.gesperrt} sofort={p.sofort} vorschlaege={p.feld.datumVorschlaege} zusammenhang={p.zusammenhang} onWert={(w) => p.onWert(w)} />
        </Match>
        <Match when={p.feld.art === 'langtext'}>
          <textarea id={id} rows={5} value={text()} readOnly={p.gesperrt} {...ereignis()} />
        </Match>
        <Match when={p.feld.art === 'auswahl' && p.feld.eigeneWerte}>
          <EigeneAuswahl id={id} feld={p.feld} wert={text()} blass={geerbt()} objekt={p.objekt} gesperrt={p.gesperrt} onWert={p.onWert} />
        </Match>
        <Match when={p.feld.art === 'auswahl' && (p.feld.alsListe || p.feld.optionen!.length > 4 || (p.feld.kartenBreite ?? 3) < 3)}>
          <Auswahlliste id={id} titel={p.feld.titel} optionen={p.feld.optionen!} wert={text()} blass={geerbt()} gesperrt={p.gesperrt} onWert={p.onWert} />
        </Match>
        <Match when={p.feld.art === 'auswahl'}>
          <div class="auswahl" role="radiogroup" id={id} aria-label={p.feld.titel}>
            <For each={p.feld.optionen}>{(o) => (
              <button type="button" role="radio" aria-checked={wert() === o.wert} classList={{ aktiv: wert() === o.wert }} disabled={p.gesperrt && wert() !== o.wert}
                onClick={() => { if (wert() !== o.wert && !p.gesperrt) p.onWert(o.wert); }}>{o.titel}</button>
            )}</For>
          </div>
        </Match>
        <Match when={p.feld.art === 'mehrfach'}>
          <div class="auswahl" role="group" id={id} aria-label={p.feld.titel}>
            <For each={p.feld.optionen}>{(o) => {
              const an = () => text().split(',').includes(o.wert);
              return <button type="button" role="checkbox" aria-checked={an()} classList={{ aktiv: an() }} disabled={p.gesperrt}
                onClick={() => p.onWert(p.feld.optionen!.filter((x) => (x.wert === o.wert) !== text().split(',').includes(x.wert)).map((x) => x.wert).join(','))}>{o.titel}</button>;
            }}</For>
          </div>
        </Match>
        <Match when={p.feld.art === 'schlagworte'}>
          <Schlagworte id={id} titel={p.feld.titel} wert={text()} gesperrt={p.gesperrt} onWert={p.onWert}
            vorschlaege={p.objekt ? () => gemerkt(p.objekt!, `vorkommen:${p.feld.name}`, () => vorkommen(lebende(p.objekt!), p.feld.name)) : undefined} />
        </Match>
        <Match when={p.feld.art === 'ja_nein'}>
          <button type="button" id={id} role="switch" aria-checked={wert() === true} class="schalter" classList={{ aktiv: wert() === true }} disabled={p.gesperrt}
            onClick={() => p.onWert(wert() !== true)}><span /></button>
        </Match>
        <Match when={p.feld.art === 'verweis'}>
          {(() => { const wahl = () => verweisWahl(p.feld, p.zusammenhang, p.objekt); return <Auswahlliste id={id} titel={p.feld.titel} platzhalter="wählen …" blass={geerbt()} wert={wert() === null ? null : String(wert())} gesperrt={p.gesperrt} onWert={(w) => p.onWert(w || null)}
            optionen={[...(p.feld.pflicht ? [] : [{ wert: '', titel: '(keins)' }]), ...wahl().optionen]} weitere={wahl().weitere}
            neu={verweisNeu(p.feld, (id) => p.onWert(id))} />; })()}
        </Match>
      </Switch>
      <Show when={p.fehler}><div class="feld-fehler">{p.fehler}</div></Show>
    </div>
  );
}

/** Stellschraube „neuAnlegen“ für die Auswahlliste: „＋ … anlegen“ unter den Treffern, wenn man darf – danach gewählt. */
export function verweisNeu(f: Feld, onId: (id: string) => void): { titel: string; tun: (text: string) => void } | undefined {
  return f.neuAnlegen && darf(f.ziel!, 'schreiben') ? { titel: `als ${modell(f.ziel!).titel} anlegen`, tun: (text) => onId(zielAnlegen(f, text)) } : undefined;
}

/** Stellschraube „neuAnlegen“: das Getippte als neues Ziel anlegen (ein Befehl, rückgängig zu machen) – gibt seine Kennung. */
function zielAnlegen(f: Feld, text: string): string {
  const m = modell(f.ziel!), id = neueKennung();
  ausfuehren({ objekt: m.name, art: 'anlegen', objektId: id, werte: { ...f.neuAnlegen, [m.anzeigeFeld]: text } }, `„${text}“ als ${m.titel} anlegen`);
  hinweis(`„${text}“ wurde ${m.titelMehrzahl === 'Kontakte' ? 'zu den Kontakten' : `als ${m.titel}`} hinzugefügt.`);
  return id;
}

/** Stellschraube „imProjekt“: zur Wahl stehen erst die Ziele, die im Projekt schon vorkommen – in diesem Feld früherer Einträge
 *  und z. B. bei den Beteiligten; alle anderen erst über die Suche unten in der Liste (Auswahlliste „weitere“). */
export function verweisWahl(f: Feld, zusammenhang?: Werte, objekt?: string): { optionen: { wert: string; titel: string }[]; weitere?: { titel: string; optionen: { wert: string; titel: string }[] } } {
  const alle = verweisziele(f, zusammenhang, objekt), projekt = zusammenhang?.projekt;
  if (!f.imProjekt || !projekt) return { optionen: alle };
  const quellen = [...(objekt ? [{ objekt, feld: f.name }] : []), ...f.imProjekt];
  const da = new Set(quellen.flatMap((q) => lebende(q.objekt).filter((z) => z.werte.projekt === projekt).map((z) => String(z.werte[q.feld] ?? ''))));
  return { optionen: alle.filter((o) => da.has(o.wert)), weitere: { titel: `Weitere ${modell(f.ziel!).titelMehrzahl}`, optionen: alle.filter((o) => !da.has(o.wert)) } };
}

/** Was ein Verweis zur Wahl stellt: die Einträge des Ziels aus demselben Projekt und derselben Version. */
export function verweisziele(f: Feld, zusammenhang?: Werte, objekt?: string): { wert: string; titel: string }[] {
  const m = modell(f.ziel!);
  const gleich = ['projekt', 'version', ...(f.gleich ?? [])].filter((k) => zusammenhang?.[k] && m.felder.some((x) => x.name === k));
  const alle = gemerkt(f.ziel!, `ziele:${gleich.map((k) => `${k}=${String(zusammenhang![k])}`).join(':')}`, () => lebende(f.ziel!).filter((z) => gleich.every((k) => z.werte[k] === zusammenhang![k]))
    .map((z) => ({ wert: z.id, titel: objektname(m, z.werte) })).sort((a, b) => a.titel.localeCompare(b.titel, 'de', { numeric: true })));
  // Stellschraube „zuerst“: die passenden oben (z. B. Firmen, deren Gewerk zum Gewerk der Leistung passt), sonst wie gehabt
  const such = f.zuerst ? String(zusammenhang?.[f.zuerst.feld] ?? '').trim().toLowerCase() : '';
  if (!such) return alle;
  const passt = (id: string) => String(sicht[f.ziel!]?.[id]?.werte[f.zuerst!.ziel] ?? '').toLowerCase().includes(such);
  return [...alle.filter((o) => passt(o.wert)), ...alle.filter((o) => !passt(o.wert))];
}

/** Wert so, wie er in einer Tabelle steht – derselbe Text wie im Ausdruck. */
export const anzeige = (f: Feld, w: Wert | undefined): string => feldtext(f, w, verweisname);
/** Wert für Excel: Zahlen bleiben Zahlen, Daten echte Daten, alles andere wie angezeigt. */
export const excelWert = (f: Feld, w: Wert | undefined): string | number | Date | null => {
  if (w == null || w === '') return null;
  if (f.art === 'zahl' && typeof w === 'number') return w;
  if (f.art === 'datum' && /^\d{4}-\d{2}-\d{2}/.test(String(w))) { const [j, m, t] = String(w).slice(0, 10).split('-').map(Number); return new Date(j!, m! - 1, t!); }
  return anzeige(f, w);
};
