// Darstellung (Verwaltung → Für mich): alles direkt auf der Seite, wie im bisherigen Bauportal, aber gebündelt –
// Farben (hell/dunkel, Akzent, Design), Schrift (Art, Größe) und Stil (fertige Zusammenstellung, Ecken, Feinheiten).
// Jede Wahl wirkt sofort und ist gespeichert; „Zurück“ nimmt sie zurück. „Design einfügen“ nimmt ein Theme im
// shadcn-Format (tweakcn, shadcn.io …), übersetzt es (kern/design) und holt seine Schriften einmal auf den eigenen Server.
import { For, Show, createSignal } from 'solid-js';
import { AKZENTE, SCHRIFTMASS, SCHRIFTWAHL, schriftmass, STANDARD, STIL, STIL_PAKETE, satzFuer, schriften, themeLesen } from '../kern/design';
import type { Werte } from '../kern/modell';
import { ausfuehren, sicht } from './unterbau/abgleich';
import { ich, neueKennung, ruf } from './unterbau/api';
import { designAus, meineWahl, schriftenNeu } from './unterbau/design';
import { hinweis } from './unterbau/meldungen';
import type { Zeile } from '../kern/befehl';

const STANDARD_HELL: Record<string, string> = { akzent: '#1d4ed8', grund: '#f6f6f3', flaeche: '#fff', still: '#f1f1ed', text: '#1c1c1a' };

/** Eine Reihe Knöpfe, von denen einer gilt. */
function Wahl(p: { titel: string; werte: [string, string][]; wert: string; onWert: (w: string) => void; stil?: (w: string) => Record<string, string> }) {
  return (
    <div class="darstellung-reihe">
      <span class="design-etikett">{p.titel}</span>
      <div class="auswahl" role="radiogroup" aria-label={p.titel}>
        <For each={p.werte}>{([w, t]) => <button type="button" role="radio" aria-checked={p.wert === w} classList={{ aktiv: p.wert === w }} style={p.stil?.(w)} onClick={() => { if (p.wert !== w) p.onWert(w); }}>{t}</button>}</For>
      </div>
    </div>
  );
}

