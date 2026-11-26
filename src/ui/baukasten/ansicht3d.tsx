// Baustein „3D-Ansicht“: ein eigener kleiner Betrachter (WebGL, ohne Zusatzbibliothek) wie im bisherigen Bauportal.
// Gezeichnet wird ein Netz (je Bauteil Dreiecke, Kennung, Art, Geschoss), das der IFC-Dienst einmal je Planstand rechnet.
// Bedienung: ziehen dreht, Rad oder zwei Finger zoomen, rechte Taste / Umschalt + ziehen / zwei Finger verschieben,
// Klick wählt ein Bauteil (Strg + Klick: dazu). Geschosse und Dach ein/aus, Geschosse auseinanderziehen, Färbungen der App.
import { For, Show, createEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js';

export interface Netz {
  elemente: { k: string; t: string; g: string; v: number[]; i: number[] }[];   // v: Punkte in cm (x, y, z – z oben), i: Dreiecke
  geschosse: { k: string; name: string; ebene: number }[];
}
/** Eine Färbung: farbe(kennung, art) → '#rrggbb' oder null (dann blass); legende für unten links. */
export interface Faerbung { key: string; titel: string; farbe: (k: string, t: string) => string | null; legende: [string, string][] }

const ART_FARBE: Record<string, string> = { w: '#ece8df', f: '#9cc3e0', d: '#a7805a', s: '#c9c6bd', r: '#5a5d66', x: '#b3afa5' };
const BLASS = '#e4e2dc', WAHL = '#7b4fd6';
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] as const; };

// ---------- kleine Matrixrechnung (Spalten zuerst, wie WebGL) ----------
type M4 = Float32Array;
const mal = (a: M4, b: M4): M4 => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j]! * b[i * 4 + k]!; o[i * 4 + j] = s; } return o; };
function perspektive(fov: number, seite: number, nah: number, fern: number): M4 {
  const f = 1 / Math.tan(fov / 2), o = new Float32Array(16);
  o[0] = f / seite; o[5] = f; o[10] = (fern + nah) / (nah - fern); o[11] = -1; o[14] = (2 * fern * nah) / (nah - fern);
  return o;
}
function blick(auge: number[], ziel: number[]): M4 {
  const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return a.map((x) => x / l); };
  const kreuz = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const z = norm(sub(auge, ziel)), x = norm(kreuz([0, 1, 0], z)), y = kreuz(z, x);
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return new Float32Array([x[0]!, y[0]!, z[0]!, 0, x[1]!, y[1]!, z[1]!, 0, x[2]!, y[2]!, z[2]!, 0, -dot(x, auge), -dot(y, auge), -dot(z, auge), 1]);
}

const VS = `attribute vec3 a_pos; attribute vec3 a_norm; attribute vec4 a_farbe; attribute vec3 a_id; attribute float a_stock;
uniform mat4 u_mvp; uniform float u_spreizen; varying vec4 v_farbe; varying vec3 v_norm; varying vec3 v_id;
void main() { vec3 p = a_pos; p.y += a_stock * u_spreizen; gl_Position = u_mvp * vec4(p, 1.0); v_farbe = a_farbe; v_norm = a_norm; v_id = a_id; }`;
const FS = `precision mediump float; varying vec4 v_farbe; varying vec3 v_norm; varying vec3 v_id; uniform bool u_pick; uniform vec3 u_licht;
void main() { if (v_farbe.a < 0.01) discard; if (u_pick) { gl_FragColor = vec4(v_id, 1.0); return; }
  float l = 0.5 + 0.5 * abs(dot(normalize(v_norm), u_licht)); gl_FragColor = vec4(v_farbe.rgb * l, v_farbe.a); }`;

/** Ein Teil des Netzes in eigenen Puffern: undurchsichtig oder Glas (Fenster). */
interface Teil { n: number; pos: WebGLBuffer; norm: WebGLBuffer; farbe: WebGLBuffer; id: WebGLBuffer; stock: WebGLBuffer; farben: Float32Array; bereiche: { e: number; von: number; bis: number }[] }

