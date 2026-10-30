// The one "typing in a field" guard (shared/input/typing.js) that every keyboard shortcut handler asks: which elements are
// fields, and which keys a field keeps (Ctrl+A, the clipboard, undo, word delete, Home/End, AltGr characters).
// Covers: shared/input/typing.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const T = createRequire(import.meta.url)('../../shared/input/typing.js');
const el = (tagName, o = {}) => ({ nodeType: 1, tagName, type: o.type || '', isContentEditable: !!o.ce });
const key = (k, o = {}) => ({ key: k, ctrlKey: !!o.ctrl, metaKey: !!o.meta, altKey: !!o.alt, shiftKey: !!o.shift, target: o.target || el('DIV') });

test('fields: text inputs, textareas, selects and contenteditables; not buttons, checkboxes or sliders', () => {
  for (const e of [el('TEXTAREA'), el('INPUT'), el('INPUT', { type: 'search' }), el('INPUT', { type: 'email' }), el('SELECT'), el('DIV', { ce: true })]) assert.equal(T.editable(e), true, e.tagName + e.type);
  for (const e of [el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'range' }), el('BUTTON'), el('DIV'), null, { nodeType: 3 }]) assert.equal(T.editable(e), false);
  assert.equal(T.isTyping(el('INPUT', { type: 'range' }), { controls: true }), true, 'a slider keeps its keys from canvas navigation');
});

test('isTyping takes an element or a key event, and looks inside a shadow root (composedPath)', () => {
  assert.equal(T.isTyping(el('TEXTAREA')), true);
  assert.equal(T.isTyping(key('a', { target: el('TEXTAREA') })), true);
  const inner = el('INPUT'), host = el('SLOP-FIELD');
  assert.equal(T.isTyping({ key: 'a', target: host, composedPath: () => [inner, host] }), true);
  assert.equal(T.isTyping(key('a')), false);
});

test('the field keeps every plain key and its editing shortcuts; other Ctrl/⌘ shortcuts still reach the app', () => {
  for (const k of ['a', 'Z', ' ', 'Enter', 'Escape', 'Backspace', 'Delete', 'Home', 'End', 'ArrowUp', 'F2']) assert.equal(T.fieldKey(key(k)), true, k);
  for (const k of ['a', 'A', 'c', 'v', 'x', 'z', 'y', 'Backspace', 'Delete', 'Insert', 'ArrowLeft', 'Home', 'End']) {
    assert.equal(T.fieldKey(key(k, { ctrl: true })), true, 'Ctrl+' + k);
    assert.equal(T.fieldKey(key(k, { meta: true })), true, '⌘' + k);
  }
  assert.equal(T.fieldKey(key('Z', { ctrl: true, shift: true })), true, 'redo');
  for (const k of ['s', 'k', 'p', 'b', 'Enter', '0']) assert.equal(T.fieldKey(key(k, { ctrl: true })), false, 'Ctrl+' + k);
  assert.equal(T.fieldKey(key('@', { ctrl: true, alt: true })), true, 'AltGr+Q types @ on a German keyboard');
  assert.equal(T.fieldKey(key('b', { ctrl: true, alt: true })), false, 'Ctrl+Alt+B is a shortcut');
  assert.equal(T.fieldKey(key('z', { ctrl: true, alt: true })), false, 'Ctrl+Alt+Z is a shortcut (Slop Code: line wrap)');
});

test('yields: only in a field, and only for the field’s keys', () => {
  const ta = el('TEXTAREA');
  assert.equal(T.yields(key('a', { ctrl: true, target: ta })), true);
  assert.equal(T.yields(key('s', { ctrl: true, target: ta })), false);
  assert.equal(T.yields(key('a', { ctrl: true })), false, 'Ctrl+A on the canvas is the app’s Select all');
  assert.equal(T.yields(key('Delete', { target: el('DIV', { ce: true }) })), true);
});

test('an app editor’s hidden textarea (data-slop-keys="app": Slop Docs, Slop Press) leaves Ctrl+Z, Ctrl+A… to the app', () => {
  const ime = Object.assign(el('TEXTAREA'), { closest: (s) => (s === '[data-slop-keys="app"]' ? ime : null) });
  assert.equal(T.isTyping(ime), true, 'plain letters are still typed, never shortcuts');
  assert.equal(T.yields(key('z', { ctrl: true, target: ime })), false);
  assert.equal(T.yields(key('a', { ctrl: true, target: Object.assign(el('TEXTAREA'), { closest: () => null }) })), true);
});
