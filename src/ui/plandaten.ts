// Der Bauzeitenplan eines Projekts, wie ihn andere Apps lesen (Startseite, Bautagebuch): aus den Einträgen im Gerät gerechnet.
import type { Zeile } from '../kern/befehl';
import { planAus, type Plan } from '../module/bauzeitenplan/plan';
import { gemerkt, lebende } from './unterbau/abgleich';
import { gewaehlteVersion } from './projekt';

/** Die Versionen des Bauzeitenplans eines Projekts. */
export const planVersionen = (projekt: string): Zeile[] => lebende('version').filter((v) => v.werte.projekt === projekt && v.werte.bereich === 'bauzeitenplan');
/** Die Version, mit der man gerade arbeitet: die im Bauzeitenplan gewählte, sonst die gültige, sonst die erste. */
export const aktuelleVersion = (projekt: string): Zeile | undefined => { const v = planVersionen(projekt); return v.find((x) => x.id === gewaehlteVersion(projekt, 'bauzeitenplan')) ?? v.find((x) => x.werte.gueltig) ?? v[0]; };
/** Der Plan einer Version – je Version gemerkt, bis sich Leistungen, Verknüpfungen oder Kalender ändern. */
export const planDerVersion = (version: string): Plan =>
  gemerkt(['vorgang', 'verknuepfung', 'zeitplan', 'freier_tag'], `plan:${version}`, () => {
    const in_ = (o: string) => lebende(o).filter((x) => x.werte.version === version);
    return planAus({ vorgaenge: in_('vorgang'), links: in_('verknuepfung'), zeitplan: in_('zeitplan')[0]?.werte, frei: in_('freier_tag'), land: '', heute: new Date().toLocaleDateString('sv') });
  });
