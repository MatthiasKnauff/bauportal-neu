// „Aus dem Gebäudemodell“ (LV bearbeiten): die Bauteile mit Aufbau, je Kostengruppe und Aufbau mit ihren Schichten – anhaken,
// was in dieses LV gehört (ein LV je Gewerk nimmt meist nur einen Teil). Übernommenes bleibt mit dem Modell verbunden
// (Leiste über dem LV: Abgleichen). Die Rechnung steht in module/ava/modellplan.ts.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { quelleVon } from '../module/ava/lvplan';
import { MODELL, ohneAufbau } from '../module/ava/modellplan';
import { Dialog } from './baukasten/dialog';
import { lvAbgleichen, modellBauteile, modellQuelle, positionenVon } from './lvquelle';

export function ModellInsLv(p: { lv: Zeile; onZu: () => void }) {
  const projekt = String(p.lv.werte.projekt);
  const q = modellQuelle(projekt), plan = createMemo(() => q.plan());
  const im = new Set(positionenVon(p.lv.id).filter((x) => quelleVon(x) === MODELL).map((x) => String(x.werte.quelle)));
  const [wahl, setWahl] = createSignal<Set<string>>(new Set());
  const ohne = () => ohneAufbau(modellBauteile(projekt));
  /** Titel (KG) → Aufbauten → Positionen, für die Anzeige. */
  const baum = createMemo(() => {
    const aus: { titel: string; schluessel: string; aufbauten: { titel: string; schluessel: string; pos: { schluessel: string; text: string; menge: string }[] }[] }[] = [];
    for (const z of plan()) {
      if (z.art === 'titel') { aus.push({ titel: z.kurztext, schluessel: z.schluessel, aufbauten: [] }); continue; }
      const a = aus[aus.length - 1]!.aufbauten, k = z.schluessel.split('|').slice(0, 3).join('|');   // Schlüssel des Aufbaus
      if (z.art === 'hinweis') { a.push({ titel: z.kurztext.replace(/^Aufbau /, ''), schluessel: k, pos: [] }); continue; }
      if (a[a.length - 1]?.schluessel !== k) a.push({ titel: z.kurztext, schluessel: k, pos: [] });   // Aufbau ohne Schichten: eine Position
      a[a.length - 1]!.pos.push({ schluessel: z.schluessel, text: z.kurztext, menge: `${(z.menge ?? 0).toLocaleString('de-DE')} ${z.einheit}` });
    }
    return aus;
  });
  const unter = (k: string) => plan().filter((z) => z.art === 'normal' && z.schluessel.startsWith(`${k}|`) && !im.has(z.schluessel)).map((z) => z.schluessel);
  const alleAn = (k: string) => { const u = unter(k); return u.length > 0 && u.every((x) => wahl().has(x)); };
  const setze = (keys: string[], an: boolean) => { const n = new Set(wahl()); for (const k of keys) { if (an) n.add(k); else n.delete(k); } setWahl(n); };
  const ok = () => { p.onZu(); lvAbgleichen(p.lv, q, wahl()); };
  return (
    <Dialog titel="Aus dem Gebäudemodell" breit onAbbrechen={p.onZu}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!wahl().size} onClick={ok}>Übernehmen</button></>}>
      <div class="formular modell-lv">
        <Show when={baum().length} fallback={<p class="still-text">Im Gebäudemodell gibt es noch keine Bauteile mit Aufbau. Aufbauten unter Gebäudemodell → Aufbauten anlegen und den Bauteilen zuweisen.</p>}>
          <p class="still-text">Anhaken, was in dieses LV gehört. Je Schicht eine Position, Menge = Summe der Bauteile mit diesem Aufbau; davor der Aufbau als Hinweistext. Schon übernommene Positionen sind grau – sie gleichen sich über die Leiste über dem LV an.</p>
          <For each={baum()}>{(t) => (
            <div class="modell-lv-kg">
              <label class="druck-haken"><input type="checkbox" checked={alleAn(t.schluessel)} disabled={!unter(t.schluessel).length} onChange={(e) => setze(unter(t.schluessel), e.currentTarget.checked)} /> <b>{t.titel}</b></label>
              <For each={t.aufbauten}>{(a) => (
                <div class="modell-lv-aufbau">
                  <label class="druck-haken"><input type="checkbox" checked={alleAn(a.schluessel)} disabled={!unter(a.schluessel).length} onChange={(e) => setze(unter(a.schluessel), e.currentTarget.checked)} /> {a.titel}</label>
                  <For each={a.pos}>{(x) => (
                    <label class="druck-haken modell-lv-pos" classList={{ still: im.has(x.schluessel) }}>
                      <input type="checkbox" checked={im.has(x.schluessel) || wahl().has(x.schluessel)} disabled={im.has(x.schluessel)} onChange={(e) => setze([x.schluessel], e.currentTarget.checked)} />
                      <span>{x.text}</span><span class="modell-lv-menge">{x.menge}</span></label>)}</For>
                </div>)}</For>
            </div>)}</For>
        </Show>
        <Show when={ohne().length}><p class="still-text">{ohne().length} {ohne().length === 1 ? 'Bauteil hat' : 'Bauteile haben'} noch keinen Aufbau und {ohne().length === 1 ? 'fehlt' : 'fehlen'} hier: {ohne().slice(0, 8).map((b) => String(b.werte.name)).join(', ')}{ohne().length > 8 ? ' …' : ''}. Fenster und Türen kommen über die Fenster- & Türliste.</p></Show>
      </div>
    </Dialog>
  );
}
