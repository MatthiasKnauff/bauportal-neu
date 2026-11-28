// „Was ist neu“ (wie im bisherigen Bauportal): je Stand, was dazukam – mit „Zeigen ›“ zur Stelle. Neues für dich ist markiert;
// nach dem Anmelden kommt es einmal von selbst, sonst über „?“ oder das Benutzermenü. Gesehen merkt das eigene Konto (alle Geräte).
import { For, Show, createMemo } from 'solid-js';
import { NEUIGKEITEN, neuFuer, neuesteZeit, type Neuigkeit } from '../kern/neuigkeiten';
import { sicht } from './unterbau/abgleich';
import { ich, ruf, zustand } from './unterbau/api';
import { Dialog } from './baukasten/dialog';

/** Zuletzt gesehen: am eigenen Konto (Gäste sehen ihr Konto nicht – dann im Gerät). */
const gesehen = () => String(sicht.benutzer?.[ich().id]?.werte.neu_gesehen ?? (() => { try { return localStorage.getItem('bp.neu.gesehen') ?? ''; } catch { return ''; } })());
export function gesehenSetzen(): void {
  const z = neuesteZeit(NEUIGKEITEN);
  if (!z || gesehen() >= z) return;
  try { localStorage.setItem('bp.neu.gesehen', z); } catch { /* gesperrt */ }
  if (sicht.benutzer?.[ich().id]) void ruf('/api/konto/einstellung', { feld: 'neu_gesehen', wert: z }).catch(() => { /* beim nächsten Mal wieder */ });
}
/** Einträge, die diese Person sehen kann (Apps, die sie hat), neueste zuerst. */
export const neuigkeiten = (apps: string[]) => NEUIGKEITEN.filter((n) => !n.app || apps.includes(n.app)).sort((a, b) => b.zeit.localeCompare(a.zeit));
export const neuFuerMich = (apps: string[]) => neuFuer(neuigkeiten(apps), gesehen());

const tag = (z: string) => new Date(`${z.slice(0, 10)}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

export function WasIstNeu(p: { apps: string[]; onZeigen: (app: string, ansicht: string) => void; onZu: () => void }) {
  const alle = createMemo(() => neuigkeiten(p.apps));
  const neu = createMemo(() => new Set(neuFuerMich(p.apps).map((n) => n.id)));
  // je Stand (Push) eine Gruppe, neueste zuerst
  const staende = createMemo(() => {
    const g = new Map<string, Neuigkeit[]>();
    for (const n of alle()) { const k = `${n.zeit}|${n.stand ?? ''}`; (g.get(k) ?? g.set(k, []).get(k)!).push(n); }
    return [...g.entries()].map(([k, l]) => ({ zeit: k.split('|')[0]!, stand: k.split('|')[1]!, l }));
  });
  const appName = (id?: string) => (id ? zustand()!.module.find((m) => m.id === id)?.name ?? id : 'Überall');
  const zu = () => { gesehenSetzen(); p.onZu(); };
  return (
    <Dialog titel="Was ist neu" breit onAbbrechen={p.onZu} knoepfe={<>
      <button type="button" class="knopf" onClick={p.onZu}>Später</button>
      <button type="button" class="knopf haupt" onClick={zu}>Gesehen</button></>}>
      <div class="was-neu">
        <Show when={neu().size} fallback={<p class="still-text">Du hast alles gesehen. Hier steht, was mit jedem Stand dazukam.</p>}>
          <p><b>{neu().size} {neu().size === 1 ? 'Neuigkeit' : 'Neuigkeiten'} für dich</b> – markiert.</p>
        </Show>
        <For each={staende()}>{(s) => (
          <section>
            <h3>{tag(s.zeit)}, {s.zeit.slice(11, 16)} Uhr<Show when={s.stand}> <small class="still-text">· Stand {s.stand}</small></Show></h3>
            <For each={s.l}>{(n) => (
              <div class="was-neu-eintrag" classList={{ neu: neu().has(n.id) }}>
                <div><small class="still-text">{appName(n.app)}<Show when={neu().has(n.id)}> · <b class="was-neu-marke">neu für dich</b></Show></small>
                  <strong>{n.titel}</strong><p>{n.text}</p></div>
                <Show when={n.app}><button type="button" class="knopf klein still" onClick={() => { gesehenSetzen(); p.onZeigen(n.app!, n.ansicht ?? ''); }}>Zeigen ›</button></Show>
              </div>
            )}</For>
          </section>
        )}</For>
      </div>
    </Dialog>
  );
}
