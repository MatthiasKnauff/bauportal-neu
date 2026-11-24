// Verwaltung → Aufbau (Punkt 31): der Aufbau des Programms als Bild – erzeugt aus dem laufenden Programm, nicht von
// Hand gepflegt. Drei Sichten: „Daten“ (Module, Objekte und ihre Verweise), „Code“ (jede Datei ein Baustein, Linien =
// bindet ein) und „Betrieb“ (Server-Stellen, Hilfsdienste, Tabellen). Rechts steht, was der gewählte Baustein ist.
import { For, Show, createMemo, createResource, createSignal, type JSX } from 'solid-js';
import type { ObjektModell } from '../kern/modell';
import { ruf, zustand } from './api';
import { Rahmen } from './baukasten/rahmen';

interface Baustein { pfad: string; bereich: string; zeilen: number; beschreibung: string; bindetEin: string[]; stelltBereit: string[] }
interface Aufbau {
  quelltext: { erzeugt: string; bereiche: { id: string; titel: string; text: string }[]; bausteine: Baustein[] } | null;
  routen: string[]; dienste: { name: string; zweck: string; erreichbar: boolean; version: string }[]; tabellen: { name: string; zeilen: string }[];
}
interface Knoten { id: string; titel: string; spalte: number; zeile: number; unter?: string }
const B = 196, H = 26, LUECKE = 5, ABSTAND = 62, KOPF = 44;   // Maße des Bildes

/** Zeichnet Spalten mit Knoten und die Linien dazwischen; der gewählte Knoten hebt seine Linien hervor. */
function Bild(p: { spalten: { titel: string; unter?: string }[]; knoten: Knoten[]; kanten: [string, string][]; gewaehlt: string; onWahl: (id: string) => void; hin: string; her: string }) {
  const ort = createMemo(() => new Map(p.knoten.map((k) => [k.id, { x: k.spalte * (B + ABSTAND) + 8, y: KOPF + k.zeile * (H + LUECKE) }])));
  const hoehe = () => KOPF + (Math.max(0, ...p.knoten.map((k) => k.zeile)) + 1) * (H + LUECKE) + 12;
  const linie = ([von, nach]: [string, string]) => {
    const a = ort().get(von), b = ort().get(nach);
    if (!a || !b) return '';
    if (a.x === b.x) { const x = a.x + B, r = 16 + Math.min(40, Math.abs(a.y - b.y) / 8); return `M${x},${a.y + H / 2} C${x + r},${a.y + H / 2} ${x + r},${b.y + H / 2} ${x},${b.y + H / 2}`; }   // gleiche Spalte: Bogen rechts herum
    const [x1, x2] = a.x < b.x ? [a.x + B, b.x] : [a.x, b.x + B];
    const m = (x1 + x2) / 2;
    return `M${x1},${a.y + H / 2} C${m},${a.y + H / 2} ${m},${b.y + H / 2} ${x2},${b.y + H / 2}`;
  };
  const art = (k: [string, string]) => (p.gewaehlt && k[0] === p.gewaehlt ? 'hin' : p.gewaehlt && k[1] === p.gewaehlt ? 'her' : '');
  const nachbar = createMemo(() => new Set(p.kanten.filter((k) => k[0] === p.gewaehlt || k[1] === p.gewaehlt).flat()));
  return (
    <div class="aufbau-bild">
      <svg width={p.spalten.length * (B + ABSTAND)} height={hoehe()} role="img" aria-label="Aufbau des Programms">
        <For each={p.spalten}>{(s, i) => <text x={i() * (B + ABSTAND) + 8} y={18} class="spalte">{s.titel}<Show when={s.unter}><tspan class="unter" dx="6">{s.unter}</tspan></Show></text>}</For>
        <g class="linien"><For each={p.kanten.filter((k) => !art(k))}>{(k) => <path d={linie(k)} />}</For></g>
        <g class="linien stark"><For each={p.kanten.filter((k) => art(k))}>{(k) => <path d={linie(k)} class={art(k)} />}</For></g>
        <For each={p.knoten}>{(k) => { const o = () => ort().get(k.id)!; return (
          <g class="knoten" classList={{ gewaehlt: p.gewaehlt === k.id, nachbar: nachbar().has(k.id) && p.gewaehlt !== k.id, blass: !!p.gewaehlt && !nachbar().has(k.id) && p.gewaehlt !== k.id }}
            tabindex="0" role="button" aria-label={k.titel} onClick={() => p.onWahl(p.gewaehlt === k.id ? '' : k.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onWahl(k.id); } }}>
            <rect x={o().x} y={o().y} width={B} height={H} rx="6" />
            <text x={o().x + 9} y={o().y + 17}>{k.titel.length > 23 ? k.titel.slice(0, 22) + '…' : k.titel}</text>
            <Show when={k.unter}><text x={o().x + B - 8} y={o().y + 17} class="unter" text-anchor="end">{k.unter}</text></Show>
          </g>); }}</For>
      </svg>
      <p class="still-text klein-text aufbau-legende"><i class="hin" /> {p.hin} <i class="her" /> {p.her} – Baustein anklicken.</p>
    </div>
  );
}

