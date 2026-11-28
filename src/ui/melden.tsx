// Fehler melden und Frage stellen (wie bisher am „?“): kurz beschreiben, gern mit Bildschirmfoto (diese Ansicht aufnehmen,
// Bild wählen oder mit Strg+V einfügen). Automatisch mit gehen nur Adresse, App, Projekt, Version, Fenster, Browser und die
// letzten Fehlermeldungen dieser Seite – keine Eingaben aus Feldern. Das Bild wird vorher verkleinert (Vorschau, kein Original).
// Bei „Frage stellen“ stehen darunter die eigenen Fragen mit den Antworten aus dem Büro.
import { For, Show, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { Dialog } from './baukasten/dialog';
import { ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

// die letzten Fehler dieser Seite (für die Meldung) – nur Text, höchstens 20
const FEHLER: string[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => { FEHLER.push(`${new Date().toLocaleTimeString('de-DE')} ${e.message}`); FEHLER.splice(0, Math.max(0, FEHLER.length - 20)); });
  window.addEventListener('unhandledrejection', (e) => { FEHLER.push(`${new Date().toLocaleTimeString('de-DE')} ${String((e.reason as Error)?.message ?? e.reason)}`); FEHLER.splice(0, Math.max(0, FEHLER.length - 20)); });
}

export interface MeineFrage { id: string; kurz: string; text: string; zeit: string; stand: string; antwort: string; gelesen: boolean }
/** Ungelesene Antworten auf eigene Fragen (Zusatz am „?“-Menü). */
export async function meineFragen(): Promise<MeineFrage[]> { return ruf<MeineFrage[]>('/api/meldung/meine'); }

const verkleinern = (src: string, max = 1600): Promise<string> => new Promise((ok, nein) => {
  const im = new Image();
  im.onload = () => {
    const f = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * f); c.height = Math.round(im.height * f);
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85));
  };
  im.onerror = () => nein(new Error('Das Bild ließ sich nicht lesen.'));
  im.src = src;
});

/** Diese Ansicht aufnehmen: der Browser fragt, was geteilt wird; ein Bild, dann ist Schluss. */
async function aufnehmen(): Promise<string> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) { hinweis('Aufnehmen geht hier nicht – bitte mit Win+Umschalt+S ein Bildschirmfoto machen und mit Strg+V einfügen.', { art: 'fehler' }); return ''; }
  const strom = await navigator.mediaDevices.getDisplayMedia({ video: true, preferCurrentTab: true } as DisplayMediaStreamOptions).catch(() => null);
  if (!strom) return '';
  try {
    const v = document.createElement('video'); v.srcObject = strom; v.muted = true; await v.play();
    await new Promise((r) => setTimeout(r, 300));
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0);
    return await verkleinern(c.toDataURL('image/png'));
  } finally { strom.getTracks().forEach((t) => t.stop()); }
}

