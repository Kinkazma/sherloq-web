import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountMediaControls} from '../sherloq-browser/assets/media-controls.js';
import {validateMediaPreferences} from '../sherloq-browser/assets/media-settings.js';
import {validateLoupeEffects} from '../sherloq-browser/assets/loupe-effects-settings.js';

function setup({context = 'global'} = {}) {
  const {document, window} = parseHTML('<html><body><details id="settings-menu"><div><hr></div></details></body></html>');
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true, get() {return [...this.options].find(option => option.hasAttribute('selected'))?.value || this.options[0]?.value || '';}, set(value) {for (const option of this.options) option.toggleAttribute('selected', option.value === String(value));}});
  window.HTMLInputElement.prototype.checkValidity = function() {const value = Number(this.value), min = this.getAttribute('min'), max = this.getAttribute('max');return Number.isFinite(value) && (min === null || value >= Number(min)) && (max === null || value <= Number(max));};
  let preferences = validateMediaPreferences({loupe: {enabled: true}}), effects = validateLoupeEffects({}), enhance = {enabled: true, mode: 'contrast', percent: 20, channel: false};
  const broadcasts = [], preferenceSaves = [], updates = [], scans = [];
  const ui = mountMediaControls(document, {
    language: () => 'fr', getPreferences: () => preferences,
    setPreferences(value) {
      const next = validateMediaPreferences(value), effectsChanged = JSON.stringify(next.loupe.effects) !== JSON.stringify(preferences.loupe.effects);
      preferences = next; preferenceSaves.push(structuredClone(preferences));
      // Remembering a step target is not a global effect update. The real
      // analysis panel keeps tool-owned effects in its independent context.
      if (effectsChanged) {broadcasts.push(structuredClone(preferences)); if (context === 'local') effects = structuredClone(preferences.loupe.effects);}
      ui.sync();
    },
    getEffectsContext: () => context === 'local' ? effects : null,
    setEffectsContext(value) {effects = validateLoupeEffects(value); updates.push(structuredClone(effects));},
    getEnhancementContext: () => context === 'enhancement' ? enhance : null,
    setEnhancementContext(value) {enhance = {...value}; updates.push({...enhance});},
    onSweep: value => scans.push(value)
  });
  const field = key => document.querySelector('[data-effect="' + key + '"]');
  function enable(group) {const input = field(group + '.enabled'); input.checked = true; input.onchange();}
  function edit(key, value) {const input = field(key); if (input.type === 'checkbox') input.checked = value; else input.value = value; input.oninput();}
  return {document, ui, field, enable, edit, broadcasts, preferenceSaves, updates, scans, preferences: () => preferences, effects: () => effects, enhance: () => enhance};
}

for (const [group, key, value] of [['adjust', 'brightness', 17], ['enhance', 'percent', 31], ['sweep', 'width', 49]]) {
  test('global ' + group + ' stays enabled after parameter changes and retains the other effect groups', () => {
    const h = setup();
    try {
      for (const name of ['adjust', 'enhance', 'sweep']) h.enable(name);
      h.edit(group + '.' + key, value);
      for (const name of ['adjust', 'enhance', 'sweep']) assert.equal(h.preferences().loupe.effects[name].enabled, true);
      assert.equal(h.preferences().loupe.effects[group][key], value); assert.equal(h.preferences().loupe.enabled, true);
      assert.equal(h.field(group + '.enabled').checked, true);
      h.document.querySelector('[data-effect-scan="' + group + '"]').onclick(); assert.deepEqual(h.scans, [group]);
      h.ui.translate(); assert.equal(h.field(group + '.enabled').checked, true);
    } finally {h.ui.dispose();}
  });
}

for (const [group, key, value] of [['adjust', 'gamma', 14], ['enhance', 'percent', 33], ['sweep', 'position', 84]]) {
  test('tool-owned ' + group + ' changes do not rebroadcast an obsolete global disabled preset', () => {
    const h = setup({context: 'local'});
    try {
      h.enable(group); h.edit(group + '.' + key, value);
      assert.equal(h.effects()[group].enabled, true); assert.equal(h.effects()[group][key], value);
      assert.equal(h.preferences().loupe.effects[group].enabled, false);
      assert.equal(h.broadcasts.length, 0); assert.equal(h.updates.length, 2);
      const target = {adjust:'adjust.sweep', enhance:'enhance.percent', sweep:'sweep.position'}[group];
      assert.equal(h.preferences().loupe.stepTarget, target);
      assert.equal(h.preferences().loupe.stepSize, 10);
      if (group !== 'adjust') assert.equal(h.preferenceSaves.length, 1, 'new family selection is saved independently of global effects');
      assert.equal(h.field(group + '.enabled').checked, true); assert.equal(h.field(group + '.' + key).disabled, false);
      assert.equal(h.document.querySelector('[data-effect-number="' + group + '.' + key + '"]').value, String(value));
      h.ui.sync(); assert.equal(h.effects()[group].enabled, true);
    } finally {h.ui.dispose();}
  });
}

test('the Enhanced magnifier owns its parameters without enabling its independent global effect', () => {
  const h = setup({context: 'enhancement'});
  try {
    assert.equal(h.field('enhance.enabled').checked, true); assert.equal(h.field('enhance.enabled').disabled, true);
    h.edit('enhance.percent', 37); h.edit('enhance.channel', true); h.edit('enhance.mode', 'equalize');
    assert.deepEqual(h.enhance(), {enabled: true, mode: 'equalize', percent: 37, channel: true});
    assert.equal(h.preferences().loupe.effects.enhance.enabled, false); assert.equal(h.broadcasts.length, 0);
    assert.equal(h.updates.length, 3); assert.equal(h.preferences().loupe.enabled, true);
    h.enable('adjust'); h.edit('adjust.brightness', 19);
    assert.equal(h.preferences().loupe.effects.adjust.enabled, true); assert.equal(h.preferences().loupe.effects.adjust.brightness, 19);
    assert.equal(h.enhance().mode, 'equalize'); assert.equal(h.field('enhance.enabled').checked, true);
  } finally {h.ui.dispose();}
});

test('ordinary loupe geometry edits preserve all enabled effect groups and the global L state', () => {
  const h = setup();
  try {
    for (const name of ['adjust', 'enhance', 'sweep']) h.enable(name);
    const diameter = h.document.querySelector('[data-loupe="diameter"]'); diameter.value = '420'; diameter.oninput();
    const zoom = h.document.querySelector('[data-loupe-number="zoom"]'); zoom.value = '280'; zoom.oninput();
    assert.equal(h.preferences().loupe.enabled, true); assert.equal(h.preferences().loupe.zoom, 280);
    for (const name of ['adjust', 'enhance', 'sweep']) assert.equal(h.preferences().loupe.effects[name].enabled, true);
  } finally {h.ui.dispose();}
});
