// Leistungskatalog → Abhängigkeiten (wie im bisherigen Bauportal): eine Leistung steht in der Mitte (Richtdauer, Art), links
// ihre Vorgänger, rechts ihre Nachfolger; Klick auf eine Kiste holt sie in die Mitte. „＋ Vorgänger …“ / „＋ Nachfolger …“
// oder eine Leistung aus der Liste links auf eine Seite ziehen = neue Abhängigkeit; ✕ löst sie; Klick auf den Pfeil
// wechselt Ende → Anfang / Anfang → Anfang, daneben der Abstand. Kreise lehnt die Ansicht ab. Darunter die Probe: die
// Gesamtbauzeit für ein Beispielgebäude mit dem Katalog, wie er jetzt ist – und wie er beim Öffnen war.
// Neu geschrieben; gespeichert wird in „folgt auf“ der Leistung (dieselbe Schreibweise, die der Planungsassistent liest).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { assistent, katalogAus, type Katalog } from '../module/bauzeitenplan/assistent';
import { planAus } from '../module/bauzeitenplan/plan';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { ausfuehren, lebende } from './unterbau/abgleich';
import { darf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

type Art = 'ea' | 'aa';
interface Bezug { id: string; art: Art; abstand: number }
const kennung = (z: Zeile) => String(z.werte.kennung || '') || `eigen:${String(z.werte.name ?? '')}`;
const lesen = (w: unknown): Bezug[] => String(w ?? '').split(/\s+/).filter(Boolean).map((x) => {
  const [id, art, ab] = x.split(':');
  return { id: id!, art: ['ss', 'aa'].includes((art ?? '').toLowerCase()) ? 'aa' : 'ea', abstand: Number(ab ?? 0) || 0 };
});
const schreiben = (l: Bezug[]) => l.map((b) => (b.art === 'ea' && !b.abstand ? b.id : `${b.id}:${b.art}${b.abstand ? `:${b.abstand}` : ''}`)).join(' ');
const PFEIL: Record<Art, string> = { ea: 'Ende → Anfang', aa: 'Anfang → Anfang' };

// Beispielgebäude der Probe – Gebäudeart, Maßnahme und Größe aus den Regeln des Assistenten
const PROBEN = [
  { k: 'efh', titel: 'Einfamilienhaus 160 m²', groesse: 'efh', basis: 'neubau_efh', flaeche: 160, einheiten: 1 },
  { k: 'mfh', titel: 'Mehrfamilienhaus 6 WE', groesse: 'mfh', basis: 'neubau_mfh', flaeche: 480, einheiten: 6 },
  { k: 'san', titel: 'Sanierung EFH', groesse: 'efh', basis: 'kern_efh', flaeche: 140, einheiten: 1 },
];
function bauzeit(k: Katalog, probe: typeof PROBEN[number]): number | null {
  const geb = k.kombi.geb.find((g) => g.groesse === probe.groesse), mass = k.kombi.mass.find((m) => m.base?.[probe.groesse] === probe.basis);
  if (!geb || !mass) return null;
  const as = assistent(k, { geb: geb.k, mass: [mass.k], ber: [], denkmal: false, flaeche: probe.flaeche, einheiten: probe.einheiten, geschosse: 0, dg: '', takt: 'versetzt', wahl: {} });
  if (!as) return null;
  const p = as.plan();
  const plan = planAus({ vorgaenge: p.zeilen.map((z) => ({ id: z.kennung, werte: z.werte })), links: p.links.map((l) => ({ id: l.kennung, werte: { ...l.werte, von: l.von, nach: l.nach } })),
    frei: [], land: 'DE', heute: '2026-01-05' });
  return plan.erg.ende;
}

/** Links: alle Leistungen nach Abschnitt – anklicken holt sie in die Mitte, ziehen auf eine Seite verknüpft. */
export function KatalogListe(p: Mitte) {
  const [such, setSuch] = createSignal('');
  const gruppen = createMemo(() => {
    const t = such().trim().toLowerCase(), g = new Map<string, Zeile[]>();
    for (const z of [...p.alle()].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0))) {
      if (t && !String(z.werte.name ?? '').toLowerCase().includes(t)) continue;
      const a = String(z.werte.abschnitt || 'ohne Abschnitt'); (g.get(a) ?? g.set(a, []).get(a)!).push(z);
    }
    return [...g];
  });
  return (
    <div class="kn-liste">
      <input class="seitenliste-suche" type="search" placeholder="Leistung suchen" aria-label="Leistung suchen" value={such()} onInput={(e) => setSuch(e.currentTarget.value)} />
      <p class="still-text klein-text">auf eine Seite ziehen = Abhängigkeit</p>
      <For each={gruppen()}>{([titel, l]) => (
        <details open={!!such() || l.some((z) => z.id === p.gewaehlt())}>
          <summary><b>{titel}</b> <span class="still-text">{l.length}</span></summary>
          <For each={l}>{(z) => (
            <button type="button" class="kn-eintrag" classList={{ aktiv: z.id === p.gewaehlt() }} draggable={true}
              onDragStart={(e) => { e.dataTransfer!.setData('text/plain', z.id); e.dataTransfer!.effectAllowed = 'link'; }} onClick={() => p.onWahl(z.id)}>{String(z.werte.name ?? '')}</button>
          )}</For>
        </details>
      )}</For>
    </div>
  );
}

