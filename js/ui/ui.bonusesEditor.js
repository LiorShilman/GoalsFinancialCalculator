// ui.bonusesEditor.js
import { Bus } from '../core.bus.js';

let _bonuses = []; // [{month, amount}, ...]

export const UIBonusesEditor = {
  get() { return _bonuses.map(b => ({...b})); },
  set(list) { _bonuses = Array.isArray(list) ? list.map(b=>({...b})) : []; Bus.emit('ui:bonuses:changed', UIBonusesEditor.get()); },
  add(bonus) { _bonuses.push({...bonus}); Bus.emit('ui:bonuses:changed', UIBonusesEditor.get()); },
  removeAt(i) { _bonuses.splice(i,1); Bus.emit('ui:bonuses:changed', UIBonusesEditor.get()); },
  clear() { _bonuses = []; Bus.emit('ui:bonuses:changed', UIBonusesEditor.get()); }
};