// Bautagebuch wie gewohnt: links Kalender (oder Liste) und die Abschnitte des Berichts, in der Mitte der Bericht als
// Seite – Kopf mit Datum, Wetter und Kontrollen, darunter je Abschnitt eine Karte –, rechts das Detail des angeklickten
// Eintrags. Die Abschnitte sind dieselben Bausteine wie in „Schritt für Schritt“ (Unterliste, Bilder, Feld).
import { Seitenliste } from './baukasten/seitenliste';
import { springeZu } from './sprung';
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Feld, Wert } from '../kern/modell';
import { ausfuehren, ausfuehrenMehrere, rueckgaengig, sicht, lebende, gemerkt } from './unterbau/abgleich';
import { RUEGE_AB, erwartet, laufendAm, type Laufend } from '../module/bautagebuch/soll';
import { MIT_ERLEDIGT } from '../module/bautagebuch/beipackzettel';
import { planDerVersion, planVersionen } from './plandaten';
import { ausdrucke, darf, modell, neueKennung, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import type { Mitte } from './baukasten/anpassung';
import { Bilder, FotoGross } from './baukasten/bilder';
import { Detailkarte, feldAendern, inEigenemFenster, loesche } from './baukasten/detailkarte';
import { FeldEingabe, anzeige } from './baukasten/feld';
import { Schrittweise } from './baukasten/schrittweise';
import { Unterliste } from './baukasten/unterliste';
import { Zaehler } from './baukasten/zaehler';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Verlauf } from './baukasten/verlauf';
import { Diktieren } from './diktat';
import { druckOeffnen } from './druck';
import { Zeichen, type Zeichenname } from './baukasten/zeichen';
import { Dialog } from './baukasten/dialog';
import { handy } from './unterbau/geraet';

