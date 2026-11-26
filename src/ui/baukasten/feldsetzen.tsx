// Baustein „Gemeinsam bearbeiten“: mehrere Einträge (die gewählten oder die gefilterten) in einer Maske ändern – dieselbe
// für jedes Objekt (Gebäudemodell, Adressen, Bauzeitenplan …). Die Maske zeigt die Felder wie die Karte, nach Abschnitten;
// wo alle Einträge denselben Wert haben, steht er drin, sonst „verschieden“ mit den häufigsten Werten. Was geändert wird,
// ist markiert und lässt sich einzeln zurücknehmen; OK setzt alle Änderungen bei allen in einem Schritt (ein Rückgängig).
// Felder, die eindeutig sein müssen, verborgen sind oder vom Zusammenhang kommen, stehen nicht in der Maske; ein Feld mit
// Bedingung („wenn“) wird nur bei den Einträgen gesetzt, für die es gilt.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { gilt, type Feld, type Wert, type Werte } from '../../kern/modell';
import type { Vorlage } from '../../kern/befehl';
import { ausfuehrenMehrere, rueckgaengig, sicht } from '../unterbau/abgleich';
import { modell } from '../unterbau/api';
import { hinweis } from '../unterbau/meldungen';
import { Dialog } from './dialog';
import { FeldEingabe, anzeige } from './feld';

const [offen, setOffen] = createSignal<{ objekt: string; ids: string[]; fest: string[]; wie?: string } | null>(null);
/** fest: Felder, die der Zusammenhang vorgibt (Projekt, Version) – nicht in der Maske. wie: woher die Einträge kommen („gefiltert“, „gewählt“). */
export const feldSetzenOeffnen = (objekt: string, ids: string[], fest: string[] = [], wie?: string) => setOffen({ objekt, ids, fest, wie });

const gleich = (a: Wert | undefined, b: Wert | undefined) => (a ?? null) === (b ?? null) || ((a ?? '') === '' && (b ?? '') === '');

