// Ansichten der Module. Die Ansicht eines Objekts kommt von selbst (ObjektAnsicht: Baum, Tabelle, Detailkarte im Rahmen).
// Hier steht nur, was ein Modul darüber hinaus zeigt – und was es an den Bausteinen über die Stellschrauben einstellt.
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import type { Ansicht, Beipackzettel } from '../kern/modul';
import type { Zeile } from '../kern/befehl';
import type { Rechtart } from '../kern/modell';
import { ausfuehren, sicht } from './unterbau/abgleich';
import { ausdrucke, darf, ich, istAdmin, modell, neueKennung, ruf, zustand } from './unterbau/api';
import { gewaehlteVersion, projektId, waehleVersion } from './projekt';
import { Versionsleiste } from './baukasten/versionsleiste';
import type { Versionsweg } from '../kern/modul';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { hinweis } from './unterbau/meldungen';
import type { Anpassung } from './baukasten/anpassung';
import { Detailkarte } from './baukasten/detailkarte';
import { Rahmen } from './baukasten/rahmen';
import { ObjektAnsicht } from './objektansicht';
import { DateienAnsicht, OrdnerFenster } from './dateien';
import { assistentStarten, ifcEinlesen } from './uebernahme';
import { druckOeffnen } from './druck';
import { Updates } from './updates';
import { AufbauAnsicht } from './aufbau';
import { Altdaten } from './altdaten';
import { KiEinrichten } from './baukasten/ki';
import { gesamtdicke, uWert } from '../module/gebaeudemodell/bauphysik';
import { Unterliste } from './baukasten/unterliste';
import { Balkenplan } from './balkenplan';
import { springeZu } from './sprung';
import { Arbeitszeit } from './arbeitszeit';
import { BerichtDetails, BerichtLinks, Berichtsseite, berichtDetailsDa } from './bautagebuch';
import { aufraeumenOeffnen } from './aufraeumen';
import { PruefSchluessel } from './pruefki';

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
                <Auswahlliste titel={`Vergabe an ${name(e.werte.kontakt)}`} wert={String(e.werte.vergabe ?? '')} gesperrt={!schreiben()}
                  optionen={modell('projekt_kontakt').felder.find((f) => f.name === 'vergabe')!.optionen!.map((o) => ({ wert: o.wert, titel: o.wert ? o.titel : 'Vergabe …' }))}
                  onWert={(w) => ausfuehren({ objekt: 'projekt_kontakt', art: 'aendern', objektId: e.id, werte: { vergabe: w } }, `Vergabe an „${name(e.werte.kontakt)}“ ändern`)} />
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

// ---------- Bautagebuch: was im Bericht steht – Anwesende, Notizen, Mängel, Aufgaben, Weisungen ----------
// Aufbau: seine Schichten von innen nach außen, dazu Gesamtdicke, überschlägiger U-Wert und wer ihn verwendet
function AufbauSchichten(p: { aufbau: Zeile }) {
  const schichten = () => lebende('aufbau_schicht').filter((s) => s.werte.aufbau === p.aufbau.id)
    .map((s) => ({ dicke: s.werte.dicke == null ? null : Number(s.werte.dicke), lambda: s.werte.lambda == null ? null : Number(s.werte.lambda) }));
  const u = () => uWert(String(p.aufbau.werte.art ?? ''), schichten());
  const bauteile = () => lebende('bauteil').filter((b) => b.werte.aufbau === p.aufbau.id).length;
  const zahl = (x: number, n = 1) => x.toLocaleString('de', { maximumFractionDigits: n });
  return (
    <Show when={darf('aufbau_schicht', 'lesen')}>
      <Unterliste titel="Schichten (Reihenfolge wie im Plan)" objekt="aufbau_schicht" fest={{ projekt: p.aufbau.werte.projekt ?? null, version: p.aufbau.werte.version ?? null, aufbau: p.aufbau.id }}
        haupt="material" neben={['dicke', 'lambda']} platzhalter="Material eingeben und Enter" />
      <p class="still-text">
        Gesamtdicke {zahl(gesamtdicke(schichten()))} cm · U-Wert {u() == null ? '– (dafür braucht jede Schicht ein λ)' : `≈ ${zahl(u()!, 2)} W/(m²K)`} · verwendet von {bauteile()} {bauteile() === 1 ? 'Bauteil' : 'Bauteilen'}
      </p>
    </Show>
  );
}

