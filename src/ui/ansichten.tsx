// Ansichten der Module. Eine Liste eines Objekts kommt von selbst aus dem Baustein „ObjektListe“;
// hier steht nur, was ein Modul darüber hinaus zeigt.
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Ansicht, Beipackzettel } from '../kern/modul';
import type { Zeile } from '../kern/befehl';
import type { Rechtart } from '../kern/modell';
import { ausfuehren, sicht } from './abgleich';
import { darf, istAdmin, modell, neueKennung, zustand } from './api';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { hinweis } from './baukasten/hinweise';
import { Detailkarte, ObjektListe } from './baukasten/objektliste';

const lebende = (objekt: string) => Object.values(sicht[objekt] ?? {}).filter((z) => !z.geloescht);
const rolle = (name: unknown) => zustand()!.rollen.find((r) => r.name === name);

// ---------- Projekte: wer arbeitet mit ----------
function Mitglieder(p: { projekt: Zeile }) {
  const darfAendern = () => darf('projekt_mitglied', 'schreiben');
  const eintrag = (benutzerId: string) => Object.values(sicht.projekt_mitglied ?? {}).find((m) => m.werte.projekt === p.projekt.id && m.werte.benutzer === benutzerId);
  const leute = createMemo(() => lebende('benutzer').filter((b) => !b.werte.gesperrt).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de')));
  const schalten = (b: Zeile) => {
    const e = eintrag(b.id);
    const kopf = { objekt: 'projekt_mitglied', objektId: e?.id ?? neueKennung() };
    const wo = `„${b.werte.name}“ – Projekt „${p.projekt.werte.name}“`;
    if (!e) ausfuehren({ ...kopf, art: 'anlegen', werte: { projekt: p.projekt.id, benutzer: b.id } }, `Mitglied ${wo} hinzufügen`);
    else if (e.geloescht) ausfuehren({ ...kopf, art: 'wiederherstellen' }, `Mitglied ${wo} hinzufügen`);
    else ausfuehren({ ...kopf, art: 'loeschen' }, `Mitglied ${wo} entfernen`);
  };
  return (
    <fieldset>
      <legend>Wer arbeitet mit</legend>
      <p class="still-text klein-text">Mitglieder sehen dieses Projekt und alles, was daran hängt.</p>
      <ul class="schaltliste">
        <For each={leute()}>{(b) => {
          const alle = () => rolle(b.werte.rolle)?.alleProjekte === true;
          const an = () => { const e = eintrag(b.id); return !!e && !e.geloescht; };
          return (
            <li>
              <span><strong>{String(b.werte.name)}</strong><small>{rolle(b.werte.rolle)?.titel}{alle() ? ' – sieht alle Projekte' : ''}</small></span>
              <Show when={!alle()}>
                <button type="button" role="switch" aria-checked={an()} aria-label={`${b.werte.name} ist Mitglied`} class="schalter" classList={{ aktiv: an() }} disabled={!darfAendern()} onClick={() => schalten(b)}><span /></button>
              </Show>
            </li>
          );
        }}</For>
      </ul>
    </fieldset>
  );
}

// ---------- Projekte: Beteiligte aus den Adressen ----------
function Beteiligte(p: { projekt: Zeile }) {
  const schreiben = () => darf('projekt_kontakt', 'schreiben');
  const name = (id: unknown) => String(sicht.kontakt?.[String(id)]?.werte.name ?? '(Kontakt nicht sichtbar)');
  const eintraege = createMemo(() => lebende('projekt_kontakt').filter((e) => e.werte.projekt === p.projekt.id).sort((a, b) => name(a.werte.kontakt).localeCompare(name(b.werte.kontakt), 'de')));
  const frei = createMemo(() => {
    const drin = new Set(eintraege().map((e) => e.werte.kontakt));
    return lebende('kontakt').filter((k) => !drin.has(k.id)).map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – ') })).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  });
  const dazu = (kontaktId: string) => {
    const alt = Object.values(sicht.projekt_kontakt ?? {}).find((e) => e.geloescht && e.werte.projekt === p.projekt.id && e.werte.kontakt === kontaktId);
    const titel = `„${name(kontaktId)}“ am Projekt „${p.projekt.werte.name}“ beteiligen`;
    if (alt) ausfuehren({ objekt: 'projekt_kontakt', art: 'wiederherstellen', objektId: alt.id }, titel);
    else ausfuehren({ objekt: 'projekt_kontakt', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.projekt.id, kontakt: kontaktId, aufgabe: String(sicht.kontakt?.[kontaktId]?.werte.gewerk ?? '') } }, titel);
  };
  return (
    <Show when={darf('projekt_kontakt', 'lesen')}>
      <fieldset>
        <legend>Beteiligte</legend>
        <p class="still-text klein-text">Firmen, Personen und Behörden aus den Adressen, die an diesem Projekt mitwirken.</p>
        <ul class="schaltliste">
          <For each={eintraege()}>{(e) => (
            <li>
              <span class="beteiligt">
                <strong>{name(e.werte.kontakt)}</strong>
                <input aria-label={`Aufgabe von ${name(e.werte.kontakt)}`} placeholder="Aufgabe im Projekt" value={String(e.werte.aufgabe ?? '')} readOnly={!schreiben()}
                  onKeyDown={(x) => { if (x.key === 'Enter') x.currentTarget.blur(); }}
                  onChange={(x) => ausfuehren({ objekt: 'projekt_kontakt', art: 'aendern', objektId: e.id, werte: { aufgabe: x.currentTarget.value.trim() } }, `Aufgabe von „${name(e.werte.kontakt)}“ ändern`)} />
              </span>
              <Show when={darf('projekt_kontakt', 'loeschen')}>
                <button class="knopf klein still" aria-label={`${name(e.werte.kontakt)} entfernen`} title="Entfernen"
                  onClick={() => ausfuehren({ objekt: 'projekt_kontakt', art: 'loeschen', objektId: e.id }, `„${name(e.werte.kontakt)}“ aus Projekt „${p.projekt.werte.name}“ entfernen`)}>×</button>
              </Show>
            </li>
          )}</For>
        </ul>
        <Show when={schreiben() && darf('kontakt', 'lesen')}>
          <Auswahlliste titel="Kontakt hinzufügen" platzhalter="+ Kontakt hinzufügen …" optionen={frei()} wert={null} onWert={dazu} />
        </Show>
      </fieldset>
    </Show>
  );
}

// ---------- Verwaltung: Kennwort eines Benutzers setzen ----------
function KennwortSetzen(p: { benutzer: Zeile }) {
  const [offen, setOffen] = createSignal(false);
  return (
    <Show when={istAdmin()}>
      <fieldset>
        <legend>Anmeldung</legend>
        <p class="still-text klein-text">Neue Benutzer können sich erst anmelden, wenn ein Kennwort gesetzt ist. Sie ändern es danach selbst über das Menü oben rechts.</p>
        <div><button class="knopf" onClick={() => setOffen(true)}>Kennwort setzen …</button></div>
      </fieldset>
      <Show when={offen()}>
        <Dialog titel={`Kennwort für ${p.benutzer.werte.name}`} onAbbrechen={() => setOffen(false)} knoepfe={<button class="knopf" onClick={() => setOffen(false)}>Abbrechen</button>}>
          <Formular knopf="Kennwort setzen" pfad="/api/kennwort" fest={{ benutzerId: p.benutzer.id }}
            text="Andere Anmeldungen dieses Benutzers werden dabei beendet."
            felder={[{ name: 'kennwort', titel: 'Neues Kennwort (mindestens 10 Zeichen)', typ: 'password', auto: 'new-password' }]}
            onFertig={() => { setOffen(false); hinweis(`Kennwort für ${p.benutzer.werte.name} gesetzt.`); }} />
        </Dialog>
      </Show>
    </Show>
  );
}

// ---------- Verwaltung: Rechte je Rolle ----------
const ARTEN: { art: Rechtart; titel: string }[] = [{ art: 'lesen', titel: 'Sehen' }, { art: 'schreiben', titel: 'Ändern' }, { art: 'loeschen', titel: 'Löschen' }];

function Rechte() {
  const rollen = () => zustand()!.rollen.filter((r) => r.name !== 'admin');
  // Benutzer und Rechte selbst ändern immer nur Administrator:innen – hier stellt man nur das Sehen ein.
  const zeilen = () => zustand()!.module.flatMap((m) => m.objekte.filter((o) => o.name !== 'recht').map((o) => ({ modul: m, objekt: o })));
  const eintrag = (r: string, o: string) => lebende('recht').find((z) => z.werte.rolle === r && z.werte.objekt === o);
  const schalten = (r: { name: string; titel: string }, o: { name: string; titelMehrzahl: string }, a: { art: Rechtart; titel: string }) => {
    const e = eintrag(r.name, o.name);
    if (!e) return;
    const werte: Record<string, boolean> = { [a.art]: !e.werte[a.art] };
    if (a.art === 'lesen' && e.werte.lesen) { werte.schreiben = false; werte.loeschen = false; }   // ohne Sehen kein Ändern
    if (a.art !== 'lesen' && !e.werte[a.art]) werte.lesen = true;
    ausfuehren({ objekt: 'recht', art: 'aendern', objektId: e.id, werte }, `Recht „${a.titel}“ – ${o.titelMehrzahl} – ${r.titel}`);
  };
  return (
    <section class="blatt">
      <h2>Rechte je Rolle</h2>
      <p class="still-text">Ein Klick gilt sofort für alle Benutzer mit dieser Rolle – und lässt sich rückgängig machen. Administrator:innen dürfen immer alles.
        Bei Projekten und allem, was daran hängt, gilt das Recht nur in den eigenen Projekten; Büroleitung und Administrator:innen sehen alle Projekte.</p>
      <div class="tabelle-rollen">
        <table class="matrix">
          <thead>
            <tr><th rowSpan={2}>Bereich</th><For each={rollen()}>{(r) => <th colSpan={3}>{r.titel}</th>}</For></tr>
            <tr><For each={rollen()}>{() => <For each={ARTEN}>{(a) => <th class="klein">{a.titel}</th>}</For>}</For></tr>
          </thead>
          <tbody>
            <For each={zeilen()}>{(z) => (
              <tr>
                <th scope="row">{z.objekt.titelMehrzahl}<small>{z.modul.name}</small></th>
                <For each={rollen()}>{(r) => <For each={ARTEN}>{(a) => {
                  const fest = () => z.objekt.name === 'benutzer' && a.art !== 'lesen' || !!z.objekt.einzeln && a.art === 'loeschen';
                  const an = () => eintrag(r.name, z.objekt.name)?.werte[a.art] === true;
                  return (
                    <td>
                      <Show when={!fest()} fallback={<span class="strich" title="Nur Administrator:innen">–</span>}>
                        <button type="button" role="checkbox" aria-checked={an()} class="haken" classList={{ an: an() }}
                          aria-label={`${r.titel}: ${z.objekt.titelMehrzahl} ${a.titel.toLowerCase()}`} onClick={() => schalten(r, z.objekt, a)}>{an() ? '✓' : ''}</button>
                      </Show>
                    </td>
                  );
                }}</For>}</For>
              </tr>
            )}</For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Verwaltung: Bürodaten (gibt es genau einmal) ----------
function Buero() {
  const m = () => modell('buero');
  const z = () => sicht.buero?.[m().einzeln!];
  return <section class="blatt schmal"><Show when={z()} fallback={<p class="still-text">Bürodaten werden geladen …</p>}>{(zeile) => <Detailkarte modell={m()} zeile={zeile()} />}</Show></section>;
}

const EIGENE: Record<string, () => JSX.Element> = { 'verwaltung.rechte': Rechte, 'verwaltung.buero': Buero };
const ZUSATZ: Record<string, (z: Zeile) => JSX.Element> = {
  projekt: (z) => <><Beteiligte projekt={z} /><Mitglieder projekt={z} /></>,
  benutzer: (z) => <KennwortSetzen benutzer={z} />,
};

export const kartenZusatz = (objekt: string) => ZUSATZ[objekt];

export function sichtbar(a: Ansicht): boolean {
  if (a.nurAdmin && !istAdmin()) return false;
  return a.objekt ? darf(a.objekt, 'lesen') : true;
}

export function AnsichtZeigen(p: { modul: Beipackzettel; ansicht: Ansicht }) {
  const eigene = EIGENE[`${p.modul.id}.${p.ansicht.id}`];
  if (eigene) return eigene();
  return <ObjektListe modell={modell(p.ansicht.objekt!)} kartenZusatz={ZUSATZ[p.ansicht.objekt!]} />;
}
