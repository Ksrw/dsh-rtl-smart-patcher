/**
 * Smoke-test the shipped client bundle without a browser.
 *
 * The bundle runs in a lazy-CJS page: it calls
 * `window.__ModuleLoader__.load({ id, factory })`, and the factory receives a
 * `require` that resolves the page's shared module table. This harness provides
 * exactly that much DOM and React, then drives the control end to end:
 * register → render → click → page flag → click again → shortcut → disposal.
 *
 * Usage: node tools/client-smoke-test.mjs
 */
import { readFileSync } from 'node:fs';

const SRC = 'dsh-rtl-smart-patcher/lib/client.js';
const log = [];
const check = (name, condition) => {
  log.push(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) process.exitCode = 1;
};

/* ── minimal element harness ─────────────────────────────────────────────── */

function createElement(tagName) {
  const attributes = new Map();
  return {
    tagName,
    children: [],
    dataset: {},
    style: {},
    textContent: '',
    parentNode: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
  };
}

const documentElement = createElement('html');
const head = createElement('head');
const listeners = new Map();

const document = {
  documentElement,
  head,
  createElement,
  querySelector: () => null,
};

const window = {
  document,
  addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(handler);
  },
  removeEventListener(type, handler) {
    listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== handler));
  },
  localStorage: {
    values: new Map(),
    getItem(key) {
      return window.localStorage.values.has(key) ? window.localStorage.values.get(key) : null;
    },
    setItem(key, value) {
      window.localStorage.values.set(key, String(value));
    },
  },
};

/* ── React stub: only what the plugin uses ───────────────────────────────── */

let rerender = () => {};
const React = {
  createElement(type, props, ...children) {
    if (typeof type === 'function') return type({ ...(props ?? {}), children });
    const element = createElement(type);
    Object.assign(element, props ?? {});
    element.children = children.flat().filter((child) => child !== null && child !== undefined);
    return element;
  },
  /**
   * The real hook subscribes once per mounted component and notifies only when
   * the snapshot changes. This stub keeps one subscription at a time and drops
   * it before the next render, which is enough to prove that a store change
   * reaches the control. `rerender` stays a no-op until the driving section
   * sets it, so subscribing can never recurse on its own.
   */
  useSyncExternalStore(subscribe, getSnapshot) {
    if (React.__unsubscribe) {
      React.__unsubscribe();
      React.__unsubscribe = undefined;
    }
    const snapshot = getSnapshot();
    React.__unsubscribe = subscribe(() => {
      if (getSnapshot() !== snapshot) rerender();
    });
    return snapshot;
  },
};

/* ── the page's module loader and plugin host ────────────────────────────── */

let registration;
globalThis.window = window;
globalThis.document = document;
window.__ModuleLoader__ = {
  load(row) {
    registration = row;
  },
};

const moduleSource = readFileSync(SRC, 'utf8');
new Function('window', 'document', moduleSource)(window, document);

check('bundle registers exactly one module row', registration !== undefined);
check('row id is the package name', registration?.id === 'dsh-rtl-smart-patcher');

const plugin = registration.factory((request) => {
  if (request === 'react') return React;
  throw new Error(`unexpected require: ${request}`);
});

check('factory returns a plugin object with apply()', typeof plugin.apply === 'function');
check('plugin injects the slots service', JSON.stringify(plugin.inject) === '["slots"]');

/* ── run apply() against a fake client context ───────────────────────────── */

const effects = [];
let registeredEntry;
const ctx = {
  effect(callback, label) {
    const dispose = callback();
    effects.push({ dispose, label });
    return dispose;
  },
  slots: {
    inject(key, callback) {
      check('slots.inject targets shell.overlay', key === 'shell.overlay');
      callback();
    },
    register(options, component) {
      registeredEntry = { options, component };
      return () => {};
    },
  },
};

plugin.apply(ctx);