// ---------- Bauzeitenplan: Nachfolger einer Leistung in der Karte ----------
function Nachfolger(p: { vorgang: Zeile }) {
  const namen = () => lebende('verknuepfung').filter((l) => l.werte.von === p.vorgang.id)
    .map((l) => String(sicht.vorgang?.[String(l.werte.nach)]?.werte.name ?? '')).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
  return <p class="still-text klein-text">Nachfolger: {namen().join(', ') || 'keine'}</p>;
}

// ---------- Adressen: ein Kontakt als Kachel ----------
function KontaktKachel(p: { kontakt: Zeile }) {
  const w = () => p.kontakt.werte;
  const art = () => modell('kontakt').felder.find((f) => f.name === 'art')?.optionen?.find((o) => o.wert === w().art)?.titel;
  const tel = (t: unknown) => String(t ?? '').replace(/[^\d+]/g, '');
  return (
    <div class="kontakt-kachel">
      <strong>{String(w().name ?? '')}</strong>
      <span class="leise">{[art(), w().gewerk].filter(Boolean).join(' · ')}</span>
      <Show when={w().ansprechpartner}><span>{String(w().ansprechpartner)}</span></Show>
      <Show when={w().ort}><span class="leise">{[w().plz, w().ort].filter(Boolean).join(' ')}</span></Show>
      <span class="kontakt-wege">
        <Show when={w().telefon}><a href={`tel:${tel(w().telefon)}`}>☎ {String(w().telefon)}</a></Show>
        <Show when={w().mobil}><a href={`tel:${tel(w().mobil)}`}>📱 {String(w().mobil)}</a></Show>
        <Show when={w().email}><a href={`mailto:${String(w().email)}`}>✉ {String(w().email)}</a></Show>
      </span>
    </div>
  );
}

// ---------- Adressen: in welchen Projekten ein Kontakt beteiligt ist ----------
function KontaktProjekte(p: { kontakt: Zeile }) {
  const vergabe = (w: unknown) => modell('projekt_kontakt').felder.find((f) => f.name === 'vergabe')?.optionen?.find((o) => o.wert === w)?.titel;
  const liste = () => lebende('projekt_kontakt').filter((b) => b.werte.kontakt === p.kontakt.id)
    .map((b) => ({ b, projekt: sicht.projekt?.[String(b.werte.projekt)] })).filter((x) => x.projekt && !x.projekt.geloescht)
    .sort((a, b) => String(a.projekt!.werte.nummer ?? '').localeCompare(String(b.projekt!.werte.nummer ?? ''), 'de', { numeric: true }));
  return (
    <fieldset>
      <legend>Projekte<span class="anzahl">{liste().length}</span></legend>
      <Show when={liste().length} fallback={<p class="still-text klein-text">In keinem Projekt beteiligt, das du siehst.</p>}>
        <ul class="kontakt-projekte"><For each={liste()}>{(x) => (
          <li><button class="verweis" onClick={() => springeZu('projekt', x.projekt!.id)}>{[x.projekt!.werte.nummer, x.projekt!.werte.name].filter(Boolean).join(' · ')}</button>
            <span class="still-text klein-text">{[x.b.werte.aufgabe, vergabe(x.b.werte.vergabe)].filter(Boolean).join(' · ')}</span></li>
        )}</For></ul>
      </Show>
    </fieldset>
  );
}