/** Mitte: Vorgänger | Leistung | Nachfolger; die Probe direkt unter der Leistung – beide bleiben stehen, wenn die Listen daneben lang sind. */
export function KatalogNetz(p: Mitte) {
  const schreibenDarf = () => darf('leistungsvorlage', 'schreiben');
  const nachKennung = createMemo(() => new Map(p.alle().map((z) => [kennung(z), z])));
  const mitte = createMemo(() => p.alle().find((z) => z.id === p.gewaehlt()) ?? [...p.alle()].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0))[0]);
  const vor = createMemo(() => (mitte() ? lesen(mitte()!.werte.vorgaenger).filter((b) => nachKennung().has(b.id)) : []));
  const nach = createMemo(() => { const m = mitte(); if (!m) return []; const k = kennung(m); return p.alle().flatMap((z) => lesen(z.werte.vorgaenger).filter((b) => b.id === k).map((b) => ({ z, b }))); });
  // liegt „ziel“ vor „id“? Dann gäbe ein Pfeil id → ziel einen Kreis
  const vorfahr = (id: string, ziel: string, gesehen = new Set<string>()): boolean => {
    if (id === ziel) return true;
    if (gesehen.has(id)) return false; gesehen.add(id);
    const z = nachKennung().get(id);
    return !!z && lesen(z.werte.vorgaenger).some((b) => vorfahr(b.id, ziel, gesehen));
  };
  const setzen = (z: Zeile, l: Bezug[], titel: string) => ausfuehren({ objekt: 'leistungsvorlage', art: 'aendern', objektId: z.id, werte: { vorgaenger: schreiben(l) } }, titel);
  const name = (z: Zeile | undefined) => String(z?.werte.name ?? '');
  /** neuer Pfeil von → nach (beides Leistungen) */
  const verbinden = (vonZ: Zeile, nachZ: Zeile) => {
    const v = kennung(vonZ), n = kennung(nachZ), l = lesen(nachZ.werte.vorgaenger);
    if (v === n || l.some((b) => b.id === v)) return;
    if (vorfahr(v, n)) { hinweis(`„${name(nachZ)}“ liegt schon vor „${name(vonZ)}“ – das gäbe einen Kreis.`, { art: 'fehler' }); return; }
    setzen(nachZ, [...l, { id: v, art: 'ea', abstand: 0 }], `„${name(vonZ)}“ vor „${name(nachZ)}“`);
  };
  const loesen = (nachZ: Zeile, id: string) => setzen(nachZ, lesen(nachZ.werte.vorgaenger).filter((b) => b.id !== id), `Abhängigkeit von „${name(nachZ)}“ gelöst`);
  const aendern = (nachZ: Zeile, id: string, w: Partial<Bezug>) => setzen(nachZ, lesen(nachZ.werte.vorgaenger).map((b) => (b.id === id ? { ...b, ...w } : b)), `Abhängigkeit von „${name(nachZ)}“ geändert`);
  const fallen = (e: DragEvent, seite: 'vor' | 'nach') => {
    e.preventDefault();
    const z = p.alle().find((x) => x.id === e.dataTransfer?.getData('text/plain')), m = mitte();
    if (!z || !m || !schreibenDarf()) return;
    if (seite === 'vor') verbinden(z, m); else verbinden(m, z);
  };
  const optionen = () => p.alle().filter((z) => z.id !== mitte()?.id).map((z) => ({ wert: z.id, titel: name(z) })).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  const art = (z: Zeile) => (z.werte.meilenstein ? 'Meilenstein' : z.werte.fest ? 'feste Dauer' : 'wächst mit der Fläche');

  const Kiste = (q: { z: Zeile; b: Bezug; ziel: Zeile; id: string }) => (
    <div class="kn-bezug">
      <div class="kn-pfeil">
        <button type="button" class="knopf mini still" disabled={!schreibenDarf()} title="Klick: Ende → Anfang ↔ Anfang → Anfang" onClick={() => aendern(q.ziel, q.id, { art: q.b.art === 'ea' ? 'aa' : 'ea' })}>{PFEIL[q.b.art]} ↓</button>
        <label class="kn-abstand" title="Abstand in Arbeitstagen">+<input type="number" value={q.b.abstand} disabled={!schreibenDarf()} aria-label="Abstand in Arbeitstagen"
          onChange={(e) => aendern(q.ziel, q.id, { abstand: Number(e.currentTarget.value) || 0 })} /> AT</label>
      </div>
      <div class="kn-kiste" role="button" tabindex="0" onClick={() => p.onWahl(q.z.id)} onKeyDown={(e) => { if (e.key === 'Enter') p.onWahl(q.z.id); }}>
        <b>{name(q.z)}</b>
        <small>{[q.z.werte.gewerk, art(q.z), `${Number(q.z.werte.dauer ?? 0)} AT`].filter(Boolean).join(' · ')}</small>
        <Show when={schreibenDarf()}><button type="button" class="kn-weg" aria-label="Abhängigkeit lösen" title="Abhängigkeit lösen" onClick={(e) => { e.stopPropagation(); loesen(q.ziel, q.id); }}>✕</button></Show>
      </div>
    </div>
  );

  // Probe: Gesamtbauzeit mit dem Katalog jetzt – und wie er beim Öffnen war
  const katalog = createMemo(() => katalogAus(lebende('leistungsvorlage'), lebende('planregel')));
  const [probe, setProbe] = createSignal(PROBEN[0]!);
  const jetzt = createMemo(() => bauzeit(katalog(), probe()));
  const anfang = new Map<string, number | null>();
  const vorher = () => { const k = probe().k; if (!anfang.has(k)) anfang.set(k, jetzt()); return anfang.get(k); };

  return (
    <div class="kn">
      <Show when={mitte()} fallback={<p class="still-text">Der Leistungskatalog ist leer.</p>}>{(m) => (
        <div class="kn-spalten">
          <section class="kn-seite" onDragOver={(e) => e.preventDefault()} onDrop={(e) => fallen(e, 'vor')} aria-label="Vorgänger">
            <h3>Vorgänger</h3>
            <For each={vor()}>{(b) => <Kiste z={nachKennung().get(b.id)!} b={b} ziel={m()} id={b.id} />}</For>
            <Show when={schreibenDarf()}><Auswahlliste titel="Vorgänger hinzufügen" platzhalter="＋ Vorgänger …" wert={null} optionen={optionen()}
              onWert={(id) => { const z = p.alle().find((x) => x.id === id); if (z) verbinden(z, m()); }} /></Show>
          </section>
          <div class="kn-mittelspalte">
            <section class="kn-mitte">
              <h3>{name(m())}</h3>
              <p class="still-text klein-text">{[m().werte.abschnitt, m().werte.gewerk].filter(Boolean).join(' · ')}</p>
              <label class="kn-feld">Richtdauer <input type="number" min="0" value={Number(m().werte.dauer ?? 0)} disabled={!schreibenDarf()} aria-label="Richtdauer in Arbeitstagen"
                onChange={(e) => ausfuehren({ objekt: 'leistungsvorlage', art: 'aendern', objektId: m().id, werte: { dauer: Number(e.currentTarget.value) || 0 } }, `Richtdauer von „${name(m())}“`)} /> AT</label>
              <div class="auswahl" role="radiogroup" aria-label="Art der Dauer">
                <For each={[{ w: false, t: 'wächst mit der Fläche' }, { w: true, t: 'feste Dauer' }]}>{(o) => (
                  <button type="button" role="radio" aria-checked={(m().werte.fest === true) === o.w} classList={{ aktiv: (m().werte.fest === true) === o.w }} disabled={!schreibenDarf()}
                    onClick={() => ausfuehren({ objekt: 'leistungsvorlage', art: 'aendern', objektId: m().id, werte: { fest: o.w } }, `Art der Dauer von „${name(m())}“`)}>{o.t}</button>
                )}</For>
              </div>
              <p class="still-text klein-text">Die Richtdauer gilt für ein Einfamilienhaus mit {katalog().ref.bau} m²; mit „wächst mit der Fläche“ passt das Programm sie der Größe an.</p>
            </section>
            <div class="kn-probe">
              <b>Probe</b>
              <div class="auswahl" role="radiogroup" aria-label="Beispielgebäude">
                <For each={PROBEN}>{(x) => <button type="button" role="radio" aria-checked={probe().k === x.k} classList={{ aktiv: probe().k === x.k }} onClick={() => setProbe(x)}>{x.titel}</button>}</For>
              </div>
              <span>{jetzt() === null ? 'für diese Gebäudeart fehlen Regeln' : <>Gesamtbauzeit <b>{jetzt()} AT</b><Show when={vorher() !== null && vorher() !== jetzt()}> (vorher {vorher()} AT)</Show></>}</span>
            </div>
          </div>
          <section class="kn-seite" onDragOver={(e) => e.preventDefault()} onDrop={(e) => fallen(e, 'nach')} aria-label="Nachfolger">
            <h3>Nachfolger</h3>
            <For each={nach()}>{(x) => <Kiste z={x.z} b={x.b} ziel={x.z} id={kennung(m())} />}</For>
            <Show when={schreibenDarf()}><Auswahlliste titel="Nachfolger hinzufügen" platzhalter="＋ Nachfolger …" wert={null} optionen={optionen()}
              onWert={(id) => { const z = p.alle().find((x) => x.id === id); if (z) verbinden(m(), z); }} /></Show>
          </section>
        </div>
      )}</Show>
    </div>
  );
}