check('one effect was installed', effects.length === 1);
check('the effect is labelled for diagnostics', typeof effects[0].label === 'string' && effects[0].label.length > 0);
check('a stylesheet was appended with the plugin marker', head.children.length === 1 && head.children[0].tagName === 'style');
check('the stylesheet is scoped under the rtl flag', head.children[0].textContent.includes('html[data-dsh-rtl]'));
check('code blocks are pinned back to LTR', head.children[0].textContent.includes('.md-code-block'));
check('the registration targets shell.overlay', registeredEntry?.options.name === 'shell.overlay');
check('the registration is a list entry with an order', registeredEntry?.options.order === 50);

/* ── drive the control ───────────────────────────────────────────────────── */

rerender = () => {
  rendered = registeredEntry.component({});
};

let rendered = registeredEntry.component({});
check('the control starts pressed (default is on)', rendered['aria-pressed'] === true);
check('the control starts with the RTL page flag', documentElement.hasAttribute('data-dsh-rtl'));
check('the placement flag is published', documentElement.dataset.dshRtlOffset === 'bottom-left');

rendered.onClick();
check('clicking turns the flag off', !documentElement.hasAttribute('data-dsh-rtl'));
check('the preference is persisted as off', window.localStorage.getItem('dsh-rtl-smart-patcher.preference.v1') === 'off');

rendered = registeredEntry.component({});
check('the control re-renders unpressed', rendered['aria-pressed'] === false);

rendered.onClick();
check('clicking turns the flag back on', documentElement.hasAttribute('data-dsh-rtl'));
check('the preference is persisted as on', window.localStorage.getItem('dsh-rtl-smart-patcher.preference.v1') === 'on');

/* ── the keyboard shortcut ───────────────────────────────────────────────── */

const keydown = listeners.get('keydown')?.at(-1);
check('a keydown listener was installed', typeof keydown === 'function');

let prevented = 0;
keydown({
  key: 'R',
  ctrlKey: true,
  altKey: true,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  defaultPrevented: false,
  preventDefault: () => {
    prevented += 1;
  },
});
check('Ctrl+Alt+R toggles the flag off', !documentElement.hasAttribute('data-dsh-rtl'));
check('the shortcut consumes the event', prevented === 1);

keydown({
  key: 'r',
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  defaultPrevented: false,
  preventDefault: () => {
    prevented += 1;
  },
});
check('Ctrl+R alone is ignored', !documentElement.hasAttribute('data-dsh-rtl') && prevented === 1);

/* ── disposal ────────────────────────────────────────────────────────────── */

effects[0].dispose();
check('disposal removes the stylesheet', head.children.length === 0);
check('disposal clears the page flag', !documentElement.hasAttribute('data-dsh-rtl'));
check('disposal removes the keydown listener', (listeners.get('keydown') ?? []).length === 0);

/* ── the restored preference on the next page load ───────────────────────── */

// `readPersisted` is lifted out of the shipped source and evaluated with the
// module constant it closes over, so this asserts the real function rather than
// a copy of its logic. The `'use strict'` prefix keeps a mistyped constant loud
// instead of silently falling into the function's own catch.
const readPersistedSource = /function readPersisted\(\) \{[\s\S]*?\n    \}/.exec(moduleSource)?.[0];
const storageKey = /const STORAGE_KEY = '([^']+)'/.exec(moduleSource)?.[1];
check('the source exposes readPersisted', typeof readPersistedSource === 'string');
check('the storage key is discoverable', typeof storageKey === 'string');
if (typeof readPersistedSource === 'string' && typeof storageKey === 'string') {
  const build = (scope) =>
    new Function(
      'window',
      'STORAGE_KEY',
      `'use strict'; ${readPersistedSource}; return readPersisted;`,
    )(scope, storageKey);

  const readPersisted = build(window);

  window.localStorage.values.clear();
  check('a first run defaults to on', readPersisted() === true);
  window.localStorage.setItem(storageKey, 'off');
  check('stored "off" is honoured', readPersisted() === false);
  window.localStorage.setItem(storageKey, 'on');
  check('stored "on" is honoured', readPersisted() === true);

  // A browser that refuses storage must still load the page.
  const readWithBrokenStorage = build({
    localStorage: {
      getItem: () => {
        throw new Error('storage disabled');
      },
    },
  });
  check('unavailable storage degrades to on', readWithBrokenStorage() === true);
}

console.log(log.join('\n'));
console.log(process.exitCode === 1 ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