function Fenster(p: { objekt: string; ids: string[]; fest: string[]; wie?: string }) {
  const m = modell(p.objekt);
  const eintraege = p.ids.map((id) => sicht[p.objekt]?.[id]).filter((z) => z && !z.geloescht).map((z) => z!);
  const n = eintraege.length, zu = () => setOffen(null);
  const name = (k: number) => (k === 1 ? m.titel : m.titelMehrzahl);
  // je Feld: bei wie vielen es gilt und welche Werte dort stehen (häufigste zuerst)
  const stand = m.felder.filter((f) => !f.verborgen && !f.eindeutig && !p.fest.includes(f.name) && f.name !== m.anzeigeFeld).map((f) => {
    const bei = eintraege.filter((z) => gilt(f, z.werte, m));
    const zahl = new Map<string, { w: Wert; n: number }>();
    for (const z of bei) { const w = z.werte[f.name] ?? null, k = JSON.stringify(w === '' ? null : w); const x = zahl.get(k); if (x) x.n++; else zahl.set(k, { w, n: 1 }); }
    return { f, bei: bei.length, werte: [...zahl.values()].sort((a, b) => b.n - a.n) };
  }).filter((s) => s.bei > 0);
  const abschnitte: { titel: string; felder: typeof stand }[] = [];
  for (const s of stand) { const t = s.f.gruppe ?? ''; (abschnitte.find((a) => a.titel === t) ?? (abschnitte.push({ titel: t, felder: [] }), abschnitte[abschnitte.length - 1]!)).felder.push(s); }

  const [neu, setNeu] = createStore<Werte>({});   // nur die geänderten Felder
  const geaendert = createMemo(() => Object.keys(neu));
  const setzen = (f: Feld, w: Wert) => setNeu(f.name, w);
  const zuruecknehmen = (f: Feld) => setNeu(produce((x) => { delete x[f.name]; }));

  const ok = () => {
    const felder = stand.filter((s) => s.f.name in neu);
    const vs: Vorlage[] = [];
    for (const z of eintraege) {
      const werte: Werte = {};
      for (const { f } of felder) if (gilt(f, z.werte, m) && !gleich(z.werte[f.name], neu[f.name])) werte[f.name] = neu[f.name] ?? null;
      if (Object.keys(werte).length) vs.push({ objekt: p.objekt, art: 'aendern', objektId: z.id, werte });
    }
    zu();
    if (!vs.length) { hinweis(`Nichts zu ändern – alle ${n} hatten diese Werte schon.`); return; }
    const was = felder.length === 1 ? felder[0]!.f.titel : `${felder.length} Felder`;
    ausfuehrenMehrere(vs, `${was} geändert – ${vs.length} ${name(vs.length)}`);
    hinweis(`${was} geändert – ${vs.length} ${name(vs.length)}.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };

  const wertText = (f: Feld, w: Wert) => ((w ?? '') === '' ? 'leer' : anzeige(f, w) || String(w));
  return (
    <Dialog titel={`Gemeinsam bearbeiten – ${n} ${name(n)}${p.wie ? ` (${p.wie})` : ''}`} gross onAbbrechen={zu} geaendert={() => geaendert().length > 0}
      knoepfe={<><button class="knopf" data-abbrechen onClick={zu}>Abbrechen</button>
        <button class="knopf haupt" disabled={!geaendert().length} onClick={ok}>{geaendert().length ? `Bei allen ${n} übernehmen` : 'OK'}</button></>}>
      <div class="sammel">
      <div class="sammel-kopf">
        <span>Was du hier einträgst, gilt für alle {n} {name(n)}. Felder mit unterschiedlichen Werten sind als <b>verschieden</b> gekennzeichnet – sie bleiben, wie sie sind, bis du etwas einträgst.</span>
        <Show when={geaendert().length}><span class="sammel-zahl">{geaendert().length} {geaendert().length === 1 ? 'Feld' : 'Felder'} geändert</span></Show>
      </div>
      <div class="sammel-maske">
        <For each={abschnitte}>{(a) => (
          <fieldset><Show when={a.titel}><legend>{a.titel}</legend></Show>
            <For each={a.felder}>{(s) => {
              const da = () => s.f.name in neu;
              const verschieden = s.werte.length > 1 || s.bei < n;
              const wert = () => (da() ? neu[s.f.name] ?? null : s.werte.length === 1 ? s.werte[0]!.w ?? null : null);
              return (
                <div class="sammel-feld" classList={{ geaendert: da(), verschieden: verschieden && !da(), breit: ['langtext', 'mehrfach', 'schlagworte'].includes(s.f.art) }}>
                  <FeldEingabe feld={{ ...s.f, pflicht: false }} wert={wert()} objekt={p.objekt} sofort={!['auswahl', 'verweis', 'ja_nein', 'mehrfach'].includes(s.f.art)} onWert={(w) => setzen(s.f, w)} />
                  <div class="sammel-stand">
                    <Show when={da()} fallback={
                      <Show when={verschieden} fallback={<span>{(s.werte[0]?.w ?? '') === '' ? 'bei allen leer' : 'bei allen gleich'}</span>}>
                        <span class="sammel-verschieden">verschieden</span>
                        <span>{s.werte.slice(0, 3).map((x) => `${wertText(s.f, x.w)} (${x.n})`).join(' · ')}{s.werte.length > 3 ? ` · ${s.werte.length - 3} weitere` : ''}</span>
                      </Show>}>
                      <span class="sammel-neu">wird bei {s.bei === n ? `allen ${n}` : `${s.bei} von ${n}`} gesetzt</span>
                      <button type="button" class="knopf klein still" title="Dieses Feld nicht ändern" onClick={() => zuruecknehmen(s.f)}>↺ zurücknehmen</button>
                    </Show>
                    <Show when={!da() && s.bei < n}><span class="still-text">gilt nur für {s.bei} von {n}</span></Show>
                  </div>
                </div>
              );
            }}</For>
          </fieldset>
        )}</For>
      </div>
      </div>
    </Dialog>
  );
}

/** Einmal in der App eingehängt. */
export function FeldSetzen() {
  return <Show when={offen()} keyed>{(o) => <Fenster objekt={o.objekt} ids={o.ids} fest={o.fest} wie={o.wie} />}</Show>;
}
