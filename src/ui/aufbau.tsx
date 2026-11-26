// Verwaltung → Aufbau (Punkt 31): der Aufbau des Programms als Bild – erzeugt aus dem laufenden Programm, nicht von
// Hand gepflegt. Drei Sichten: „Daten“ (Module, Objekte und ihre Verweise), „Code“ (jede Datei ein Baustein, Linien =
// bindet ein) und „Betrieb“ (Server-Stellen, Hilfsdienste, Tabellen). Ohne Auswahl stehen Module bzw. Bereiche als
// Kacheln da; das Gewählte steht in der Mitte, links seine Herkunft, rechts sein Ziel – eine oder zwei Stufen tief.
// Rechts in der Karte steht, was der gewählte Baustein ist.
import { For, Show, createMemo, createResource, createSignal, type JSX } from 'solid-js';
import type { ObjektModell } from '../kern/modell';
import { REGELN, codeNetz, datenNetz, pruefen, umfeld, type Datei, type Netz, type Quelltext } from '../kern/aufbaunetz';
import { sicht as daten } from './unterbau/abgleich';
import { ich, ruf, zustand } from './unterbau/api';
import { Rahmen } from './baukasten/rahmen';

interface Aufbau {
  quelltext: Quelltext | null;
  routen: string[]; dienste: { name: string; zweck: string; erreichbar: boolean; version: string }[]; tabellen: { name: string; zeilen: string }[];
  gestartet: string; langsam: { zeit: string; stelle: string; status: number; ms: number; wer: string; dbWartend: number }[]; db: { offen: number; frei: number; wartend: number };
}

/** Ohne Auswahl: je Modul bzw. Bereich eine Kachel mit seinen Bausteinen. */
function Uebersicht(p: { netz: Netz; onWahl: (id: string) => void }) {
  return (
    <div class="aufbau-kacheln">
      <For each={p.netz.gruppen}>{(g) => { const k = () => p.netz.knoten.filter((x) => x.gruppe === g.id); return (
        <section class="aufbau-kachel" aria-label={g.titel}>
          <h3>{g.titel} <span class="leise">{k().length}</span></h3>
          <Show when={g.text}><p class="still-text klein-text">{g.text}</p></Show>
          <div class="aufbau-chips"><For each={k()}>{(x) => <button type="button" title={x.lang} onClick={() => p.onWahl(x.id)}>{x.titel}<span class="leise"> {x.unter}</span></button>}</For></div>
        </section>); }}</For>
    </div>
  );
}

