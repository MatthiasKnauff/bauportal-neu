// Design wählen (Profil): Standard oder ein Design des Büros, hell / dunkel / wie das Gerät, eigene Rundung der Ecken.
// „Design einfügen“ nimmt ein Theme im shadcn-Format (tweakcn, shadcn.io …), übersetzt es (kern/design) und holt seine
// Schriften einmal auf den eigenen Server. Alles wirkt sofort als Vorschau; OK speichert, Abbrechen verwirft mit Rückfrage.
import { For, Show, createSignal, onCleanup } from 'solid-js';
import { satzFuer, schriften, STANDARD, themeLesen, type Design } from '../kern/design';
import { ausfuehren, sicht } from './unterbau/abgleich';
import { ich, neueKennung, ruf } from './unterbau/api';
import { anwenden, designAus, meineWahl, schriftenNeu } from './unterbau/design';
import { hinweis } from './unterbau/meldungen';
import { Dialog } from './baukasten/dialog';

const MUSTER = ['akzent', 'grund', 'flaeche', 'still', 'text'] as const;
const STANDARD_HELL: Record<string, string> = { akzent: '#1d4ed8', grund: '#f6f6f3', flaeche: '#fff', still: '#f1f1ed', text: '#1c1c1a' };

export function Designwahl(p: { onZu: () => void }) {
  const w = meineWahl();
  const start = { design: String(w?.werte.design ?? ''), modus: String(w?.werte.modus ?? 'hell'), rund: w?.werte.rund === null || w?.werte.rund === undefined ? null : Number(w.werte.rund) };
  const [design, setDesign] = createSignal(start.design);
  const [modus, setModus] = createSignal(start.modus);
  const [rund, setRund] = createSignal<number | null>(start.rund);
  const [einfuegen, setEinfuegen] = createSignal(false);
  const [css, setCss] = createSignal('');
  const [name, setName] = createSignal('');
  const [laeuft, setLaeuft] = createSignal(false);
  const designs = () => Object.values(sicht.design ?? {}).filter((z) => !z.geloescht).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de'));
  const dunkel = () => modus() === 'dunkel' || (modus() === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const gewaehlt = (): Design | null => (design() ? designAus(sicht.design?.[design()]) : null);
  // Vorschau: sofort auf der ganzen Seite
  const zeigen = () => anwenden(satzFuer(gewaehlt(), dunkel(), rund()), dunkel());
  const geaendert = () => design() !== start.design || modus() !== start.modus || rund() !== start.rund;
  let gespeichert = false;
  onCleanup(() => { if (!gespeichert) { const d = start.design ? designAus(sicht.design?.[start.design]) : null; const dk = start.modus === 'dunkel' || (start.modus === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); anwenden(satzFuer(d, dk, start.rund), dk); } });

  const ok = () => {
    const werte = { design: design() || null, modus: modus(), rund: rund() };
    if (w) ausfuehren({ objekt: 'design_wahl', art: 'aendern', objektId: w.id, werte }, 'Design ändern', true);
    else ausfuehren({ objekt: 'design_wahl', art: 'anlegen', objektId: neueKennung(), werte: { benutzer: ich().id, ...werte } }, 'Design wählen', true);
    gespeichert = true; p.onZu();
  };
  const uebernehmen = async () => {
    let d: Design;
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
      setDesign(id); setEinfuegen(false); setCss(''); setName(''); queueMicrotask(zeigen);
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } finally { setLaeuft(false); }
  };
  const karte = (id: string, titel: string, satz: Record<string, string>) => (
    <button type="button" class="design-karte" role="radio" aria-checked={design() === id} classList={{ aktiv: design() === id }} onClick={() => { setDesign(id); zeigen(); }}>
      <span class="design-muster"><For each={MUSTER}>{(m) => <i style={{ background: satz[m] ?? STANDARD_HELL[m] }} />}</For></span>
      <span style={{ 'font-family': satz.schrift }}>{titel}</span>
    </button>
  );
  return (
    <Dialog titel="Design" breit onAbbrechen={p.onZu} geaendert={geaendert}
      knoepfe={<><button class="knopf" data-abbrechen onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" onClick={ok}>OK</button></>}>
      <div class="design-wahl">
        <div class="auswahl" role="radiogroup" aria-label="Hell oder dunkel">
          <For each={[['system', 'Wie das Gerät'], ['hell', 'Hell'], ['dunkel', 'Dunkel']] as const}>{([k, t]) =>
            <button type="button" role="radio" aria-checked={modus() === k} classList={{ aktiv: modus() === k }} onClick={() => { setModus(k); zeigen(); }}>{t}</button>}</For>
        </div>
        <div class="design-raster" role="radiogroup" aria-label="Designs">
          {karte('', 'Standard', STANDARD_HELL)}
          <For each={designs()}>{(z) => karte(z.id, String(z.werte.name), { ...STANDARD.hell, ...(designAus(z)?.hell ?? {}) })}</For>
        </div>
        <label class="design-rund">Ecken
          <input type="range" min="0" max="2" step="0.25" value={rund() ?? Number(satzFuer(gewaehlt(), false).rund ?? 1)} aria-label="Rundung der Ecken"
            onInput={(e) => { setRund(Number(e.currentTarget.value)); zeigen(); }} />
          <span>{rund() === null ? 'wie das Design' : rund() === 0 ? 'eckig' : rund()! >= 1.75 ? 'sehr rund' : rund()! <= 0.5 ? 'fast eckig' : 'rund'}</span>
          <Show when={rund() !== null}><button type="button" class="knopf klein still" onClick={() => { setRund(null); zeigen(); }}>wie das Design</button></Show>
        </label>
        <Show when={einfuegen()} fallback={<button type="button" class="knopf" onClick={() => setEinfuegen(true)}>＋ Design einfügen …</button>}>
          <div class="design-einfuegen">
            <p class="still-text klein-text">Theme im shadcn-Format einfügen, z. B. von tweakcn.com oder shadcn.io („Code“ kopieren). Übernommen werden Farben, Ecken, Schatten, Buchstabenabstand und Schriften – die Schriften holt der Server einmal und liefert sie danach selbst aus.</p>
            <input class="suche" placeholder="Name des Designs" aria-label="Name des Designs" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            <textarea rows={7} aria-label="Theme (CSS)" placeholder=":root { --background: …; --primary: …; --radius: 0.5rem; } .dark { … }" value={css()} onInput={(e) => setCss(e.currentTarget.value)} />
            <div><button type="button" class="knopf" disabled={!css().trim() || laeuft()} onClick={uebernehmen}>{laeuft() ? 'Wird übernommen …' : 'Übernehmen'}</button></div>
          </div>
        </Show>
      </div>
    </Dialog>
  );
}