export function AufbauAnsicht() {
  const [a] = createResource(() => ruf<Aufbau>('/api/aufbau'));
  const [sicht, setSicht] = createSignal<'daten' | 'code' | 'betrieb'>('daten');
  const [wahl, setWahl] = createSignal('');
  const module = () => zustand()!.module;
  const objekte = createMemo(() => new Map(module().flatMap((m) => m.objekte.map((o) => [o.name, { o, modul: m }] as const))));
  const wechsel = (s: 'daten' | 'code' | 'betrieb') => { setSicht(s); setWahl(''); };

  // Sicht „Daten“: je Modul eine Spalte, darin seine Objekte; Linien sind Verweise
  const daten = createMemo(() => ({
    spalten: module().map((m) => ({ titel: m.name, unter: `${m.objekte.length}` })),
    knoten: module().flatMap((m, s) => m.objekte.map((o, z): Knoten => ({ id: o.name, titel: o.titel, spalte: s, zeile: z, unter: `${o.felder.length} Felder` }))),
    kanten: [...objekte().values()].flatMap(({ o }) => [...new Set(o.felder.filter((f) => f.art === 'verweis' && f.ziel !== o.name).map((f) => f.ziel!))].map((ziel): [string, string] => [o.name, ziel])),
  }));
  // Sicht „Code“: je Bereich eine Spalte, darin die Dateien; Linien sind „bindet ein“
  const code = createMemo(() => {
    const q = a()?.quelltext;
    if (!q) return null;
    const bereiche = q.bereiche.filter((b) => b.id !== 'betrieb');
    const knoten = bereiche.flatMap((b, s) => q.bausteine.filter((d) => d.bereich === b.id).map((d, z): Knoten => ({ id: d.pfad, titel: d.pfad.replace(/^src\/(kern|server|ui\/baukasten|ui|module)\//, '').replace(/^dienste\//, '').replace('/beipackzettel.ts', ''), spalte: s, zeile: z, unter: String(d.zeilen) })));
    const da = new Set(knoten.map((k) => k.id));
    return { spalten: bereiche.map((b) => ({ titel: b.titel, unter: `${knoten.filter((k) => k.spalte === bereiche.indexOf(b)).length}` })), knoten, kanten: q.bausteine.flatMap((d) => d.bindetEin.filter((z) => da.has(d.pfad) && da.has(z)).map((z): [string, string] => [d.pfad, z])) };
  });

  const liste = (titel: string, eintraege: string[], waehlen = true): JSX.Element => (
    <Show when={eintraege.length}><fieldset><legend>{titel}<span class="anzahl">{eintraege.length}</span></legend>
      <ul class="aufbau-liste"><For each={eintraege}>{(e) => <li>{waehlen ? <button class="verweis" onClick={() => setWahl(e)}>{e}</button> : <code>{e}</code>}</li>}</For></ul></fieldset></Show>
  );
  const objektKarte = (o: ObjektModell, modul: string) => (
    <aside class="karte" aria-label={o.titel}><div class="karte-kopf"><h2>{o.titel}</h2></div><div class="karte-inhalt">
      <p class="still-text">Objekt <code>{o.name}</code> im Modul {modul}{o.projektFeld ? ' · gehört zu einem Projekt' : ''}{o.versionsBereich ? ` · in Versionen (${o.versionsBereich})` : ''}{o.einzeln ? ' · gibt es genau einmal' : ''}</p>
      <p class="still-text klein-text">Sehen: {o.rechte.lesen.join(', ') || 'nur Admin'} · Ändern: {o.rechte.schreiben.join(', ') || 'nur Admin'} · Löschen: {o.rechte.loeschen.join(', ') || 'nur Admin'} (ab Werk)</p>
      <table class="matrix aufbau-felder"><thead><tr><th>Feld</th><th>Art</th><th>Beschriftung</th></tr></thead><tbody>
        <For each={o.felder}>{(f) => <tr><td><code>{f.name}</code>{f.pflicht ? ' *' : ''}</td><td>{f.art === 'verweis' ? <button class="verweis" onClick={() => setWahl(f.ziel!)}>→ {f.ziel}</button> : f.art}</td><td>{f.titel}{f.wenn ? ' (bedingt)' : ''}</td></tr>}</For>
      </tbody></table>
      {liste('Wird verwiesen von', [...objekte().values()].filter(({ o: x }) => x.name !== o.name && x.felder.some((f) => f.ziel === o.name)).map(({ o: x }) => x.name))}
      {liste('Ansichten', module().flatMap((m) => m.ansichten.filter((x) => x.objekt === o.name).map((x) => `${m.name} → ${x.titel}`)), false)}
      {liste('Ausdrucke', module().flatMap((m) => (m.ausdrucke ?? []).filter((x) => x.objekt === o.name).map((x) => x.titel)), false)}
      {liste('Kataloge', module().flatMap((m) => (m.kataloge ?? []).filter((x) => x.objekt === o.name).map((x) => x.titel)), false)}
    </div></aside>
  );
  const dateiKarte = (d: Baustein, alle: Baustein[]) => (
    <aside class="karte" aria-label={d.pfad}><div class="karte-kopf"><h2>{d.pfad.split('/').pop()}</h2></div><div class="karte-inhalt">
      <p class="still-text"><code>{d.pfad}</code> · {d.zeilen} Zeilen</p>
      <p class="aufbau-text">{d.beschreibung || 'Diese Datei hat noch keine Beschreibung am Anfang.'}</p>
      {liste('Stellt bereit', d.stelltBereit, false)}
      {liste('Bindet ein', d.bindetEin)}
      {liste('Wird gebraucht von', alle.filter((x) => x.bindetEin.includes(d.pfad)).map((x) => x.pfad))}
    </div></aside>
  );
  const details = () => {
    const w = wahl();
    if (!w) return undefined;
    const o = objekte().get(w);
    if (o) return objektKarte(o.o, o.modul.name);
    const d = a()?.quelltext?.bausteine.find((x) => x.pfad === w);
    return d ? dateiKarte(d, a()!.quelltext!.bausteine) : undefined;
  };
  // Klick auf einen Verweis in der Karte kann die Sicht wechseln (Objekt ↔ Datei)
  const gewaehlt = () => wahl();
  const passendeSicht = () => (objekte().has(wahl()) ? 'daten' : wahl() ? 'code' : sicht());

  return (
    <Rahmen schluessel="verwaltung.aufbau" detailsTitel="Baustein" details={details()}
      menueMitte={<>
        <div class="auswahl aufbau-wahl" role="radiogroup" aria-label="Sicht">
          <For each={[['daten', 'Daten'], ['code', 'Code'], ['betrieb', 'Betrieb']] as const}>{([id, titel]) => <button type="button" role="radio" aria-checked={passendeSicht() === id} classList={{ aktiv: passendeSicht() === id }} onClick={() => wechsel(id)}>{titel}</button>}</For>
        </div>
        <a class="knopf" href="/api/aufbau/text" download="Bauportal-Aufbau.md">Als Text für Entwickler:innen und KI</a>
      </>}
      inhalt={<section class="blatt aufbau">
        <Show when={passendeSicht() === 'daten'}>
          <p class="still-text">Was es im Bauportal gibt: {module().length} Module mit {objekte().size} Objekten. Jedes Objekt ist einmal beschrieben (Beipackzettel) – Tabelle, Prüfung, Masken, Rechte und Ausdrucke entstehen daraus.</p>
          <Bild {...daten()} gewaehlt={gewaehlt()} onWahl={setWahl} hin="verweist auf" her="wird verwiesen von" />
        </Show>
        <Show when={passendeSicht() === 'code'}>
          <Show when={code()} fallback={<p class="still-text">{a.loading ? 'Der Aufbau wird gelesen …' : a.error ? (a.error as Error).message : 'Der Quelltext-Aufbau liegt nur im gebauten Programm vor (npm run build).'}</p>}>{(c) => (<>
            <p class="still-text">Jede Datei ist ein Baustein; die Zahl ist ihre Länge in Zeilen. Von links nach rechts baut eins aufs andere auf: Der Kern kennt niemanden, die Module nur den Kern.</p>
            <Bild {...c()} gewaehlt={gewaehlt()} onWahl={setWahl} hin="bindet ein" her="wird gebraucht von" />
            <For each={a()!.quelltext!.bereiche}>{(b) => <p class="still-text klein-text"><strong>{b.titel}:</strong> {b.text}</p>}</For>
          </>)}</Show>
        </Show>
        <Show when={passendeSicht() === 'betrieb'}>
          <Show when={a()} fallback={<p class="still-text">{a.error ? (a.error as Error).message : 'Wird abgefragt …'}</p>}>{(x) => (<>
            <h2>Hilfsdienste</h2>
            <table class="matrix"><thead><tr><th>Dienst</th><th>Zweck</th><th>Zustand</th></tr></thead><tbody>
              <For each={x().dienste}>{(d) => <tr><th scope="row">{d.name}</th><td>{d.zweck}</td><td classList={{ 'gut-text': d.erreichbar, 'feld-fehler': !d.erreichbar }}>{d.erreichbar ? `läuft${d.version ? ` (${d.version})` : ''}` : 'nicht erreichbar'}</td></tr>}</For>
            </tbody></table>
            <h2>Server-Stellen ({x().routen.length})</h2>
            <ul class="aufbau-liste spalten"><For each={x().routen}>{(r) => <li><code>{r}</code></li>}</For></ul>
            <h2>Tabellen ({x().tabellen.length})</h2>
            <p class="still-text klein-text">„o_…“ sind die Objekte (aus dem Datenmodell erzeugt), „kern_…“ führt das Programm selbst. Zeilen sind die Schätzung der Datenbank.</p>
            <ul class="aufbau-liste spalten"><For each={x().tabellen}>{(t) => <li><code>{t.name}</code> <span class="still-text">{Number(t.zeilen).toLocaleString('de')}</span></li>}</For></ul>
          </>)}</Show>
        </Show>
      </section>} />
  );
}
