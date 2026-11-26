// Alle Module des Programms. Ein neues Modul wird hier eingetragen – sonst nirgends.
import { Modulregister } from '../kern/modul';
import { adressen } from './adressen/beipackzettel';
import { ava } from './ava/beipackzettel';
import { bautagebuch } from './bautagebuch/beipackzettel';
import { bauzeitenplan } from './bauzeitenplan/beipackzettel';
import { dateien } from './dateien/beipackzettel';
import { gebaeudemodell } from './gebaeudemodell/beipackzettel';
import { kataloge } from './kataloge/beipackzettel';
import { projekte } from './projekte/beipackzettel';
import { verwaltung } from './verwaltung/beipackzettel';

export const register = new Modulregister([adressen, projekte, gebaeudemodell, dateien, bautagebuch, bauzeitenplan, ava, kataloge, verwaltung]);