export function MeldenFenster(p: { art: 'fehler' | 'frage'; app: string; projekt: string; version: string; onZu: () => void; onGelesen?: () => void }) {
  const [text, setText] = createSignal('');
  const [bild, setBild] = createSignal('');
  const [laeuft, setLaeuft] = createSignal(false);
  const [versteckt, setVersteckt] = createSignal(false);
  const kontext = () => [
    `Adresse: ${location.href.replace(/([?&](token|key|pw)=)[^&#]*/gi, '$1…')}`, `App: ${p.app || 'Startseite'}`, p.projekt && `Projekt: ${p.projekt}`, `Version: ${p.version}`,
    `Fenster: ${innerWidth}×${innerHeight}, Zoom ${Math.round(devicePixelRatio * 100)} %`, `Browser: ${navigator.userAgent}`,
    `Fehler auf dieser Seite: ${FEHLER.length}`, ...FEHLER.map((f) => `  ${f}`),
  ].filter(Boolean).join('\n');
  const ausDatei = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith('image/')) return;
    const r = new FileReader(); r.onload = () => { verkleinern(String(r.result)).then(setBild, (e: Error) => hinweis(e.message, { art: 'fehler' })); }; r.readAsDataURL(f);
  };
  const einfuegen = (e: ClipboardEvent) => { const it = [...(e.clipboardData?.items ?? [])].find((x) => x.type.startsWith('image/')); if (it) { e.preventDefault(); ausDatei(it.getAsFile()); } };
  onMount(() => document.addEventListener('paste', einfuegen, true));
  onCleanup(() => document.removeEventListener('paste', einfuegen, true));
  const senden = async () => {
    if (text().trim().length < 3) { hinweis(p.art === 'frage' ? 'Bitte kurz schreiben, worum es geht.' : 'Bitte kurz beschreiben, was passiert ist.', { art: 'fehler' }); return; }
    setLaeuft(true);
    try {
      await ruf('/api/meldung', { art: p.art, text: text(), bild: bild() || undefined, kontext: kontext(), app: p.app, projekt: p.projekt });
      hinweis(p.art === 'frage' ? 'Danke! Die Frage ist im Büro angekommen – die Antwort steht dann hier unter „Frage stellen“.' : 'Danke! Die Meldung ist bei der Verwaltung angekommen.');
      p.onZu();
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); setLaeuft(false); }
  };
  const [fragen] = createResource(() => p.art === 'frage', async (an) => (an ? meineFragen() : []));
  // gezeigte Antworten gelten als gelesen
  const gelesen = (f: MeineFrage) => { if (f.antwort && !f.gelesen) void ruf(`/api/meldung/${f.id}/gelesen`, {}).then(() => p.onGelesen?.()).catch(() => undefined); return true; };
  return (
    <Dialog titel={p.art === 'frage' ? 'Frage stellen' : 'Fehler melden'} breite={600} onAbbrechen={p.onZu} geaendert={() => !!text().trim() || !!bild()}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={laeuft()} onClick={() => void senden()}>{laeuft() ? 'wird gesendet …' : p.art === 'frage' ? 'Frage senden' : 'Melden'}</button></>}>
      <div class="melden" style={{ visibility: versteckt() ? 'hidden' : undefined }}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); ausDatei(e.dataTransfer?.files[0]); }}>
        <div class="feld"><label for="melden-text">{p.art === 'frage' ? 'Worum geht es? Die Helfer im Büro antworten hier und per Mail.' : 'Was ist passiert – und was hättest du erwartet?'}</label>
          <textarea id="melden-text" rows={5} maxLength={8000} value={text()} onInput={(e) => setText(e.currentTarget.value)} ref={(el) => queueMicrotask(() => el.focus())}
            placeholder={p.art === 'frage' ? 'z. B. Wie lege ich im LV eine Bedarfsposition an?' : 'z. B. Ich habe im LV auf „Speichern“ geklickt, dann war die Position weg.'} /></div>
        <div class="melden-bild">
          <button class="knopf" onClick={async () => { setVersteckt(true); const b = await aufnehmen(); setVersteckt(false); if (b) setBild(b); }}>📷 Diese Ansicht aufnehmen</button>
          <label class="knopf">🖼 Bild wählen<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => ausDatei(e.currentTarget.files?.[0])} /></label>
          <span class="still-text klein-text">oder ein Bild mit Strg+V einfügen</span>
        </div>
        <Show when={bild()}><div class="melden-vorschau"><img src={bild()} alt="Bildschirmfoto" /><button class="knopf klein" aria-label="Bild entfernen" onClick={() => setBild('')}>✕</button></div></Show>
        <details class="melden-kontext"><summary class="still-text">Was automatisch mitgeschickt wird</summary><pre>{kontext()}</pre>
          <p class="still-text klein-text">Keine Eingaben aus Feldern. Die Meldung sieht nur, wer in der Verwaltung den Bereich „System“ hat.</p></details>
        <Show when={p.art === 'frage' && fragen()?.length}>
          <h3>Deine Fragen</h3>
          <ul class="melden-fragen"><For each={fragen()}>{(f) => (
            <li classList={{ neu: !!f.antwort && !f.gelesen }}><b>{f.kurz}</b> <span class="still-text klein-text">{f.zeit} · {f.antwort ? 'beantwortet' : f.stand === 'erledigt' ? 'erledigt' : 'offen'}</span>
              <Show when={f.antwort && gelesen(f)}><p class="melden-antwort">{f.antwort}</p></Show></li>
          )}</For></ul>
        </Show>
      </div>
    </Dialog>
  );
}