const zeitpunkt = (iso: string) => new Date(iso).toLocaleString('de', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const B = 172, H = 36, LUECKE = 6, ABSTAND = 54, KOPF = 46;   // Maße des Bildes
/** Mit Auswahl: das Gewählte in der Mitte, links was darauf zeigt (Herkunft), rechts worauf es zeigt (Ziel). */
function Fokus(p: { netz: Netz; wahl: string; tiefe: 1 | 2; onWahl: (id: string) => void }) {
  const knoten = createMemo(() => new Map(p.netz.knoten.map((k) => [k.id, k])));
  const gruppe = createMemo(() => new Map(p.netz.gruppen.map((g) => [g.id, g])));
  const aus = createMemo(() => { const m = new Map<string, Set<string>>(); for (const [v, n] of p.netz.kanten) (m.get(v) ?? m.set(v, new Set()).get(v)!).add(n); return m; });
  // Spalten von links nach rechts: [Herkunft 2], Herkunft, Mitte, Ziel, [Ziel 2] – derselbe Baustein wie die Prüf-Schnittstelle
  const spalten = createMemo(() => umfeld(p.netz, p.wahl, p.tiefe));
  const zeilenMax = () => Math.max(1, ...spalten().map((s) => s.ids.length));
  const hoehe = () => KOPF + zeilenMax() * (H + LUECKE) + 10;
  // Ort eines Knotens je Spalte (derselbe Baustein kann links und rechts stehen). Kurze Spalten stehen mittig zueinander;
  // bei langen bleibt alles oben, damit das Gewählte im Blick ist.
  const ort = (si: number, zi: number) => {
    const n = spalten()[si]!.ids.length;
    const versatz = zeilenMax() > 10 ? 0 : (zeilenMax() - n) / 2;
    return { x: si * (B + ABSTAND) + 8, y: KOPF + (versatz + zi) * (H + LUECKE) };
  };
  const linien = createMemo(() => {
    const l: { d: string; seite: 'l' | 'r' }[] = [];
    const s = spalten();
    for (let si = 0; si < s.length - 1; si++) {
      const a = s[si]!, b = s[si + 1]!;
      a.ids.forEach((va, ia) => b.ids.forEach((vb, ib) => {
        if (!aus().get(va)?.has(vb)) return;
        const o1 = ort(si, ia), o2 = ort(si + 1, ib), x1 = o1.x + B, x2 = o2.x, m = (x1 + x2) / 2;
        l.push({ d: `M${x1},${o1.y + H / 2} C${m},${o1.y + H / 2} ${m},${o2.y + H / 2} ${x2},${o2.y + H / 2}`, seite: b.seite === 'ziel' ? 'r' : 'l' });
      }));
    }
    return l;
  });
  const kurz = (t: string) => (t.length > 22 ? t.slice(0, 21) + '…' : t);
  return (
    <div class="aufbau-bild">
      <svg width={spalten().length * (B + ABSTAND) - ABSTAND + 16} height={hoehe()} role="img" aria-label={`Aufbau um ${knoten().get(p.wahl)?.titel ?? ''}`}>
        <defs><marker id="aufbau-pfeil" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
        <For each={spalten()}>{(s, i) => <>
          <text x={i() * (B + ABSTAND) + 8} y={16} class="spalte" classList={{ mitte: s.seite === 'mitte' }}>{s.titel}</text>
          <text x={i() * (B + ABSTAND) + 8} y={32} class="unter">{s.seite === 'mitte' ? '' : `${s.seite === 'herkunft' ? p.netz.herkunft : p.netz.ziel} · ${s.ids.length}`}</text>
        </>}</For>
        <g class="linien"><For each={linien()}>{(x) => <path d={x.d} class={x.seite === 'l' ? 'her' : 'hin'} marker-end="url(#aufbau-pfeil)" />}</For></g>
        <For each={spalten()}>{(s, si) => (
          <Show when={s.ids.length} fallback={<text x={si() * (B + ABSTAND) + 14} y={KOPF + (zeilenMax() > 10 ? 0 : (zeilenMax() - 1) / 2) * (H + LUECKE) + 22} class="unter">– nichts –</text>}>
            <For each={s.ids}>{(id, zi) => { const k = () => knoten().get(id)!; const o = () => ort(si(), zi()); return (
              <g class="knoten" classList={{ gewaehlt: s.seite === 'mitte' }} tabindex="0" role="button" aria-label={k().titel}
                onClick={() => s.seite !== 'mitte' && p.onWahl(id)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && s.seite !== 'mitte') { e.preventDefault(); p.onWahl(id); } }}>
                <title>{k().lang}</title>
                <rect x={o().x} y={o().y} width={B} height={H} rx="6" />
                <text x={o().x + 9} y={o().y + 15}>{kurz(k().titel)}</text>
                <text x={o().x + 9} y={o().y + 29} class="unter">{gruppe().get(k().gruppe)?.titel}</text>
              </g>); }}</For>
          </Show>
        )}</For>
      </svg>
      <p class="still-text klein-text aufbau-legende"><i class="her" /> {p.netz.herkunft} <i class="hin" /> {p.netz.ziel} – Baustein anklicken, um ihn in die Mitte zu holen.</p>
    </div>
  );
}