const heute = () => new Date().toLocaleDateString('sv');
const datumText = (d: unknown) => (d ? new Date(`${String(d)}T12:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const merke = (k: string, w: string) => { try { localStorage.setItem(k, w); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
const hole = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

// Was rechts steht: ein Eintrag des Berichts, der Bericht selbst zum Bearbeiten – oder nichts
const [eintrag, setEintrag] = createSignal<string | null>(null);
const [bearbeiten, setBearbeiten] = createSignal(false);
const [bearbeitenBei, setBearbeitenBei] = createSignal<string>();   // Gruppe, zu der die Karte springt (Stift am Kopf: Bericht, am Wetter: Wetter)
const [foto, setFoto] = createSignal<string | null>(null);   // rechts groß gezeigtes Foto des Berichts

/** Die Abschnitte eines Berichts – Reihenfolge wie im alten Bautagebuch. */
const ABSCHNITTE: { id: string; titel: string; zeichen: Zeichenname; art?: string }[] = [
  { id: 'anwesend', titel: 'Anwesende', zeichen: 'personen', art: 'anwesend' },
  { id: 'notiz', titel: 'Notizen', zeichen: 'notiz', art: 'notiz' },
  { id: 'fotos', titel: 'Bilder', zeichen: 'foto' },
  { id: 'mangel', titel: 'Mängel', zeichen: 'mangel', art: 'mangel' },
  { id: 'aufgabe', titel: 'Zu erledigen', zeichen: 'aufgabe', art: 'aufgabe' },
  { id: 'weisung', titel: 'Weisungen', zeichen: 'weisung', art: 'weisung' },
];
const offen = (bericht: string, a: (typeof ABSCHNITTE)[number]) =>
  MIT_ERLEDIGT.includes(a.art ?? '') ? lebende('bericht_eintrag').filter((e) => e.werte.bericht === bericht && e.werte.art === a.art && e.werte.erledigt !== true).length : 0;
// Am Handy (wie im bisherigen Bautagebuch): die Abschnitte als Kacheln; ein angetippter Abschnitt steht allein, „‹ Bericht“ führt zurück
const [fokus, setFokus] = createSignal<string | null>(null);
const [hinzu, setHinzu] = createSignal(false);   // Blatt „Hinzufügen“ – das ＋ unten in der Leiste
const anzahl = (bericht: string, a: (typeof ABSCHNITTE)[number]) =>
  a.art ? lebende('bericht_eintrag').filter((e) => e.werte.bericht === bericht && e.werte.art === a.art).length : lebende('foto').filter((f) => f.werte.bericht === bericht).length;
// Das „+“ jedes Abschnitts – auch aus dem Menüband erreichbar (Eintrag, Foto, Mangel)
const neuIn = new Map<string, () => void>();
const zumAbschnitt = (id: string) => document.getElementById(`abschnitt-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------- links: Kalender oder Liste, darunter die Abschnitte ----------
export function BerichtLinks(p: Mitte) {
  const [form, setForm] = createSignal(hole('bp.bautagebuch.links', 'kalender'));
  const gewaehlt = () => (p.gewaehlt() ? sicht.tagesbericht?.[p.gewaehlt()!] : undefined);
  const [monat, setMonat] = createSignal((String(gewaehlt()?.werte.datum ?? '') || heute()).slice(0, 7));
  createEffect(on(() => gewaehlt()?.werte.datum, (d) => { if (d) setMonat(String(d).slice(0, 7)); }));
  const proTag = createMemo(() => {
    const m = new Map<string, Zeile[]>();
    for (const z of p.alle()) { const d = String(z.werte.datum ?? ''); if (d) (m.get(d) ?? m.set(d, []).get(d)!).push(z); }
    return m;
  });
  const tage = createMemo(() => {
    const [j, mo] = monat().split('-').map(Number) as [number, number];
    const erster = new Date(j, mo - 1, 1), versatz = (erster.getDay() + 6) % 7, n = new Date(j, mo, 0).getDate();
    return [...Array(versatz).fill(null), ...Array.from({ length: n }, (_, i) => `${monat()}-${String(i + 1).padStart(2, '0')}`)] as (string | null)[];
  });
  const blaettern = (s: number) => { const [j, mo] = monat().split('-').map(Number) as [number, number]; const d = new Date(j, mo - 1 + s, 1); setMonat(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const titelMonat = () => new Date(`${monat()}-15T12:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const waehle = (id: string) => { setEintrag(null); setBearbeiten(false); p.onWahl(id); };
  const liste = () => [...p.zeilen()].sort((a, b) => String(b.werte.datum ?? '').localeCompare(String(a.werte.datum ?? '')) || Number(b.werte.nummer ?? 0) - Number(a.werte.nummer ?? 0));
  return (
    <div class="bt-links">
      <div class="auswahl segment bt-form" role="radiogroup" aria-label="Berichte zeigen als">
        <For each={[['kalender', 'Kalender'], ['liste', 'Liste']] as const}>{([k, t]) =>
          <button type="button" role="radio" aria-checked={form() === k} classList={{ aktiv: form() === k }} onClick={(e) => { e.stopPropagation(); setForm(k); merke('bp.bautagebuch.links', k); }}>{t}</button>}</For>
      </div>
      <Show when={form() === 'kalender'} fallback={
        <ul class="bt-berichte"><For each={liste()} fallback={<li class="still-text">Keine Berichte.</li>}>{(z) => (
          <li><button classList={{ an: z.id === p.gewaehlt() }} onClick={() => waehle(z.id)}>
            <strong>Nr. {String(z.werte.nummer ?? '')}</strong> <span>{datumText(z.werte.datum)}</span>
          </button></li>)}</For></ul>}>
        <div class="bt-kalender" onClick={(e) => e.stopPropagation()}>
          <div class="bt-monat"><button class="knopf klein still" aria-label="Voriger Monat" onClick={() => blaettern(-1)}>‹</button><strong>{titelMonat()}</strong><button class="knopf klein still" aria-label="Nächster Monat" onClick={() => blaettern(1)}>›</button></div>
          <div class="bt-tage" role="grid" aria-label={titelMonat()}>
            <For each={['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']}>{(t) => <span class="bt-wt">{t}</span>}</For>
            <For each={tage()}>{(d) => d ? (() => { const b = () => proTag().get(d) ?? []; return (
              <button class="bt-tag" classList={{ bericht: b().length > 0, an: !!gewaehlt() && gewaehlt()!.werte.datum === d, heute: d === heute() }}
                disabled={!b().length} aria-label={`${datumText(d)}${b().length ? `: ${b().length} Bericht${b().length > 1 ? 'e' : ''}` : ''}`}
                onClick={() => { const z = b(); if (z.length) waehle(z[z.length - 1]!.id); }}>{Number(d.slice(8))}</button>); })() : <span />}</For>
          </div>
        </div>
      </Show>
      <Show when={gewaehlt()}>{(g) => (
        <Seitenliste name="Abschnitte des Berichts" aktiv="" abschnitte={[{ titel: `Tagesbericht Nr. ${String(g().werte.nummer ?? '')} · ${datumText(g().werte.datum)}`,
          eintraege: [{ id: 'kopf', titel: 'Tagesbericht', zeichen: 'bericht' }, ...ABSCHNITTE.map((a) => ({ id: a.id, titel: a.titel, zeichen: a.zeichen, anzahl: anzahl(g().id, a) }))] },
          // wie im bisherigen Bautagebuch: darunter das Projekt – alle Berichte als Liste, die Projektdaten
          { titel: 'Projekt', eintraege: [{ id: 'p:alle', titel: 'Alle Berichte', zeichen: 'liste', anzahl: p.zeilen().length },
            ...(g().werte.projekt ? [{ id: 'p:daten', titel: 'Projektdaten', zeichen: 'projekte' }] : [])] }]}
          onWahl={(id) => { if (id === 'p:alle') { setForm('liste'); merke('bp.bautagebuch.links', 'liste'); } else if (id === 'p:daten') springeZu('projekt', String(g().werte.projekt)); else zumAbschnitt(id); }} />
      )}</Show>
    </div>
  );
}

// ---------- Mitte: der Bericht als Seite ----------
/** Firmen zur Auswahl: zuerst die Beteiligten des Projekts, dann alle übrigen Kontakte. */
const firmenFuer = (projekt: unknown) => () => gemerkt(['kontakt', 'projekt_kontakt'], `firmen:${String(projekt)}`, () => {
  const beteiligt = new Set(lebende('projekt_kontakt').filter((e) => e.werte.projekt === projekt).map((e) => e.werte.kontakt));
  return lebende('kontakt').map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – '), vorn: beteiligt.has(k.id) }))
    .sort((a, b) => Number(b.vorn) - Number(a.vorn) || a.titel.localeCompare(b.titel, 'de'));
});

/** Anwesende wie im bisherigen Bautagebuch: je Firma Kürzel, Name (öffnet den Kontakt), Personen mit − / +, ✕ – darunter die
 *  Art der Tätigkeit. Unten „＋ Firma hinzufügen“ mit den Beteiligten des Projekts zuerst. */
const kuerzel = (name: string) => name.replace(/\b(GmbH|AG|KG|UG|mbH|Co|e\.?\s?K|Fa\.?|Firma|und|u\.)\b/gi, ' ').split(/[\s\-&+.,]+/).filter((w) => /^[A-Za-zÄÖÜäöü]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
/** Der gültige Bauzeitenplan des Projekts (der zählt auf der Baustelle) – oder keiner. */
function planZumBericht(b: Zeile) {
  if (!darf('vorgang', 'lesen')) return null;
  const v = planVersionen(String(b.werte.projekt ?? ''));
  const g = v.find((x) => x.werte.gueltig) ?? v[0];
  return g ? planDerVersion(g.id) : null;
}
const kurzDatum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const atText = (n: number) => `${String(n).replace('.', ',')} AT`;

/** Fortschritt einer Firma: ihre laufenden Leistungen mit Balken, „laut Plan“ und Prozent zum Anklicken – geht direkt in den Bauzeitenplan. */
function Fortschritt(p: { leistungen: Laufend[] }) {
  const schreiben = () => darf('vorgang', 'schreiben');
  const setzen = (l: Laufend, w: number) => { const z = sicht.vorgang?.[l.id]; if (z) feldAendern(modell('vorgang'), z, modell('vorgang').felder.find((f) => f.name === 'fortschritt')!, w); };
  return (
    <For each={p.leistungen}>{(l) => (
      <div class="fs-zeile">
        <div class="fs-name"><b>{l.name}</b>
          <span class="fs-balken" title={`gemeldet ${l.ist} %`}><i style={{ width: `${l.ist}%` }} classList={{ hinten: l.verzug >= RUEGE_AB, knapp: l.verzug >= 1 && l.verzug < RUEGE_AB }} /><em style={{ left: `${l.soll}%` }} title={`laut Plan ${l.soll} %`} /></span>
          <small>laut Plan {l.soll} % · Ende {kurzDatum(l.ende)}{l.verzug >= RUEGE_AB ? <span class="fs-verzug"> · ≈ {atText(l.verzug)} im Verzug – Terminrüge möglich</span> : l.verzug >= 1 ? ` · ≈ ${atText(l.verzug)} hinterher` : ''}</small>
        </div>
        <div class="fs-prozent" role="radiogroup" aria-label={`Fortschritt ${l.name}`}>
          <For each={[0, 25, 50, 75, 100]}>{(w) => (
            <button type="button" role="radio" aria-checked={l.ist === w} classList={{ aktiv: l.ist === w, 'laut-plan': Math.round(l.soll / 25) * 25 === w }} disabled={!schreiben()}
              title={Math.round(l.soll / 25) * 25 === w ? `${w} % – etwa laut Plan` : `${w} %`} onClick={() => setzen(l, w)}>{w}</button>
          )}</For>
        </div>
      </div>
    )}</For>
  );
}

/** Anwesende laut Bauzeitenplan: erwartete Firmen als vorausgefüllte Zeilen – erst ✓ trägt sie ein. Leistungen ohne Firma je Gewerk:
 *  Firma hier eintragen, dann steht sie auch im Bauzeitenplan. */
function Vorschlaege(p: { bericht: Zeile; neu: (werte: Record<string, Wert>, titel: string) => void }) {
  const plan = () => planZumBericht(p.bericht);
  const tag = () => String(p.bericht.werte.datum ?? '');
  const aus = () => new Set(String(p.bericht.werte.soll_aus ?? '').split('\n').filter(Boolean));
  const ausblenden = (k: string) => feldAendern(modell('tagesbericht'), p.bericht, modell('tagesbericht').felder.find((f) => f.name === 'soll_aus')!, [...aus(), k].join('\n'));
  const da = () => erwartet(plan()!, tag(), new Set(lebende('bericht_eintrag').filter((e) => e.werte.bericht === p.bericht.id && e.werte.art === 'anwesend' && e.werte.firma).map((e) => String(e.werte.firma))), aus());
  const name = (k: string) => String(sicht.kontakt?.[k]?.werte.name ?? 'Firma');
  return (
    <Show when={plan() && tag() && darf('bericht_eintrag', 'schreiben') && (da().firmen.length || da().ohne.length)}>
      <div class="soll">
        <Show when={da().firmen.length}><div class="soll-h">Laut Bauzeitenplan vorausgefüllt – bestätigen, „nicht da“ oder löschen</div></Show>
        <For each={da().firmen}>{(v) => {
          const [text, setText] = createSignal(v.leistungen.join(', '));
          const [anzahl, setAnzahl] = createSignal<number | null>(1);
          return (
            <div class="soll-zeile">
              <div class="aw-kopf"><span class="aw-kuerzel" aria-hidden="true">{kuerzel(name(v.firma))}</span><span class="aw-name"><b>{name(v.firma)}</b> <small class="still-text">laut Bauzeitenplan</small></span>
                <Zaehler titel="Personen" wert={anzahl()} onWert={(w) => setAnzahl(w == null ? null : Number(w))} /></div>
              <textarea class="aw-taetigkeit" rows={1} aria-label={`Art der Tätigkeit ${name(v.firma)}`} value={text()} onInput={(e) => setText(e.currentTarget.value)} />
              <div class="soll-knoepfe">
                <button type="button" class="knopf klein haupt" title="Bestätigen – als anwesend eintragen" onClick={() => p.neu({ firma: v.firma, personen: anzahl() ?? 1, text: text() }, 'Anwesend laut Bauzeitenplan')}>✓ Bestätigen</button>
                <button type="button" class="knopf klein" title="Nicht da – auf Wunsch mit Begründung (zählt für die Terminrüge)" onClick={() => p.neu({ firma: v.firma, personen: 0, text: '', nicht_da: true }, 'Nicht da')}>✗ nicht da</button>
                <button type="button" class="knopf klein still" aria-label={`Vorschlag ${name(v.firma)} löschen`} title="Vorschlag löschen – nicht nötig, ohne Folgen" onClick={() => ausblenden(v.firma)}>🗑</button>
              </div>
            </div>
          );
        }}</For>
        <Show when={da().ohne.length}>
          <div class="soll-h">Laut Bauzeitenplan heute außerdem – dort ist keine Firma eingetragen. Firma hier eintragen, dann steht sie auch im Bauzeitenplan:</div>
          <For each={da().ohne}>{(o) => (
            <div class="soll-zeile ohne">
              <div class="aw-name"><b>{o.gewerk}</b> <small class="still-text">{o.leistungen.join(', ')}</small></div>
              <div class="soll-knoepfe">
                <Show when={darf('vorgang', 'schreiben')}>
                  <Auswahlliste titel={`Firma für ${o.gewerk}`} platzhalter="Firma eintragen …" wert={null} optionen={firmenFuer(p.bericht.werte.projekt)()}
                    onWert={(k) => { ausfuehrenMehrere([...o.ids.map((id) => ({ objekt: 'vorgang', art: 'aendern' as const, objektId: id, werte: { firma: k } })),
                      { objekt: 'bericht_eintrag', art: 'anlegen' as const, objektId: neueKennung(), werte: neuWerte(p.bericht, { firma: k, personen: 1, text: o.leistungen.join(', ') }) }], 'Firma übernehmen – auch in den Bauzeitenplan'); }} />
                </Show>
                <button type="button" class="knopf klein still" title="Heute nicht – Hinweis ausblenden" aria-label={`${o.gewerk} heute nicht`} onClick={() => ausblenden(`g:${o.gewerk}`)}>–</button>
              </div>
            </div>
          )}</For>
        </Show>
      </div>
    </Show>
  );
}
/** Werte eines neuen Anwesenden am Ende der Liste. */
function neuWerte(b: Zeile, w: Record<string, Wert>): Record<string, Wert> {
  const reihe = Math.max(0, ...lebende('bericht_eintrag').filter((e) => e.werte.bericht === b.id && e.werte.art === 'anwesend').map((z) => Number(z.werte.reihe ?? 0))) + 1;
  return { projekt: b.werte.projekt ?? null, bericht: b.id, art: 'anwesend', reihe, ...w };
}

function Anwesende(p: { bericht: Zeile }) {
  const m = () => modell('bericht_eintrag');
  const feld = (n: string) => m().felder.find((f) => f.name === n)!;
  const schreiben = () => darf('bericht_eintrag', 'schreiben');
  const zeilen = () => lebende('bericht_eintrag').filter((e) => e.werte.bericht === p.bericht.id && e.werte.art === 'anwesend')
    .sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0));
  const name = (z: Zeile) => { const k = z.werte.firma ? sicht.kontakt?.[String(z.werte.firma)] : undefined; return k ? String(k.werte.name ?? '') : String(z.werte.text ?? ''); };
  const neu = (w: Record<string, Wert>, titel: string) => ausfuehren({ objekt: 'bericht_eintrag', art: 'anlegen', objektId: neueKennung(), werte: neuWerte(p.bericht, w) }, titel);
  // laufende Leistungen je Firma (Fortschritt) – Leistungen ohne Firma gehören nicht zu den Anwesenden
  const laufend = createMemo(() => { const pl = planZumBericht(p.bericht), t = String(p.bericht.werte.datum ?? ''); return pl && t ? laufendAm(pl, t) : []; });
  return (
    <div class="anwesende">
      <For each={zeilen()}>{(z) => (
        <div class="aw-zeile" classList={{ 'nicht-da': z.werte.nicht_da === true }}>
          <div class="aw-kopf">
            <span class="aw-kuerzel" aria-hidden="true">{kuerzel(name(z))}</span>
            <Show when={z.werte.firma} fallback={<span class="aw-name">{name(z) || 'ohne Firma'}</span>}>
              <button type="button" class="aw-name verweis-knopf" title="Kontakt öffnen" onClick={() => inEigenemFenster(modell('kontakt'), String(z.werte.firma))}>{name(z)}</button>
            </Show>
            <Show when={z.werte.nicht_da === true} fallback={<Zaehler titel="Personen" wert={z.werte.personen ?? null} gesperrt={!schreiben()} onWert={(w) => feldAendern(m(), z, feld('personen'), w)} />}>
              <small class="aw-nicht-da">nicht da</small>
            </Show>
            <Show when={darf('bericht_eintrag', 'loeschen')}><button type="button" class="knopf klein still" aria-label={`${name(z)} entfernen`} title={z.werte.nicht_da === true ? 'Rückgängig – wieder als Vorschlag' : 'Entfernen'} onClick={() => loesche(m(), z)}>✕</button></Show>
          </div>
          <textarea class="aw-taetigkeit" rows={1} placeholder={z.werte.nicht_da === true ? 'Begründung (auf Wunsch), z. B. kommt nächste Woche' : 'Art der Tätigkeit'} aria-label={`${z.werte.nicht_da === true ? 'Begründung' : 'Art der Tätigkeit'} ${name(z)}`} value={String(z.werte.text ?? '')} readOnly={!schreiben()}
            onChange={(e) => feldAendern(m(), z, feld('text'), e.currentTarget.value)} />
          <Show when={z.werte.firma && laufend().some((l) => l.firma === z.werte.firma)}><Fortschritt leistungen={laufend().filter((l) => l.firma === z.werte.firma)} /></Show>
        </div>
      )}</For>
      <Vorschlaege bericht={p.bericht} neu={neu} />
      <Show when={schreiben()}>
        <Auswahlliste titel="Firma hinzufügen" platzhalter="＋ Firma hinzufügen …" wert={null} optionen={firmenFuer(p.bericht.werte.projekt)()} onWert={(k) => { if (k) neu({ firma: k, personen: 1, text: '' }, 'Firma eintragen'); }} />
      </Show>
    </div>
  );
}
/** Summe der Personen der Anwesenden – steht im Kopf des Abschnitts. */
const personen = (bericht: string) => lebende('bericht_eintrag').filter((e) => e.werte.bericht === bericht && e.werte.art === 'anwesend').reduce((s, e) => s + (Number(e.werte.personen) || 0), 0);

/** Die Listen eines Berichts – dieselben in der Seite und im Ablauf „Schritt für Schritt“. */
function listen(bericht: Zeile, seite: boolean): Record<string, () => JSX.Element> {
  const fest = (art: string) => ({ projekt: bericht.werte.projekt ?? null, bericht: bericht.id, art });
  const wahl = seite ? { ohneTitel: true, onWahl: (id: string) => { setBearbeiten(false); setFoto(null); setEintrag(id); } } : {};
  return {
    anwesend: () => <Anwesende bericht={bericht} />,
    notiz: () => <Unterliste titel="Notizen" objekt="bericht_eintrag" fest={fest('notiz')} haupt="text" neben={['frist']} platzhalter="Notiz eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    fotos: () => <Show when={darf('foto', 'lesen')}><Bilder titel="Bilder" ohneTitel={seite} objekt="foto" fest={{ projekt: bericht.werte.projekt ?? null, bericht: bericht.id }} beschriftung="beschriftung" hochladen="/api/foto"
      {...(seite ? { gewaehlt: foto(), onWahl: (id: string) => { setEintrag(null); setBearbeiten(false); setFoto(id); } } : {})} /></Show>,
    mangel: () => <Unterliste titel="Mängel" objekt="bericht_eintrag" fest={fest('mangel')} haupt="text" haken="erledigt" neben={['firma', 'frist']} platzhalter="Mangel eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    aufgabe: () => <Unterliste titel="Zu erledigen" objekt="bericht_eintrag" fest={fest('aufgabe')} haupt="text" haken="erledigt" neben={['frist']} platzhalter="Aufgabe eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    weisung: () => <Unterliste titel="Weisungen" objekt="bericht_eintrag" fest={fest('weisung')} haupt="text" haken="erledigt" neben={['firma', 'frist']} platzhalter="Weisung eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
  };
}

export function WetterHolen(p: { bericht: Zeile }) {
  const [laeuft, setLaeuft] = createSignal(false);
  const holen = async () => {
    setLaeuft(true);
    try {
      const { ort, ...w } = await ruf<{ ort: string; wetter: string; temperatur: number; luftfeuchte: number; wind: number; niederschlag: number }>('/api/wetter', { projekt: p.bericht.werte.projekt, datum: p.bericht.werte.datum, uhrzeit: p.bericht.werte.uhrzeit });
      ausfuehren({ objekt: 'tagesbericht', art: 'aendern', objektId: p.bericht.id, werte: w, herkunft: 'wetterdienst' }, 'Wetter eintragen');
      hinweis(`Wetter für ${ort} eingetragen.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
    finally { setLaeuft(false); }
  };
  return <Show when={darf('tagesbericht', 'schreiben')}><button class="knopf klein still" title="Wetter vom Standort der Baustelle holen" disabled={laeuft()} onClick={holen}>{laeuft() ? 'Wetter wird geholt …' : '📍 Standort'}</button></Show>;
}

/** „Schritt für Schritt“ durch einen Bericht – am Handy auf der Baustelle. */
function Schritte(p: { bericht: Zeile; steuer?: (oeffnen: () => void) => void }) {
  const m = modell('tagesbericht');
  const felder = (gruppe: string) => () => (
    <div class="schritt-felder">
      <For each={m.felder.filter((f) => f.gruppe === gruppe && !f.verborgen)}>{(f) =>
        <FeldEingabe feld={f} wert={sicht.tagesbericht?.[p.bericht.id]?.werte[f.name] ?? null} onWert={(w) => feldAendern(m, sicht.tagesbericht![p.bericht.id]!, f, w)} />}</For>
    </div>
  );
  const l = listen(p.bericht, false);
  const schritte = [
    { titel: 'Wetter', inhalt: () => <><WetterHolen bericht={p.bericht} />{felder('Wetter')()}</> },
    ...ABSCHNITTE.map((a) => ({ titel: a.titel, inhalt: l[a.id]! })),
    { titel: 'Kontrollen', inhalt: felder('Kontrollen') },
  ];
  return <Schrittweise knopf="Schritt für Schritt" titel="Tagesbericht" schritte={schritte} steuer={p.steuer} />;
}

// Werkzeuge des Berichts (Diktieren, Schritt für Schritt) stehen wie im bisherigen Bauportal in der Menüleiste;
// ihre Fenster hängen hier am Bericht – geöffnet über die gemeldeten Funktionen.
interface Werkzeuge { diktat?: () => void; schritte?: () => void }
function Kopf(p: { bericht: Zeile; werkzeuge: Werkzeuge }) {
  const m = modell('tagesbericht');
  const w = () => p.bericht.werte;
  const feld = (n: string) => m.felder.find((f) => f.name === n)!;
  const bauleitung = () => (w().bauleitung ? String(sicht.benutzer?.[String(w().bauleitung)]?.werte.name ?? '') : '');
  const zahl = (x: unknown, e: string) => (x == null || x === '' ? '' : `${Number(x).toLocaleString('de-DE')} ${e}`);
  const wetter = () => [zahl(w().temperatur, '°C'), anzeige(feld('wetter'), w().wetter as never), w().niederschlag == null ? '' : Number(w().niederschlag) ? zahl(w().niederschlag, 'mm') : 'trocken', zahl(w().wind, 'km/h'), zahl(w().luftfeuchte, '%')].filter((x) => x && x !== 'keine Angabe');
  const kontrollen = () => m.felder.filter((f) => f.gruppe === 'Kontrollen' && f.art === 'ja_nein');
  const schreiben = () => darf('tagesbericht', 'schreiben');
  const nichtHeute = () => !!w().datum && w().datum !== heute();
  const projekt = () => (w().projekt ? sicht.projekt?.[String(w().projekt)]?.werte : undefined);
  const baustelle = () => { const x = projekt(); return x ? [x.strasse, [x.plz, x.ort].filter(Boolean).join(' ')].filter(Boolean).map(String).join(', ') : ''; };
  const stift = (gruppe: string) => { setEintrag(null); setFoto(null); setBearbeitenBei(gruppe); setBearbeiten(true); };
  return (
    <>
    <section class="bt-kopf bt-karte" id="abschnitt-kopf" aria-label="Tagesbericht">
      <div class="bt-kopf-zeile">
        <span class="bt-symbol"><Zeichen name="bericht" groesse={18} /></span>
        <div class="bt-kopf-titel">
          <h2>Tagesbericht <span class="bt-nr">Nr. {String(w().nummer ?? '')}</span></h2>
          <p class="bt-info">
            <span classList={{ 'bt-nicht-heute': nichtHeute() }} title={nichtHeute() ? 'Älterer Bericht – Neues kommt in den Bericht von heute' : undefined}>
              <Zeichen name="kalender" groesse={15} />{datumText(w().datum)}{nichtHeute() ? ' · nicht von heute' : ''}{w().uhrzeit ? ` · ${String(w().uhrzeit)} Uhr` : ''}</span>
            <Show when={bauleitung()}><span title="Bauleitung vor Ort"><Zeichen name="person" groesse={15} />{bauleitung()}</span></Show>
            <Show when={projekt()?.bauherr}><span title="Bauherrschaft"><Zeichen name="haus" groesse={15} />{String(projekt()!.bauherr)}</span></Show>
            <Show when={baustelle()}><span class="bt-adresse" title="Baustelle"><Zeichen name="standort" groesse={15} />{baustelle()}</span></Show>
          </p>
        </div>
        <Show when={schreiben()}><button class="knopf bt-stift" aria-label="Kopfdaten bearbeiten" title="Kopfdaten bearbeiten (Nummer, Datum, Uhrzeit, Bauleitung)" onClick={() => stift('Bericht')}><Zeichen name="bearbeiten" groesse={18} /></button></Show>
      </div>
      <div class="bt-kopf-zeile bt-wetter">
        <div class="bt-wetter-inhalt">
        <span><Zeichen name="wetter" groesse={16} /> {wetter().join(' · ') || 'kein Wetter eingetragen'}</span>
        <WetterHolen bericht={p.bericht} />
        <span class="bt-schalter">
          <For each={kontrollen()}>{(f) => (
            <button type="button" role="switch" aria-checked={w()[f.name] === true} classList={{ an: w()[f.name] === true }} disabled={!schreiben()} title={f.titel}
              onClick={() => feldAendern(m, p.bericht, f, w()[f.name] !== true)}><i />{kurz(f)}</button>
          )}</For>
        </span>
        </div>
        <Show when={schreiben()}><button class="knopf bt-stift" aria-label="Wetter bearbeiten" title="Wetter bearbeiten" onClick={() => stift('Wetter')}><Zeichen name="bearbeiten" groesse={18} /></button></Show>
      </div>
      <Show when={darf('bericht_eintrag', 'schreiben')}><span class="bt-werkzeuge"><Diktieren bericht={p.bericht} steuer={(f) => (p.werkzeuge.diktat = f)} /><Schritte bericht={p.bericht} steuer={(f) => (p.werkzeuge.schritte = f)} /></span></Show>
    </section>
    <div class="bt-stand">
      <Verlauf objekt="tagesbericht" id={p.bericht.id} unter={[{ objekt: 'bericht_eintrag', feld: 'bericht' }, { objekt: 'foto', feld: 'bericht' }]} zurueck={darf('tagesbericht', 'schreiben') ? { ohne: ['foto'], hinweis: 'Fotos bleiben' } : undefined}
        vorne={(l) => {
          // Stand des PDF wie im bisherigen Bautagebuch: nie exportiert · exportiert · seit dem Export geändert (eine Änderung nach dem Eintrag des PDF)
          const i = l?.findIndex((e) => e.objekt === 'tagesbericht' && !!e.werte && 'pdf' in e.werte) ?? -1;
          return <Show when={w().pdf} fallback={<span class="still-text">Noch nicht als PDF exportiert</span>}>
            <Show when={i > 0} fallback={<span class="gut-text" title={String(w().pdf)}>✓ Als PDF exportiert: {String(w().pdf)}</span>}>
              <span class="warn-text" title={`Letzter Export: ${String(w().pdf)}`}>Seit dem Export geändert – letzter Export: {String(w().pdf)}</span></Show></Show>;
        }} />
    </div>
    </>
  );
}
const KURZ: Record<string, string> = { aufgeraeumt: 'aufgeräumt', masskontrolle: 'Maßkontrolle', fotodoku: 'Fotos', firmen_angesprochen: 'Firmen angesprochen' };
const kurz = (f: Feld) => KURZ[f.name] ?? f.titel;

function Abschnitt(p: { a: (typeof ABSCHNITTE)[number]; bericht: Zeile; inhalt: () => JSX.Element }) {
  const schluessel = `bp.bautagebuch.zu.${p.a.id}`;
  const [zu, setZu] = createSignal(hole(schluessel, '') === 'zu');
  let karte!: HTMLElement;
  const neu = () => { setZu(false); merke(schluessel, ''); queueMicrotask(() => { karte.scrollIntoView({ behavior: 'smooth', block: 'start' }); karte.querySelector<HTMLElement>('.unterliste-neu, .unterliste .auswahlliste-knopf, .bilder input[type=file], .bilder button')?.focus(); }); };
  neuIn.set(p.a.id, neu); onCleanup(() => { if (neuIn.get(p.a.id) === neu) neuIn.delete(p.a.id); });
  return (
    <section class={`bt-karte bt-${p.a.id}`} id={`abschnitt-${p.a.id}`} ref={karte} aria-label={p.a.titel}>
      <div class="bt-karte-kopf">
        <span class="bt-symbol"><Zeichen name={p.a.zeichen} groesse={18} /></span>
        <h3>{p.a.titel}</h3><span class="bt-anzahl">{anzahl(p.bericht.id, p.a)}</span>
        <Show when={p.a.id === 'anwesend' && personen(p.bericht.id)}><span class="still-text klein-text">{personen(p.bericht.id)} {personen(p.bericht.id) === 1 ? 'Person' : 'Personen'}</span></Show>
        <button class="knopf still" aria-label={zu() ? `${p.a.titel} aufklappen` : `${p.a.titel} zuklappen`} aria-expanded={!zu()} onClick={() => { setZu(!zu()); merke(schluessel, zu() ? 'zu' : ''); }}><span class="bt-klapp" classList={{ zu: zu() }}><Zeichen name="runter" groesse={20} /></span></button>
        <Show when={darf(p.a.id === 'fotos' ? 'foto' : 'bericht_eintrag', 'schreiben')}><button class="knopf bt-plus" aria-label={`${p.a.titel}: neuer Eintrag`} onClick={neu}>+</button></Show>
      </div>
      <Show when={!zu()}>{p.inhalt()}</Show>
    </section>
  );
}

export function Berichtsseite(p: Mitte) {
  // Ohne Wahl: der neueste Bericht – wie beim Aufschlagen des Bautagebuchs
  createEffect(() => {
    if (p.gewaehlt() && sicht.tagesbericht?.[p.gewaehlt()!] && !sicht.tagesbericht[p.gewaehlt()!]!.geloescht) return;
    const neu = [...p.alle()].sort((a, b) => String(b.werte.datum ?? '').localeCompare(String(a.werte.datum ?? '')) || Number(b.werte.nummer ?? 0) - Number(a.werte.nummer ?? 0))[0];
    if (neu) p.onWahl(neu.id);
  });
  createEffect(on(() => p.gewaehlt(), () => { setEintrag(null); setBearbeiten(false); setFoto(null); setFokus(null); }, { defer: true }));
  const bericht = () => (p.gewaehlt() ? sicht.tagesbericht?.[p.gewaehlt()!] : undefined);
  const werkzeuge: Werkzeuge = {};
  // Menüleiste wie im bisherigen Bauportal: NEU Eintrag, Foto, Mangel, Diktieren · BERICHT Schritt für Schritt, Löschen · AUSGABE PDF
  createEffect(() => {
    const b = bericht();
    p.setKnoepfe(b ? [
      // am Handy das ＋ unten: Blatt mit den Abschnitten (Foto, Notiz, Mangel …)
      ...(darf('bericht_eintrag', 'schreiben') ? [{ titel: 'Foto, Notiz, Mangel … hinzufügen', zeichen: 'neu', gruppe: 'Neu', nurHandy: true, handyPlus: true, tun: () => setHinzu(true) }] : []),
      ...(darf('bericht_eintrag', 'schreiben') ? [{ titel: 'Eintrag', zeichen: 'notiz', gruppe: 'Neu', tun: () => neuIn.get('notiz')?.() }] : []),
      ...(darf('foto', 'schreiben') ? [{ titel: 'Foto', zeichen: 'foto', gruppe: 'Neu', tun: () => neuIn.get('fotos')?.() }] : []),
      ...(darf('bericht_eintrag', 'schreiben') ? [{ titel: 'Mangel', zeichen: 'mangel', gruppe: 'Neu', tun: () => neuIn.get('mangel')?.() },
        { titel: 'Diktieren', zeichen: 'diktieren', gruppe: 'Neu', tun: () => werkzeuge.diktat?.() },
        { titel: 'Schritt für Schritt', zeichen: 'schrittweise', gruppe: 'Bericht', tun: () => werkzeuge.schritte?.() }] : []),
      ...(darf('tagesbericht', 'loeschen') ? [{ titel: 'Löschen', zeichen: 'loeschen', rot: true, gruppe: 'Bericht', tun: () => loesche(modell('tagesbericht'), b) }] : []),
      ...ausdrucke('tagesbericht').map((a) => ({ titel: 'PDF', zeichen: 'pdf', gruppe: 'Ausgabe', rechts: true, tun: () => druckOeffnen(a.id, b.id) })),
    ] : []);
  });
  return (
    <div class="bt-seite">
      <Show when={bericht()} fallback={<p class="leer">{p.alle().length ? 'Links einen Bericht wählen.' : darf('tagesbericht', 'schreiben') ? 'Noch kein Tagesbericht. Mit „+ Tagesbericht“ legst du den ersten an.' : 'Noch kein Tagesbericht.'}</p>}>{(b) => {
        const l = listen(b(), true);
        return (<>
          <Show when={handy() ? fokus() : null} keyed fallback={<>
            <Kopf bericht={b()} werkzeuge={werkzeuge} />
            <Show when={darf('bericht_eintrag', 'lesen')}>
              <Show when={handy()} fallback={<For each={ABSCHNITTE}>{(a) => <Abschnitt a={a} bericht={b()} inhalt={l[a.id]!} />}</For>}>
                <div class="bt-kacheln">
                  <For each={ABSCHNITTE}>{(a) => (
                    <button type="button" class="bt-kachel" onClick={() => setFokus(a.id)}>
                      <span class="bt-symbol"><Zeichen name={a.zeichen} groesse={18} /></span><b>{a.titel}</b>
                      <Show when={anzahl(b().id, a)} fallback={<small class="still-text">{a.id === 'fotos' ? 'noch keine' : 'leer'}</small>}>
                        <span class="anzahl">{anzahl(b().id, a)}</span><Show when={offen(b().id, a)}><small class="gefahr-text">{offen(b().id, a)} offen</small></Show>
                      </Show>
                    </button>
                  )}</For>
                </div>
              </Show>
            </Show>
          </>}>
            {/* je Abschnitt neu aufgebaut (keyed): beim Zurück fragt nichts mehr nach dem geschlossenen Abschnitt */}
            {(f) => { const a = ABSCHNITTE.find((x) => x.id === f)!; return (<>
              <button type="button" class="knopf still bt-zurueck" onClick={() => setFokus(null)}>‹ Bericht</button>
              <Abschnitt a={a} bericht={b()} inhalt={l[a.id]!} />
            </>); }}
          </Show>
          <Show when={hinzu()}>
            <Dialog titel="Hinzufügen" onAbbrechen={() => setHinzu(false)} knoepfe={<button class="knopf" onClick={() => setHinzu(false)}>Abbrechen</button>}>
              <div class="bt-kacheln">
                <For each={ABSCHNITTE.filter((a) => darf(a.id === 'fotos' ? 'foto' : 'bericht_eintrag', 'schreiben'))}>{(a) => (
                  <button type="button" class="bt-kachel" onClick={() => { setHinzu(false); setFokus(a.id); queueMicrotask(() => neuIn.get(a.id)?.()); }}>
                    <span class="bt-symbol"><Zeichen name={a.zeichen} groesse={18} /></span><b>{a.id === 'fotos' ? 'Foto' : a.titel}</b>
                  </button>
                )}</For>
                <Show when={darf('bericht_eintrag', 'schreiben')}>
                  <button type="button" class="bt-kachel" onClick={() => { setHinzu(false); werkzeuge.diktat?.(); }}><span class="bt-symbol"><Zeichen name="diktieren" groesse={18} /></span><b>Diktieren</b></button>
                </Show>
              </div>
            </Dialog>
          </Show>
        </>);
      }}</Show>
    </div>
  );
}

// ---------- rechts: das Detail des angeklickten Eintrags oder der Bericht zum Bearbeiten ----------
export function BerichtDetails(z: Zeile): JSX.Element | undefined {
  const fotos = () => lebende('foto').filter((f) => f.werte.bericht === z.id).sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0) || String(a.werte.name).localeCompare(String(b.werte.name)));
  return (
    <Show when={!(foto() && fotos().some((f) => f.id === foto()))} fallback={<FotoGross objekt="foto" id={foto()!} alle={fotos()} beschriftung="beschriftung" onWahl={setFoto} onZu={() => setFoto(null)} />}>
    <Show when={eintrag() && sicht.bericht_eintrag?.[eintrag()!] && !sicht.bericht_eintrag[eintrag()!]!.geloescht ? sicht.bericht_eintrag[eintrag()!] : undefined}
      fallback={<Show when={bearbeiten()}><Detailkarte modell={modell('tagesbericht')} zeile={z} onZu={() => setBearbeiten(false)} verborgen={['projekt']} gruppe={bearbeitenBei()} /></Show>}>
      {(e) => <Detailkarte modell={modell('bericht_eintrag')} zeile={e()} onZu={() => setEintrag(null)} verborgen={['projekt', 'bericht', 'reihe']} />}
    </Show>
    </Show>
  );
}
/** Rechts ist nur etwas, wenn ein Eintrag gewählt ist oder der Bericht bearbeitet wird – sonst bekommt die Seite den Platz. */
export const berichtDetailsDa = () => !!eintrag() || bearbeiten() || !!foto();
