// Plan in einem Satz ändern (wie bisher „Fragen und Antworten“ im Bauzeitenplan, ohne KI): Satz tippen, Vorschau (welche
// Leistungen, vorher → nachher, Projektende), „Ausführen“ – ein Schritt im Rückgängig. Die Rechnung steht in module/bauzeitenplan/saetze.ts.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import type { Vorlage } from '../module/bauzeitenplan/bearbeiten';
import type { Plan } from '../module/bauzeitenplan/plan';
import { satzVerstehen, type SatzV } from '../module/bauzeitenplan/saetze';
import { isoAus, tagAus } from '../module/bauzeitenplan/kalender';
import { Dialog } from './baukasten/dialog';

const BEISPIELE = ['Malerarbeiten 5 Tage länger', 'Estrich auf 8 AT', 'Fliesen 1 Woche später', 'Maler nach Fliesen', 'Estrich 50 % fertig'];
const datum = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '');

export function PlanSatz(p: { vorgaenge: Zeile[]; links: Zeile[]; plan: Plan; probe: (v: Zeile[], l: Zeile[]) => Plan; zu: Record<string, Wert>; neu: () => string;
  onAusfuehren: (b: Vorlage[], titel: string) => void; onZu: () => void }) {
  const [text, setText] = createSignal('');
  const v = (): SatzV[] => p.vorgaenge.map((x) => {
    const t = p.plan.erg.termine.get(x.id);
    return { id: x.id, name: String(x.werte.name ?? ''), dauer: Number(x.werte.dauer ?? 0), fortschritt: Number(x.werte.fortschritt ?? 0), gruppe: !!t?.gruppe, anfang: t?.anfang ?? '',
      vorgaenger: p.links.filter((l) => l.werte.nach === x.id).map((l) => String(l.werte.von)) };
  });
  // „n Arbeitstage später/früher“: vom gerechneten Anfang aus im Kalender des Plans
  const tag = (iso: string, n: number) => { const k = p.plan.kal, w = k.arbeitstag(tagAus(iso)); return isoAus(k.tag(Math.max(0, w + n))); };
  let n = 0; const vorlaeufig = () => `satz-${++n}`;
  const erg = createMemo(() => (text().trim() ? satzVerstehen(text(), v(), tag, p.zu, vorlaeufig) : null));
  // Projektende vorher → nachher: der Plan einmal mit den Änderungen gerechnet
  const ende = createMemo(() => {
    const e = erg(); if (!e || 'fehler' in e) return null;
    const vg = p.vorgaenge.map((x) => { const b = e.befehle.find((y) => y.objekt === 'vorgang' && y.objektId === x.id); return b ? { ...x, werte: { ...x.werte, ...b.werte } } : x; });
    const lk = [...p.links, ...e.befehle.filter((y) => y.objekt === 'verknuepfung').map((y) => ({ id: y.objektId, werte: y.werte ?? {} }) as Zeile)];
    return { vorher: p.plan.erg.endeDatum, nachher: p.probe(vg, lk).erg.endeDatum };
  });
  const los = () => {
    const e = erg(); if (!e || 'fehler' in e) return;
    // Kennungen erst jetzt endgültig vergeben
    p.onAusfuehren(e.befehle.map((b) => (b.objekt === 'verknuepfung' ? { ...b, objektId: p.neu() } : b)), `Plan ändern: ${text().trim()}`);
    p.onZu();
  };
  return (
    <Dialog titel="Plan in einem Satz ändern" breite={640} onAbbrechen={p.onZu} geaendert={() => !!text().trim()}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!erg() || 'fehler' in erg()!} onClick={los}>Ausführen</button></>}>
      <div class="feld"><label for="plan-satz">Was soll sich ändern?</label>
        <input id="plan-satz" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') los(); }} ref={(el) => queueMicrotask(() => el.focus())} placeholder="z. B. Fliesen 1 Woche später" /></div>
      <p class="still-text klein-text">Zum Beispiel: <For each={BEISPIELE}>{(b, i) => <>{i() ? ' · ' : ''}<button type="button" class="link-knopf" onClick={() => setText(b)}>{b}</button></>}</For></p>
      <Show when={text().trim() && !erg()}><p class="feld-fehler">Den Satz verstehe ich nicht – länger/kürzer, auf … AT, später/früher, … % fertig oder „A nach B“.</p></Show>
      <Show when={erg() && 'fehler' in erg()! ? (erg() as { fehler: string }) : null}>{(f) => <p class="feld-fehler">{f().fehler}</p>}</Show>
      <Show when={erg() && !('fehler' in erg()!) ? erg() as { schritte: { id: string; name: string; vorher: string; nachher: string }[] } : null}>{(e) => (
        <>
          <table class="einlesen-tabelle vorschau-tabelle">
            <thead><tr><th>Leistung</th><th>vorher</th><th>nachher</th></tr></thead>
            <tbody><For each={e().schritte}>{(s) => <tr><td>{s.name}</td><td>{s.vorher}</td><td>{s.nachher}</td></tr>}</For></tbody>
          </table>
          <Show when={ende()}>{(x) => <p>Projektende: {datum(x().vorher)} → <b>{datum(x().nachher)}</b></p>}</Show>
        </>
      )}</Show>
    </Dialog>
  );
}