export function AufbauAnsicht() {
  const [a] = createResource(() => ruf<Aufbau>('/api/aufbau'));
  const [sicht, setSicht] = createSignal<'daten' | 'code' | 'betrieb'>('daten');
  const [wahl, setWahl] = createSignal('');
  const [tiefe, setTiefe] = createSignal<1 | 2>(1);
  const module = () => zustand()!.module;
  const objekte = createMemo(() => new Map(module().flatMap((m) => m.objekte.map((o) => [o.name, { o, modul: m }] as const))));
  const wechsel = (s: 'daten' | 'code' | 'betrieb') => { setSicht(s); setWahl(''); };
  const datenNetzM = createMemo(() => datenNetz(module()));
  const codeNetzM = createMemo(() => (a()?.quelltext ? codeNetz(a()!.quelltext!) : null));
  const befunde = createMemo(() => pruefen(a()?.quelltext ?? null, module()));
  const offeneRat = () => Object.values(daten.pruefrat ?? {}).filter((z) => !z.geloescht && z.werte.stand === 'offen').length;

  const liste = (titel: string, eintraege: string[], waehlen = true): JSX.Element => (
    <Show when={eintraege.length}><fieldset><legend>{titel}<span class="anzahl">{eintraege.length}</span></legend>
      <ul class="aufbau-liste"><For each={eintraege}>{(e) => <li>{waehlen ? <button class="verweis" onClick={() => setWahl(e)}>{e}</button> : <code>{e}</code>}</li>}</For></ul></fieldset></Show>
  );
  const befundListe = (id: string) => liste('Prüfung', befunde().filter((b) => b.baustein === id).map((b) => `${b.stufe === 'fehler' ? 'Fehler' : 'Hinweis'}: ${b.text}`), false);
  const objektKarte = (o: ObjektModell, modul: string) => (
    <aside class="karte" aria-label={o.titel}><div class="karte-kopf"><h2>{o.titel}</h2></div><div class="karte-inhalt">
      <p class="still-text">Objekt <code>{o.name}</code> im Modul {modul}{o.projektFeld ? ' · gehört zu einem Projekt' : ''}{o.versionsBereich ? ` · in Versionen (${o.versionsBereich})` : ''}{o.einzeln ? ' · gibt es genau einmal' : ''}</p>
      <p class="still-text klein-text">Sehen: {o.rechte.lesen.join(', ') || 'nur Admin'} · Ändern: {o.rechte.schreiben.join(', ') || 'nur Admin'} · Löschen: {o.rechte.loeschen.join(', ') || 'nur Admin'} (ab Werk)</p>
      {befundListe(o.name)}
      <table class="matrix aufbau-felder"><thead><tr><th>Feld</th><th>Art</th><th>Beschriftung</th></tr></thead><tbody>
        <For each={o.felder}>{(f) => <tr><td><code>{f.name}</code>{f.pflicht ? ' *' : ''}</td><td>{f.art === 'verweis' ? <button class="verweis" onClick={() => setWahl(f.ziel!)}>→ {f.ziel}</button> : f.art}</td><td>{f.titel}{f.wenn ? ' (bedingt)' : ''}</td></tr>}</For>
      </tbody></table>
      {liste('Ansichten', module().flatMap((m) => m.ansichten.filter((x) => x.objekt === o.name).map((x) => `${m.name} → ${x.titel}`)), false)}
      {liste('Ausdrucke', module().flatMap((m) => (m.ausdrucke ?? []).filter((x) => x.objekt === o.name).map((x) => x.titel)), false)}
      {liste('Kataloge', module().flatMap((m) => (m.kataloge ?? []).filter((x) => x.objekt === o.name).map((x) => x.titel)), false)}
    </div></aside>
  );
  const dateiKarte = (d: Datei) => (
    <aside class="karte" aria-label={d.pfad}><div class="karte-kopf"><h2>{d.pfad.split('/').pop()}</h2></div><div class="karte-inhalt">
      <p class="still-text"><code>{d.pfad}</code> · {d.zeilen} Zeilen</p>
      <p class="aufbau-text">{d.beschreibung || 'Diese Datei hat noch keine Beschreibung am Anfang.'}</p>
      {befundListe(d.pfad)}
      {liste('Stellt bereit', d.stelltBereit, false)}
      <Quelltext pfad={d.pfad} />
    </div></aside>
  );
  const details = () => {
    const w = wahl();
    if (!w) return undefined;
    const o = objekte().get(w);
    if (o) return objektKarte(o.o, o.modul.name);
    const d = a()?.quelltext?.bausteine.find((x) => x.pfad === w);
    return d ? dateiKarte(d) : undefined;
  };
  // Klick auf einen Verweis in der Karte kann die Sicht wechseln (Objekt ↔ Datei)
  const passendeSicht = () => (objekte().has(wahl()) ? 'daten' : wahl() ? 'code' : sicht());
  const netz = () => (passendeSicht() === 'daten' ? datenNetzM() : codeNetzM());
  const pruefung = (art: 'daten' | 'code') => {
    const l = befunde().filter((b) => (art === 'daten' ? objekte().has(b.baustein) : !objekte().has(b.baustein)));
    return (
      <div class="aufbau-pruefung" classList={{ gut: !l.some((b) => b.stufe === 'fehler') }}>
        <strong>Prüfung: {l.filter((b) => b.stufe === 'fehler').length} Fehler, {l.filter((b) => b.stufe === 'hinweis').length} Hinweise</strong>
        <Show when={offeneRat()}><span> · {offeneRat()} offene Ratschläge der Prüf-KI (Verwaltung → Ratschläge)</span></Show>
        <Show when={l.length}><ul class="aufbau-liste"><For each={l}>{(b) => <li><span classList={{ 'feld-fehler': b.stufe === 'fehler' }}>{b.stufe === 'fehler' ? 'Fehler' : 'Hinweis'}</span> <button class="verweis" onClick={() => setWahl(b.baustein)}>{b.baustein}</button> – {b.text}</li>}</For></ul></Show>
        <details class="klein-text"><summary>Regeln</summary><ul class="aufbau-liste"><For each={Object.values(REGELN)}>{(r) => <li>{r}</li>}</For></ul></details>
      </div>
    );
  };

  return (
    <Rahmen schluessel="verwaltung.aufbau" detailsTitel="Baustein" details={details()}
      menueMitte={<>
        <Show when={wahl()}><button class="knopf still" onClick={() => setWahl('')}>‹ Übersicht</button></Show>
        <div class="auswahl aufbau-wahl" role="radiogroup" aria-label="Sicht">
          <For each={[['daten', 'Daten'], ['code', 'Code'], ['betrieb', 'Betrieb']] as const}>{([id, titel]) => <button type="button" role="radio" aria-checked={passendeSicht() === id} classList={{ aktiv: passendeSicht() === id }} onClick={() => wechsel(id)}>{titel}</button>}</For>
        </div>
        <Show when={passendeSicht() !== 'betrieb'}>
          <div class="auswahl aufbau-wahl" role="radiogroup" aria-label="Tiefe">
            <For each={[1, 2] as const}>{(t) => <button type="button" role="radio" aria-checked={tiefe() === t} classList={{ aktiv: tiefe() === t }} onClick={() => setTiefe(t)}>Tiefe {t}</button>}</For>
          </div>
        </Show>
        <a class="knopf" href="/api/aufbau/text" download="Bauportal-Aufbau.md">Als Text</a>
      </>}
      inhalt={<section class="blatt aufbau">
        <Show when={passendeSicht() !== 'betrieb'}>
          <Show when={netz()} fallback={<p class="still-text">{a.loading ? 'Der Aufbau wird gelesen …' : a.error ? (a.error as Error).message : 'Der Quelltext-Aufbau liegt nur im gebauten Programm vor (npm run build).'}</p>}>{(n) => (
            <Show when={wahl() && n().knoten.some((k) => k.id === wahl())} fallback={<>
              <p class="still-text">{passendeSicht() === 'daten'
                ? `Was es im Bauportal gibt: ${module().length} Module mit ${objekte().size} Objekten. Jedes Objekt ist einmal beschrieben (Beipackzettel) – Tabelle, Prüfung, Masken, Rechte und Ausdrucke entstehen daraus. Ein Objekt anklicken: Es kommt in die Mitte, links steht, was darauf verweist, rechts, worauf es verweist.`
                : 'Jede Datei ist ein Baustein, die Zahl ihre Länge in Zeilen. Eine Datei anklicken: Sie kommt in die Mitte, links steht, wer sie braucht, rechts, was sie einbindet.'}</p>
              {pruefung(passendeSicht() as 'daten' | 'code')}
              <Uebersicht netz={n()} onWahl={setWahl} />
            </>}>
              <Fokus netz={n()} wahl={wahl()} tiefe={tiefe()} onWahl={setWahl} />
            </Show>
          )}</Show>
        </Show>
        <Show when={passendeSicht() === 'betrieb'}>
          <Show when={a()} fallback={<p class="still-text">{a.error ? (a.error as Error).message : 'Wird abgefragt …'}</p>}>{(x) => (<>
            <h2>Server</h2>
            <p>Läuft seit {zeitpunkt(x().gestartet)} · Datenbank-Verbindungen: {x().db.offen} offen, {x().db.frei} frei{x().db.wartend ? `, ${x().db.wartend} wartend` : ''}</p>
            <h3>Langsame Anfragen (ab 1 s, seit dem Start)</h3>
            <Show when={x().langsam.length} fallback={<p class="still-text">Keine – alles unter 1 s.</p>}>
              <table class="matrix"><thead><tr><th>Zeit</th><th>Stelle</th><th>Dauer</th><th>Status</th><th>Wer</th><th>auf Datenbank wartend</th></tr></thead><tbody>
                <For each={x().langsam}>{(l) => <tr><td>{zeitpunkt(l.zeit)}</td><td><code>{l.stelle}</code></td><td>{(l.ms / 1000).toLocaleString('de', { maximumFractionDigits: 1 })} s</td><td>{l.status}</td><td>{l.wer}</td><td>{l.dbWartend}</td></tr>}</For>
              </tbody></table>
            </Show>
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

/** Quelltext einer Datei – nur lesen, mit Link zu GitHub; nur mit Debugging-Modus für die eigene Rolle (Verwaltung → Büro & Standort). */
function Quelltext(p: { pfad: string }) {
  const an = () => String(Object.values(daten.buero ?? {})[0]?.werte.debugging ?? '').split(',').includes(ich().rolle);
  const [zeigen, setZeigen] = createSignal(false);
  const [text] = createResource(() => (zeigen() && an() ? p.pfad : false), async (pfad) => {
    const r = await fetch(`/api/aufbau/quelltext?pfad=${encodeURIComponent(pfad)}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? `Fehler ${r.status}`);
    return r.text();
  });
  return (
    <div class="aufbau-quelltext">
      <h3>Quelltext</h3>
      <Show when={an()} fallback={<p class="still-text klein-text">Nur mit Debugging-Modus für deine Rolle (Verwaltung → Büro & Standort → Entwicklung).</p>}>
        <div class="reihe">
          <button type="button" class="knopf klein" onClick={() => setZeigen(!zeigen())}>{zeigen() ? 'Quelltext ausblenden' : 'Quelltext zeigen'}</button>
          <a class="knopf klein" href={`https://github.com/MatthiasKnauff/bauportal-neu/blob/main/${p.pfad}`} target="_blank" rel="noopener noreferrer">Auf GitHub ↗</a>
        </div>
        <Show when={zeigen()}>
          <Show when={!text.error} fallback={<p class="feld-fehler">{(text.error as Error).message}</p>}>
            <Show when={text()} fallback={<p class="still-text">Wird geladen …</p>}>{(t) => (
              <pre class="aufbau-code" aria-label={`Quelltext ${p.pfad}`}><For each={t().split('\n')}>{(z, i) => <span><i>{i() + 1}</i>{z}{'\n'}</span>}</For></pre>
            )}</Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