export function Ansicht3d(p: {
  netz: Netz;
  faerbungen: Faerbung[];
  gewaehlt: () => Set<string>;
  onWahl: (k: string | null, dazu: boolean) => void;
  info?: (k: string) => string;
  zeigen?: (k: string) => boolean;   // Stellschraube: nur diese Bauteile zeigen (z. B. nach dem Sammelfilter), die übrigen ausgeblendet
}) {
  let feld!: HTMLDivElement, leinwand!: HTMLCanvasElement;
  const [faerbung, setFaerbung] = createSignal(p.faerbungen[0]?.key ?? '');
  const [aus, setAus] = createSignal<Set<string>>(new Set());   // ausgeblendete Geschosse
  const [dach, setDach] = createSignal(true);
  const [spreizen, setSpreizen] = createSignal(0);
  const [zeige, setZeige] = createSignal<string | null>(null);   // Bauteil unter der Maus bzw. zuletzt gewählt
  const [fehler, setFehler] = createSignal('');
  const stockNr = new Map(p.netz.geschosse.map((g, i) => [g.k, i]));

  onMount(() => {
    const gl = leinwand.getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
    if (!gl) { setFehler('Dieser Browser kann keine 3D-Ansicht zeigen (WebGL fehlt).'); return; }
    const shader = (art: number, q: string) => { const s = gl.createShader(art)!; gl.shaderSource(s, q); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!; gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    const ort = (n: string) => gl.getAttribLocation(prog, n), u = (n: string) => gl.getUniformLocation(prog, n);

    // Mitte und Größe des Gebäudes; IFC: z oben → hier y oben (x, z, −y)
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const e of p.netz.elemente) for (let j = 0; j < e.v.length; j += 3) {
      const q = [e.v[j]! / 100, e.v[j + 2]! / 100, -e.v[j + 1]! / 100];
      lo = lo.map((x, k) => Math.min(x, q[k]!)); hi = hi.map((x, k) => Math.max(x, q[k]!));
    }
    if (!isFinite(lo[0]!)) { setFehler('Im Plan ist keine Geometrie.'); return; }
    const mitte = lo.map((x, k) => (x + hi[k]!) / 2), groesse = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!, 1);

    const teil = (glas: boolean): Teil => {
      const els = p.netz.elemente.map((e, n) => ({ e, n })).filter(({ e }) => (e.t === 'f') === glas);
      const zahl = els.reduce((s, { e }) => s + e.i.length, 0);
      const pos = new Float32Array(zahl * 3), norm = new Float32Array(zahl * 3), id = new Float32Array(zahl * 3), stock = new Float32Array(zahl);
      const bereiche: Teil['bereiche'] = [];
      let w = 0;
      for (const { e, n } of els) {
        const von = w, s = stockNr.get(e.g) ?? 0, nr = n + 1;
        const punkt = (i: number) => [e.v[i * 3]! / 100 - mitte[0]!, e.v[i * 3 + 2]! / 100 - mitte[1]!, -e.v[i * 3 + 1]! / 100 - mitte[2]!];
        for (let d = 0; d < e.i.length; d += 3) {
          const a = punkt(e.i[d]!), b = punkt(e.i[d + 1]!), c = punkt(e.i[d + 2]!);
          const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
          const nn = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!], l = Math.hypot(nn[0]!, nn[1]!, nn[2]!) || 1;
          for (const q of [a, b, c]) {
            pos.set(q, w * 3); norm.set([nn[0]! / l, nn[1]! / l, nn[2]! / l], w * 3);
            id.set([(nr & 255) / 255, ((nr >> 8) & 255) / 255, ((nr >> 16) & 255) / 255], w * 3); stock[w] = s; w++;
          }
        }
        bereiche.push({ e: n, von, bis: w });
      }
      const puffer = (d: Float32Array) => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return b; };
      const farben = new Float32Array(zahl * 4);
      const f = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, f); gl.bufferData(gl.ARRAY_BUFFER, farben, gl.DYNAMIC_DRAW);
      return { n: w, pos: puffer(pos), norm: puffer(norm), farbe: f, id: puffer(id), stock: puffer(stock), farben, bereiche };
    };
    const teile = [teil(false), teil(true)];

    // Farben je Bauteil: Färbung, Auswahl, ausgeblendet (Alpha 0)
    const faerben = () => {
      const fb = p.faerbungen.find((x) => x.key === faerbung());
      const wahl = p.gewaehlt(), ohne = aus(), mitDach = dach();
      teile.forEach((t, glas) => {
        for (const b of t.bereiche) {
          const e = p.netz.elemente[b.e]!;
          const weg = ohne.has(e.g) || (!mitDach && e.t === 'r') || (!!p.zeigen && !p.zeigen(e.k));
          const hex = wahl.has(e.k) ? WAHL : fb ? fb.farbe(e.k, e.t) ?? BLASS : ART_FARBE[e.t] ?? ART_FARBE.x!;
          const [r, g, bl] = rgb(hex), a = weg ? 0 : glas ? 0.45 : 1;
          for (let i = b.von; i < b.bis; i++) t.farben.set([r, g, bl, a], i * 4);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, t.farbe); gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.farben);
      });
      zeichnen();
    };

    // Kamera: um die Mitte kreisen
    const kam = { gier: -0.7, nick: 0.5, abstand: groesse * 2, ziel: [0, 0, 0] };
    const anfang = { ...kam, ziel: [0, 0, 0] };
    const mvp = () => {
      const w = leinwand.width, h = leinwand.height;
      const auge = [kam.ziel[0]! + kam.abstand * Math.cos(kam.nick) * Math.sin(kam.gier), kam.ziel[1]! + kam.abstand * Math.sin(kam.nick), kam.ziel[2]! + kam.abstand * Math.cos(kam.nick) * Math.cos(kam.gier)];
      return mal(perspektive(Math.PI / 4, w / Math.max(1, h), kam.abstand / 200, kam.abstand * 10 + groesse * 4), blick(auge, kam.ziel));
    };
    const binden = (t: Teil) => {
      const attr = (name: string, b: WebGLBuffer, n: number) => { const l = ort(name); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); };
      attr('a_pos', t.pos, 3); attr('a_norm', t.norm, 3); attr('a_farbe', t.farbe, 4); attr('a_id', t.id, 3); attr('a_stock', t.stock, 1);
    };
    const bild = (pick: boolean) => {
      gl.viewport(0, 0, leinwand.width, leinwand.height);
      gl.clearColor(pick ? 0 : 0.96, pick ? 0 : 0.965, pick ? 0 : 0.97, pick ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(u('u_mvp'), false, mvp()); gl.uniform1f(u('u_spreizen'), spreizen()); gl.uniform1i(u('u_pick'), pick ? 1 : 0);
      const l = [0.35, 0.8, 0.5], ll = Math.hypot(...l); gl.uniform3f(u('u_licht'), l[0]! / ll, l[1]! / ll, l[2]! / ll);
      gl.disable(gl.BLEND); gl.depthMask(true);
      binden(teile[0]!); if (teile[0]!.n) gl.drawArrays(gl.TRIANGLES, 0, teile[0]!.n);
      if (!pick) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      binden(teile[1]!); if (teile[1]!.n) gl.drawArrays(gl.TRIANGLES, 0, teile[1]!.n);
      gl.depthMask(true);
    };
    let geplant = 0;
    const zeichnen = () => { if (!geplant) geplant = requestAnimationFrame(() => { geplant = 0; bild(false); }); };

    // Wählen: ein Bild mit den Nummern der Bauteile als Farbe, das Bildpunkt unter der Maus lesen
    const fb = gl.createFramebuffer()!, tex = gl.createTexture()!, tiefe = gl.createRenderbuffer()!;
    const getroffen = (x: number, y: number): string | null => {
      const w = leinwand.width, h = leinwand.height;
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, tiefe); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, tiefe);
      bild(true);
      const px = new Uint8Array(4), r = leinwand.getBoundingClientRect(), s = w / r.width;
      gl.readPixels(Math.round((x - r.left) * s), Math.round(h - (y - r.top) * s), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const nr = px[0]! + px[1]! * 256 + px[2]! * 65536;
      zeichnen();
      return nr ? p.netz.elemente[nr - 1]?.k ?? null : null;
    };

    // Größe folgt dem Feld
    const groesseAnpassen = () => { const r = feld.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); leinwand.width = Math.max(1, Math.round(r.width * d)); leinwand.height = Math.max(1, Math.round(r.height * d)); zeichnen(); };
    const beob = new ResizeObserver(groesseAnpassen); beob.observe(feld); groesseAnpassen();

    // Maus und Finger
    const zeiger = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number } | null = null, bewegt = 0;
    const drehen = (dx: number, dy: number) => { kam.gier -= dx * 0.008; kam.nick = Math.max(-1.45, Math.min(1.45, kam.nick + dy * 0.008)); };
    const schieben = (dx: number, dy: number) => {
      const s = kam.abstand * 0.0016, rx = [Math.cos(kam.gier), 0, -Math.sin(kam.gier)];
      const hoch = [-Math.sin(kam.nick) * Math.sin(kam.gier), Math.cos(kam.nick), -Math.sin(kam.nick) * Math.cos(kam.gier)];
      kam.ziel = kam.ziel.map((z, i) => z - rx[i]! * dx * s + hoch[i]! * dy * s);
    };
    const runter = (e: PointerEvent) => { leinwand.setPointerCapture(e.pointerId); zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = { x: e.clientX, y: e.clientY, t: e.timeStamp }; bewegt = 0; };
    const ziehen = (e: PointerEvent) => {
      const alt = zeiger.get(e.pointerId);
      if (!alt) { if (p.info && e.pointerType === 'mouse') setZeige(getroffenSanft(e)); return; }
      const dx = e.clientX - alt.x, dy = e.clientY - alt.y; bewegt += Math.abs(dx) + Math.abs(dy);
      if (zeiger.size === 2) {
        const [a, b] = [...zeiger.entries()]; const anderer = a![0] === e.pointerId ? b![1] : a![1];
        const vorher = Math.hypot(alt.x - anderer.x, alt.y - anderer.y), jetzt = Math.hypot(e.clientX - anderer.x, e.clientY - anderer.y);
        if (vorher > 0) kam.abstand = Math.max(groesse * 0.05, Math.min(groesse * 20, kam.abstand * (vorher / Math.max(1, jetzt))));
        schieben(dx / 2, dy / 2);
      } else if (e.buttons === 2 || e.shiftKey) schieben(dx, dy);
      else drehen(dx, dy);
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY }); zeichnen();
    };
    let zuletzt = 0;
    const getroffenSanft = (e: PointerEvent) => { if (e.timeStamp - zuletzt < 80) return zeige(); zuletzt = e.timeStamp; return getroffen(e.clientX, e.clientY); };
    const hoch = (e: PointerEvent) => {
      zeiger.delete(e.pointerId);
      if (start && bewegt < 6 && e.button === 0) { const k = getroffen(e.clientX, e.clientY); setZeige(k); p.onWahl(k, e.ctrlKey || e.metaKey); }
      start = null;
    };
    const rad = (e: WheelEvent) => { e.preventDefault(); kam.abstand = Math.max(groesse * 0.05, Math.min(groesse * 20, kam.abstand * Math.exp(e.deltaY * 0.0012))); zeichnen(); };
    leinwand.addEventListener('pointerdown', runter); leinwand.addEventListener('pointermove', ziehen); leinwand.addEventListener('pointerup', hoch); leinwand.addEventListener('pointercancel', (e) => zeiger.delete(e.pointerId));
    leinwand.addEventListener('wheel', rad, { passive: false }); leinwand.addEventListener('contextmenu', (e) => e.preventDefault());
    zuruecksetzen = () => { Object.assign(kam, { ...anfang, ziel: [0, 0, 0] }); zeichnen(); };

    createEffect(faerben);   // Färbung, Auswahl, Geschosse, Dach → neu färben
    createEffect(() => { spreizen(); zeichnen(); });
    onCleanup(() => { beob.disconnect(); cancelAnimationFrame(geplant); gl.getExtension('WEBGL_lose_context')?.loseContext(); });
  });
  let zuruecksetzen = () => undefined as void;

  const fb = () => p.faerbungen.find((x) => x.key === faerbung());
  const hatDach = p.netz.elemente.some((e) => e.t === 'r');
  return (
    <div class="ansicht3d" ref={feld}>
      <canvas ref={leinwand} aria-label="3D-Ansicht des Gebäudes – ziehen dreht, Rad zoomt, rechte Taste verschiebt, Klick wählt ein Bauteil" />
      <Show when={fehler()}><p class="ansicht3d-fehler">{fehler()}</p></Show>
      <div class="ansicht3d-oben">
        <For each={p.netz.geschosse}>{(g) => (
          <button type="button" class="chip" aria-pressed={!aus().has(g.k)} classList={{ aktiv: !aus().has(g.k) }} title={`${g.name} ein- oder ausblenden`}
            onClick={() => { const s = new Set(aus()); if (s.has(g.k)) s.delete(g.k); else s.add(g.k); setAus(s); }}>{g.name}</button>
        )}</For>
        <Show when={hatDach}><button type="button" class="chip" aria-pressed={dach()} classList={{ aktiv: dach() }} onClick={() => setDach(!dach())}>Dach</button></Show>
        <Show when={p.netz.geschosse.length > 1}>
          <label class="ansicht3d-regler" title="Geschosse auseinanderziehen">⇕ <input type="range" min="0" max="8" step="0.5" value={spreizen()} aria-label="Geschosse auseinander" onInput={(e) => setSpreizen(Number(e.currentTarget.value))} /></label>
        </Show>
        <button type="button" class="chip" title="Blick wie beim Öffnen" onClick={() => zuruecksetzen()}>⟲ Ansicht</button>
      </div>
      <Show when={p.faerbungen.length}>
        <div class="ansicht3d-faerbung" role="radiogroup" aria-label="Färben nach">
          <For each={p.faerbungen}>{(f) => <button type="button" role="radio" class="chip" aria-checked={faerbung() === f.key} classList={{ aktiv: faerbung() === f.key }} onClick={() => setFaerbung(f.key)}>{f.titel}</button>}</For>
        </div>
      </Show>
      <Show when={fb()?.legende.length}>
        <ul class="ansicht3d-legende">{fb()!.legende.map(([farbe, text]) => <li><i style={{ background: farbe }} />{text}</li>) as JSX.Element}</ul>
      </Show>
      <Show when={p.info && zeige()}>{(k) => <div class="ansicht3d-info">{p.info!(k())}</div>}</Show>
    </div>
  );
}