// ---------- Projekte: Ordner auf dem Dateiserver zuordnen ----------
function OrdnerWahl(p: { projekt: Zeile }) {
  const [offen, setOffen] = createSignal(false);
  return (
    <Show when={darf('projekt', 'schreiben')}>
      <div><button class="knopf" onClick={() => setOffen(true)}>Ordner auf dem Dateiserver wählen …</button></div>
      <Show when={offen()}>
        <OrdnerFenster start={String(p.projekt.werte.ordner ?? '')} onZu={() => setOffen(false)}
          onWahl={(pfad) => { setOffen(false); ausfuehren({ objekt: 'projekt', art: 'aendern', objektId: p.projekt.id, werte: { ordner: pfad } }, `Ordner von „${p.projekt.werte.name}“ zuordnen`); }} />
      </Show>
    </Show>
  );
}

// ---------- Verwaltung: Verbindung zur Ablage ----------
function AblageVerbindung() {
  const m = () => modell('ablage');
  const z = () => sicht.ablage?.[m().einzeln!];
  const [lage, setLage] = createSignal<{ eingerichtet: boolean; kennwortGesetzt: boolean; nurLesen: boolean } | null>(null);
  const [ergebnis, setErgebnis] = createSignal<{ gut: boolean; text: string } | null>(null);
  const [kennwort, setKennwort] = createSignal(false);
  const holeLage = () => ruf<{ eingerichtet: boolean; kennwortGesetzt: boolean; nurLesen: boolean }>('/api/ablage/zustand').then(setLage, () => undefined);
  void holeLage();
  const pruefen = async () => {
    setErgebnis({ gut: true, text: 'Verbindung wird geprüft …' });
    try { const r = await ruf<{ ordner: number; dateien: number }>('/api/ablage/pruefen', {}); setErgebnis({ gut: true, text: `Verbindung steht. In der Freigabe liegen ${r.ordner} Ordner und ${r.dateien} Dateien.` }); }
    catch (e) { setErgebnis({ gut: false, text: (e as Error).message }); }
  };
  return (
    <Rahmen schluessel="verwaltung.ablage" inhalt={<section class="blatt schmal"><Show when={z()} fallback={<p class="still-text">Wird geladen …</p>}>{(zeile) => (
      <Detailkarte modell={m()} zeile={zeile()} zusatz={() => (
        <fieldset>
          <legend>Kennwort und Prüfung</legend>
          <p class="still-text klein-text">Das Kennwort wird verschlüsselt gespeichert und steht nie im Protokoll. {lage()?.kennwortGesetzt ? 'Es ist ein Kennwort hinterlegt.' : 'Es ist noch kein Kennwort hinterlegt.'}</p>
          <Show when={lage()?.nurLesen}><p class="hinweis-kasten">Testserver: Die Ablage wird hier nur gelesen. Auf dem Dateiserver wird nichts angelegt, geändert oder gelöscht.</p></Show>
          <div class="reihe"><button class="knopf" onClick={() => setKennwort(true)}>Kennwort eintragen …</button><button class="knopf haupt" onClick={pruefen}>Verbindung prüfen</button></div>
          <Show when={ergebnis()}>{(e) => <p classList={{ 'feld-fehler': !e().gut, 'gut-text': e().gut }} role="status">{e().text}</p>}</Show>
          <Show when={kennwort()}>
            <Dialog titel="Kennwort für den Dateiserver" onAbbrechen={() => setKennwort(false)} knoepfe={<button class="knopf" onClick={() => setKennwort(false)}>Abbrechen</button>}>
              <Formular knopf="Speichern" pfad="/api/ablage/kennwort" felder={[{ name: 'kennwort', titel: 'Kennwort des Benutzers auf dem Dateiserver', typ: 'password', auto: 'new-password' }]}
                onFertig={() => { setKennwort(false); hinweis('Kennwort gespeichert.'); void holeLage(); }} />
            </Dialog>
          </Show>
        </fieldset>
      )} />
    )}</Show></section>} />
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
    <Rahmen schluessel="verwaltung.rechte" inhalt={<section class="blatt">
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
    </section>} />
  );
}