export function Darstellungsseite() {
  const w = () => meineWahl();
  const wert = (k: string) => String(w()?.werte[k] ?? '');
  const rund = () => { const r = w()?.werte.rund; return r === null || r === undefined ? null : Number(r); };
  const setzen = (werte: Werte, titel: string) => {
    const x = w();
    if (x) ausfuehren({ objekt: 'design_wahl', art: 'aendern', objektId: x.id, werte }, titel);
    else ausfuehren({ objekt: 'design_wahl', art: 'anlegen', objektId: neueKennung(), werte: { benutzer: ich().id, modus: 'hell', ...werte } }, titel);
  };
  const designs = () => Object.values(sicht.design ?? {}).filter((z) => !z.geloescht).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de'));
  // in Gruppen wie im bisherigen Bauportal; eingefügte Designs des Büros zuletzt
  const gruppen = () => { const g = new Map<string, Zeile[]>(); for (const z of designs()) { const t = String(z.werte.gruppe || 'Vom Büro eingefügt'); g.set(t, [...(g.get(t) ?? []), z]); } return [...g].sort((a, b) => Number(a[0] === 'Vom Büro eingefügt') - Number(b[0] === 'Vom Büro eingefügt')); };
  const gewaehlt = () => (wert('design') ? designAus(sicht.design?.[wert('design')]) : null);
  const paket = () => STIL_PAKETE.find((pk) => pk.rund === rund() && STIL.every((x) => (pk.stil[x.feld] ?? '') === wert(x.feld)))?.titel ?? '';

  // ---- Design einfügen ----
  const [einfuegen, setEinfuegen] = createSignal(false);
  const [css, setCss] = createSignal('');
  const [name, setName] = createSignal('');
  const [laeuft, setLaeuft] = createSignal(false);
  const uebernehmen = async () => {
    let d;
    try { d = themeLesen(css()); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); return; }
    const n = name().trim() || `Design ${designs().length + 1}`;
    setLaeuft(true);
    try {
      const f = schriften(d);
      if (f.length) {
        const r = await ruf<{ geholt: Record<string, boolean> }>('/api/schriften', { familien: f });
        const fehlt = f.filter((x) => !r.geholt[x]);
        if (fehlt.length) hinweis(`Schrift nicht gefunden: ${fehlt.join(', ')} – dafür gilt die nächste Schrift aus dem Design.`);
        schriftenNeu();
      }
      const id = neueKennung();
      ausfuehren({ objekt: 'design', art: 'anlegen', objektId: id, werte: { name: n, hell: JSON.stringify(d.hell), dunkel: JSON.stringify(d.dunkel), quelle: 'eingefügt' } }, `Design „${n}“ einfügen`);
      setzen({ design: id }, `Design „${n}“ wählen`);
      setEinfuegen(false); setCss(''); setName('');
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } finally { setLaeuft(false); }
  };
  // Karte wie im bisherigen Bauportal: Hintergrund, darauf eine Karte mit zwei Schriftzeilen, daneben der Akzent
  const karte = (id: string, titel: string, satz: Record<string, string>, beschreibung = '') => {
    const f = (m: string) => satz[m] ?? STANDARD_HELL[m] ?? STANDARD.hell[m];
    return (
      <button type="button" class="design-karte" role="radio" aria-checked={wert('design') === id} classList={{ aktiv: wert('design') === id }} title={beschreibung || titel}
        onClick={() => { if (wert('design') !== id) setzen({ design: id || null }, `Design „${titel}“ wählen`); }}>
        <span class="design-vorschau" style={{ background: f('grund'), 'border-color': f('rand') ?? '#ddd' }}>
          <i style={{ background: f('flaeche'), 'border-color': f('rand') ?? '#ddd' }}><em style={{ background: f('text') }} /><em style={{ background: f('text-still') ?? '#999' }} /></i>
          <b style={{ background: f('akzent') }} />
        </span>
        <span class="design-name" style={{ 'font-family': satz.schrift }}>{titel}</span>
      </button>
    );
  };
  return (
    <section class="blatt darstellung">
      <h2>Darstellung</h2>
      <p class="still-text">Gilt für dich in allen Apps und wirkt sofort. „Zurück“ oben nimmt eine Wahl zurück.</p>

      <h3>Farben</h3>
      <Wahl titel="Hell oder dunkel" werte={[['system', 'Wie das Gerät'], ['hell', 'Hell'], ['dunkel', 'Dunkel']]} wert={wert('modus') || 'hell'} onWert={(m) => setzen({ modus: m }, 'Hell oder dunkel ändern')} />
      <div class="darstellung-reihe">
        <span class="design-etikett">Akzent</span>
        <div class="design-akzente" role="radiogroup" aria-label="Akzentfarbe">
          <button type="button" role="radio" class="design-akzent ohne" aria-checked={!wert('akzent')} classList={{ aktiv: !wert('akzent') }} title="wie das Design" onClick={() => setzen({ akzent: '' }, 'Akzentfarbe wie das Design')}>∅</button>
          <For each={AKZENTE}>{([c, n]) => <button type="button" role="radio" class="design-akzent" aria-checked={wert('akzent') === c} classList={{ aktiv: wert('akzent') === c }} style={{ background: c }} title={n} aria-label={n} onClick={() => setzen({ akzent: c }, `Akzentfarbe ${n}`)} />}</For>
          <input class="design-hex" value={AKZENTE.some(([c]) => c === wert('akzent')) ? '' : wert('akzent')} placeholder="#eigene" maxLength={7} aria-label="Eigene Akzentfarbe (#rrggbb)"
            onChange={(e) => { const v = e.currentTarget.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) setzen({ akzent: v.toLowerCase() }, 'Eigene Akzentfarbe'); }} />
        </div>
      </div>
      <div class="design-raster offen" role="radiogroup" aria-label="Designs">
        <div class="design-gruppe"><h4>Grundeinstellung</h4><div>{karte('', 'Standard', STANDARD_HELL, 'das neue Bauportal, hell oder dunkel nach Wahl oben')}</div></div>
        <For each={gruppen()}>{([g, l]) => (
          <div class="design-gruppe"><h4>{g}</h4><div><For each={l}>{(z) => karte(z.id, String(z.werte.name), { ...STANDARD.hell, ...(designAus(z)?.hell ?? {}) }, String(z.werte.beschreibung ?? ''))}</For></div></div>
        )}</For>
      </div>
      <Show when={einfuegen()} fallback={<div><button type="button" class="knopf" onClick={() => setEinfuegen(true)}>＋ Design einfügen …</button></div>}>
        <div class="design-einfuegen">
          <p class="still-text klein-text">Theme im shadcn-Format einfügen („Code“ kopieren). Übernommen werden Farben, Ecken, Schatten, Buchstabenabstand und Schriften – die Schriften holt der Server einmal und liefert sie danach selbst aus. Gute Quellen:</p>
          <ul class="design-quellen klein-text">
            <li><a href="https://tweakcn.com" target="_blank" rel="noopener noreferrer">tweakcn</a> – Editor mit vielen fertigen Designs, sofortige Vorschau</li>
            <li><a href="https://ui.shadcn.com/themes" target="_blank" rel="noopener noreferrer">shadcn/ui Themes</a> – die offiziellen Grundfarben</li>
            <li><a href="https://shadcnstudio.com/theme-generator" target="_blank" rel="noopener noreferrer">shadcn/studio</a> – Generator mit Vorschau ganzer Seiten</li>
          </ul>
          <input class="suche" placeholder="Name des Designs" aria-label="Name des Designs" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <textarea rows={7} aria-label="Theme (CSS)" placeholder=":root { --background: …; --primary: …; --radius: 0.5rem; } .dark { … }" value={css()} onInput={(e) => setCss(e.currentTarget.value)} />
          <div class="reihe"><button type="button" class="knopf" onClick={() => { setEinfuegen(false); setCss(''); setName(''); }}>Abbrechen</button>
            <button type="button" class="knopf haupt" disabled={!css().trim() || laeuft()} onClick={uebernehmen}>{laeuft() ? 'Wird übernommen …' : 'Übernehmen'}</button></div>
        </div>
      </Show>

      <h3>Schrift</h3>
      <Wahl titel="Schriftart" werte={SCHRIFTWAHL.map(([k, t]) => [k, t])} wert={wert('schrift')} onWert={(v) => setzen({ schrift: v }, 'Schrift ändern')}
        stil={(k) => { const s = SCHRIFTWAHL.find(([x]) => x === k)?.[2]; return s ? { 'font-family': s } : ({} as Record<string, string>); }} />
      <div class="darstellung-reihe">
        <span class="design-etikett">Schriftgröße</span>
        <label class="design-rund">
          <input type="range" min={SCHRIFTMASS.min} max={SCHRIFTMASS.max} step={SCHRIFTMASS.schritt} value={schriftmass(w()?.werte.schriftmass)} aria-label="Schriftgröße in Prozent"
            onInput={(e) => { document.documentElement.style.zoom = String(Number(e.currentTarget.value) / 100); }}
            onChange={(e) => setzen({ schriftmass: Number(e.currentTarget.value) }, 'Schriftgröße ändern')} />
          <span class="darstellung-wert">{schriftmass(w()?.werte.schriftmass)} %</span>
          <Show when={schriftmass(w()?.werte.schriftmass) !== 100}><button type="button" class="knopf klein still" title="Zurück auf 100 %" onClick={() => setzen({ schriftmass: null }, 'Schriftgröße 100 %')}>↺</button></Show>
        </label>
      </div>

      <h3>Stil</h3>
      <Wahl titel="Zusammenstellung" werte={STIL_PAKETE.map((pk) => [pk.titel, pk.titel])} wert={paket()}
        onWert={(t) => { const pk = STIL_PAKETE.find((x) => x.titel === t)!; setzen({ rund: pk.rund, ...Object.fromEntries(STIL.map((x) => [x.feld, pk.stil[x.feld] ?? ''])) }, `Stil „${t}“`); }} />
      <div class="darstellung-reihe">
        <span class="design-etikett">Ecken</span>
        <label class="design-rund">
          <input type="range" min="0" max="2" step="0.25" value={rund() ?? Number(satzFuer(gewaehlt(), false).rund ?? 1)} aria-label="Rundung der Ecken"
            onChange={(e) => setzen({ rund: Number(e.currentTarget.value) }, 'Rundung der Ecken ändern')} />
          <Show when={rund() !== null}><button type="button" class="knopf klein still" title="Rundung wie im Design" onClick={() => setzen({ rund: null }, 'Rundung wie im Design')}>↺</button></Show>
        </label>
      </div>
      <For each={STIL}>{(x) => <Wahl titel={x.titel} werte={x.werte} wert={wert(x.feld)} onWert={(v) => setzen({ [x.feld]: v }, `${x.titel} ändern`)} />}</For>
    </section>
  );
}
