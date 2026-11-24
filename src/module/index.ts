// Alle Module des Programms. Ein neues Modul wird hier eingetragen – sonst nirgends.
import { Modulregister } from '../kern/modul';
import { adressen } from './adressen/beipackzettel';

export const register = new Modulregister([adressen]);