// ---------- Verwaltung: Bürodaten (gibt es genau einmal) ----------
function Buero() {
  const m = () => modell('buero');
  const z = () => sicht.buero?.[m().einzeln!];
  return <Rahmen schluessel="verwaltung.buero" inhalt={<section class="blatt schmal"><Show when={z()} fallback={<p class="still-text">Bürodaten werden geladen …</p>}>{(zeile) => <Detailkarte modell={m()} zeile={zeile()} />}</Show></section>} />;
}

const EIGENE: Record<string, () => JSX.Element> = { 'verwaltung.rechte': Rechte, 'verwaltung.buero': Buero, 'verwaltung.ablage': AblageVerbindung, 'verwaltung.updates': Updates, 'verwaltung.aufbau': AufbauAnsicht, 'verwaltung.uebernahme': Altdaten, 'dateien.dateien': DateienAnsicht };
// Was die Module an den Bausteinen einstellen – nur über die vorgesehenen Stellschrauben (baukasten/anpassung.ts).
const ANPASSUNG: Record<string, Anpassung> = {
  projekt: {
    kartenZusatz: (z) => <><OrdnerWahl projekt={z} /><Beteiligte projekt={z} /><Mitglieder projekt={z} /></>,
    zelle: (f, z) => (f.name === 'status' ? <span class={`marke-${z.werte.status}`}>{f.optionen!.find((o) => o.wert === z.werte.status)?.titel}</span> : undefined),
  },
  // Gebäudemodell: in jeder seiner Ansichten lässt sich der Assistent starten und eine IFC-Datei einlesen
  ...Object.fromEntries(['bauteil', 'raum', 'geschoss', 'gebaeude'].map((o) => [o, {
    knoepfe: (z) => (darf('bauteil', 'schreiben') ? [{ titel: 'Assistent', zeichen: 'assistent', gruppe: 'Planen', tun: () => assistentStarten(String(z.projekt), String(z.version)) }, { titel: 'IFC einlesen', zeichen: 'datei_hoch', gruppe: 'Planen', tun: () => ifcEinlesen(String(z.projekt), String(z.version)) }] : []),
  } satisfies Anpassung])),
  tagesbericht: {
    // nächste Nummer im Projekt, heutiges Datum und Uhrzeit, Bauleitung: wer den Bericht anlegt
    neuVorgabe: (vorhandene) => ({ nummer: Math.max(0, ...vorhandene.map((z) => Number(z.werte.nummer) || 0)) + 1, datum: new Date().toLocaleDateString('sv'), uhrzeit: new Date().toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' }), bauleitung: ich().id }),
    mitte: (m) => <Berichtsseite {...m} />,
    links: (m) => <BerichtLinks {...m} />,
    linksTitel: 'Kalender',
    detailsHinweis: 'Im Bericht einen Eintrag anklicken – hier stehen dann Text, Firma, Frist und Erledigt, direkt änderbar. Der Stift ✎ im Kopf öffnet den ganzen Bericht.',
    details: (z) => (berichtDetailsDa() ? BerichtDetails(z) : undefined),
  },
  aufbau: { kartenZusatz: (z) => <AufbauSchichten aufbau={z} /> },
  kontakt: {
    kachel: (z) => <KontaktKachel kontakt={z} />,
    kartenZusatz: (z) => <KontaktProjekte kontakt={z} />,
    knoepfe: () => (darf('kontakt', 'loeschen') ? [{ titel: 'Aufräumen', zeichen: 'aufraeumen', gruppe: 'Liste', tun: aufraeumenOeffnen }] : []),
  },
  vorgang: { mitte: (m) => <Balkenplan {...m} />, kartenZusatz: (z) => <Nachfolger vorgang={z} /> },
  ki_anbindung: { kartenZusatz: (z) => <KiEinrichten anbindung={z} /> },
  freier_tag: { oben: (z) => <Arbeitszeit zusammenhang={z} /> },
  pruefzugang: { kartenZusatz: (z) => <PruefSchluessel zugang={z} /> },
  benutzer: {
    kartenZusatz: (z) => <KennwortSetzen benutzer={z} />,
    zelle: (f, z) => (f.name === 'gesperrt' && z.werte.gesperrt ? <span class="marke-gesperrt">gesperrt</span> : undefined),
  },
};

const anpassung = (objekt: string): Anpassung => ({ ...ANPASSUNG[objekt], kartenZusatz: kartenZusatz(objekt) });
/** Unter der Karte: was das Modul dort ergänzt, und – für alles, was sich drucken lässt – der Weg zum Ausdruck. */
export const kartenZusatz = (objekt: string) => (z: Zeile): JSX.Element => <>
  {ANPASSUNG[objekt]?.kartenZusatz?.(z)}
  <For each={ausdrucke(objekt)}>{(a) => <div class="karte-fuss"><button class="knopf" onClick={() => druckOeffnen(a.id, z.id)}>⎙ Drucken / PDF{ausdrucke(objekt).length > 1 ? ` – ${a.titel}` : ''}</button></div>}</For>
</>;

export function sichtbar(a: Ansicht): boolean {
  if (a.nurAdmin && !istAdmin()) return false;
  return a.objekt ? darf(a.objekt, 'lesen') : true;
}

// Ansicht, die zum oben gewählten Projekt gehört – bei Modulen mit Versionen zusätzlich zur gewählten Version.
function ProjektAnsicht(p: { modul: Beipackzettel; ansicht: Ansicht }) {
  const m = modell(p.ansicht.objekt!);
  const schluessel = `${p.modul.id}.${p.ansicht.id}`;
  const bereich = zustand()!.module.flatMap((x) => x.versionen ?? []).find((v) => v.bereich === m.versionsBereich);
  const projekt = () => { const id = projektId(); const z = id ? sicht.projekt?.[id] : undefined; return z && !z.geloescht ? z : undefined; };
  const versionen = createMemo(() => (!bereich || !projekt() ? [] : lebende('version').filter((v) => v.werte.projekt === projekt()!.id && v.werte.bereich === bereich.bereich)
    .sort((x, y) => String(x.werte.name).localeCompare(String(y.werte.name), 'de', { numeric: true }))));
  const aktiv = createMemo(() => { const g = projekt() && bereich ? gewaehlteVersion(projekt()!.id, bereich.bereich) : undefined; return versionen().find((v) => v.id === g) ?? versionen().find((v) => v.werte.gueltig) ?? versionen()[0]; });
  const vorlagen = () => (!bereich ? [] : lebende('version').filter((v) => v.werte.bereich === bereich.bereich && v.werte.projekt !== projekt()?.id)
    .map((v) => ({ wert: v.id, titel: `${sicht.projekt?.[String(v.werte.projekt)]?.werte.name ?? 'Projekt'} – ${v.werte.name}` })).sort((x, y) => x.titel.localeCompare(y.titel, 'de')));
  const neu = async (weg: Versionsweg, name: string, vorlage?: string) => {
    const pr = projekt()!.id, id = neueKennung();
    if (weg === 'leer') ausfuehren({ objekt: 'version', art: 'anlegen', objektId: id, werte: { projekt: pr, bereich: bereich!.bereich, name, gueltig: !versionen().some((v) => v.werte.gueltig), notiz: '' } }, `Version „${name}“ anlegen`);
    else {
      // Kopieren macht der Server in einem Stück (alle Einträge oder keiner) – das geht nur mit Verbindung.
      try { await ruf('/api/version/kopieren', { vorgang: neueKennung(), quelle: weg === 'kopie' ? aktiv()!.id : vorlage, projekt: pr, name, versionId: id }); }
      catch (e) { hinweis(`Version nicht angelegt: ${(e as Error).message}`, { art: 'fehler' }); return; }
    }
    waehleVersion(pr, bereich!.bereich, id);
  };
  const leiste = () => (
    <Versionsleiste titel={bereich!.titel} versionen={versionen()} aktiv={aktiv()?.id ?? null} wege={bereich!.wege} darfAendern={darf('version', 'schreiben')} vorlagen={vorlagen}
      onWahl={(id) => waehleVersion(projekt()!.id, bereich!.bereich, id)} onNeu={neu}
      onGueltig={(id) => ausfuehren({ objekt: 'version', art: 'aendern', objektId: id, werte: { gueltig: true } }, 'Version gültig machen')}
      onUmbenennen={(id, name) => ausfuehren({ objekt: 'version', art: 'aendern', objektId: id, werte: { name } }, 'Version umbenennen')}
      onLoeschen={(id) => ausfuehren({ objekt: 'version', art: 'loeschen', objektId: id }, 'Version löschen', true)} />
  );
  const leer = (text: string) => <div class="mitte"><p class="still-text">{text}</p></div>;
  // Listen ohne Versionen und ohne eigene Seite: auch über alle Projekte (Schalter über der Liste, gemerkt je Ansicht)
  const umfangMoeglich = !bereich && !ANPASSUNG[m.name]?.mitte;
  const [alle, setAlle] = createSignal(umfangMoeglich && (() => { try { return localStorage.getItem(`bp.umfang.${schluessel}`) === 'alle'; } catch { return false; } })());
  const umfang = (a: boolean) => { setAlle(a); try { localStorage.setItem(`bp.umfang.${schluessel}`, a ? 'alle' : 'projekt'); } catch { /* gesperrt */ } };
  const umfangLeiste = () => (
    <div class="umfang-leiste">
      <div class="auswahl" role="radiogroup" aria-label="Umfang">
        <button type="button" role="radio" aria-checked={!alle()} classList={{ aktiv: !alle() }} disabled={!projekt()} onClick={() => umfang(false)}>Dieses Projekt</button>
        <button type="button" role="radio" aria-checked={alle()} classList={{ aktiv: alle() }} onClick={() => umfang(true)}>Alle Projekte</button>
      </div>
      <Show when={alle()}><span class="still-text klein-text">Gegliedert nach Projekt – du siehst die Projekte, in denen du mitarbeitest.</span></Show>
    </div>
  );
  return (
    <Show when={!alle()} fallback={
      <ObjektAnsicht schluessel={`${schluessel}.alle`} modell={m} baum={[m.projektFeld!, ...(p.ansicht.baum ?? [])]} anpassung={anpassung(m.name)} unterMenue={umfangLeiste()}
        fest={() => ({ ...p.ansicht.filter })} />}>
    <Show when={projekt()} fallback={<Rahmen schluessel={schluessel} unterMenue={umfangMoeglich ? umfangLeiste() : undefined} inhalt={leer('Bitte oben ein Projekt wählen.')} />}>
      <Show when={!bereich || aktiv()} fallback={<Rahmen schluessel={schluessel} unterMenue={leiste()}
        inhalt={leer(`„${bereich!.titel}“ gibt es für dieses Projekt noch nicht.${darf('version', 'schreiben') ? ' Mit „+ Neue Version“ legst du die erste Version an.' : ''}`)} />}>
        <ObjektAnsicht schluessel={schluessel} modell={m} baum={p.ansicht.baum} anpassung={anpassung(m.name)} unterMenue={bereich ? leiste() : umfangMoeglich ? umfangLeiste() : undefined}
          fest={() => ({ [m.projektFeld!]: projekt()!.id, ...(bereich ? { version: aktiv()!.id } : {}), ...p.ansicht.filter })} />
      </Show>
    </Show>
    </Show>
  );
}

export function AnsichtZeigen(p: { modul: Beipackzettel; ansicht: Ansicht }) {
  const eigene = EIGENE[`${p.modul.id}.${p.ansicht.id}`];
  if (eigene) return eigene();
  if (p.ansicht.brauchtProjekt) return <ProjektAnsicht modul={p.modul} ansicht={p.ansicht} />;
  return <ObjektAnsicht schluessel={`${p.modul.id}.${p.ansicht.id}`} modell={modell(p.ansicht.objekt!)} baum={p.ansicht.baum} anpassung={anpassung(p.ansicht.objekt!)} fest={p.ansicht.filter ? () => p.ansicht.filter! : undefined} />;
}
