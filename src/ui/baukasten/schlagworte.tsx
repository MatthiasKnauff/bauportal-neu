// Baustein „Schlagworte“: freie Stichwörter als kleine Marken – tippen, Enter oder Komma übernimmt, ✕ entfernt.
// Darunter die passenden Wörter, die schon an anderen Einträgen stehen (eigene Liste, keine Systemliste).
import { For, Show, createMemo, createSignal } from 'solid-js';

export const woerter = (w: string): string[] => w.split(',').map((x) => x.trim()).filter(Boolean);

export function Schlagworte(p: { id: string; titel: string; wert: string; gesperrt?: boolean; vorschlaege?: () => { wort: string; anzahl: number }[]; onWert: (w: string) => void }) {
  const [eingabe, setEingabe] = createSignal('');
  const liste = () => woerter(p.wert);
  const setzen = (l: string[]) => p.onWert(l.join(', '));
  const dazu = (t: string) => { t = t.replace(/\s+/g, ' ').trim(); setEingabe(''); if (t && !liste().some((x) => x.toLowerCase() === t.toLowerCase())) setzen([...liste(), t]); };
  const passend = createMemo(() => {
    const t = eingabe().trim().toLowerCase(); if (!t || !p.vorschlaege) return [];
    return p.vorschlaege().filter((v) => v.wort.toLowerCase().includes(t) && !liste().some((x) => x.toLowerCase() === v.wort.toLowerCase())).slice(0, 8);
  });
  return (
    <div class="schlagworte" classList={{ gesperrt: p.gesperrt }}>
      <div class="schlagworte-zeile">
        <For each={liste()}>{(w) => <span class="marke">{w}<Show when={!p.gesperrt}><button type="button" aria-label={`${w} entfernen`} onClick={() => setzen(liste().filter((x) => x !== w))}>✕</button></Show></span>}</For>
        <Show when={!p.gesperrt}>
          <input id={p.id} aria-label={p.titel} value={eingabe()} autocomplete="off" placeholder={liste().length ? '' : `${p.titel} …`}
            onInput={(e) => { const v = e.currentTarget.value; if (v.includes(',')) { v.split(',').slice(0, -1).forEach(dazu); setEingabe(v.split(',').pop()!); } else setEingabe(v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); dazu(eingabe()); } else if (e.key === 'Backspace' && !eingabe() && liste().length) setzen(liste().slice(0, -1)); }}
            onBlur={() => dazu(eingabe())} />
        </Show>
      </div>
      <Show when={passend().length}>
        <div class="schlagworte-vorschlaege">
          <For each={passend()}>{(v) => <button type="button" class="knopf klein still" onMouseDown={(e) => { e.preventDefault(); dazu(v.wort); }}>{v.wort} <small>{v.anzahl}</small></button>}</For>
        </div>
      </Show>
    </div>
  );
}

/** Welche Wörter in einem Feld schon vorkommen – mit Anzahl, die häufigsten zuerst. */
export function vorkommen(zeilen: { werte: Record<string, unknown>; geloescht?: boolean }[], feld: string): { wort: string; anzahl: number }[] {
  const z = new Map<string, { wort: string; anzahl: number }>();
  for (const r of zeilen) if (!r.geloescht) for (const w of woerter(String(r.werte[feld] ?? ''))) { const k = w.toLowerCase(); const e = z.get(k); if (e) e.anzahl++; else z.set(k, { wort: w, anzahl: 1 }); }
  return [...z.values()].sort((a, b) => b.anzahl - a.anzahl || a.wort.localeCompare(b.wort, 'de'));
}
