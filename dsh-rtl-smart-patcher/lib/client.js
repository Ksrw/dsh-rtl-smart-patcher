/**
 * Browser half of `dsh-rtl-smart-patcher` — the RTL engine and its toggle.
 *
 * The module registers one lazy factory with the page's module loader. The
 * factory's side effects are limited to importing React from the platform
 * module table and building the plugin object; every resource it adds to the
 * document lives inside `apply` and is disposed with the plugin's own effect.
 *
 * Design rules that keep this patch unobtrusive:
 *   - It never rewrites text. Direction is a presentation property (`dir` /
 *     `unicode-bidi`), so copied text, session logs, prompts, and model input
 *     stay byte-identical, and English paragraphs inside a Persian page keep
 *     their own left-to-right flow.
 *   - It touches only text-bearing surfaces. Code blocks, the terminal, editors,
 *     diffs, and tool payloads keep their direction and layout.
 *   - It borrows the host theme tokens for its own control and overrides no host
 *     token, so it follows light and dark themes instead of fighting them.
 *
 * @module dsh-rtl-smart-patcher/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-rtl-smart-patcher',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;

    /** Bumped when the stored shape or the meaning of the preference changes. */
    const STORAGE_KEY = 'dsh-rtl-smart-patcher.preference.v1';
    const ROOT_FLAG = 'dsh-rtl';
    const SHORTCUT = { key: 'r', ctrl: true, alt: true };

    /* ------------------------------------------------------------------ *
     * Preference store: one boolean, one localStorage key, no dependency. *
     * ------------------------------------------------------------------ */

    const listeners = new Set();

    function readPersisted() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) !== 'off';
      } catch {
        return true;
      }
    }

    function writePersisted(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
      } catch {
        /* A browser that refuses storage still gets the in-memory toggle. */
      }
    }

    const store = {
      enabled: false,
      /** @param {() => void} listener @returns {() => void} disposer */
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set(next) {
        if (store.enabled === next) return;
        store.enabled = next;
        for (const listener of listeners) listener();
      },
      toggle() {
        store.set(!store.enabled);
        writePersisted(store.enabled);
      },
    };

    /* ------------------------------------------------------------- *
     * Stylesheet: the whole visual contract, scoped under one flag.  *
     * ------------------------------------------------------------- */

    const PROSE_SELECTOR = [
      "html[data-dsh-rtl] [class*='_markdown_']",
      "html[data-dsh-rtl] .markdown",
      "html[data-dsh-rtl] [data-context-text]",
      "html[data-dsh-rtl] [data-system-prompt-body]",
      "html[data-dsh-rtl] [data-message-attachments]",
      "html[data-dsh-rtl] [data-turn-process-answer]",
      /* The prompt you typed is not markdown: it renders as a plain-text bubble
         (`MessageItem.module.css` → `bubble`) inside the right-aligned user row.
         Without this selector only the answers were right-to-left. */
      "html[data-dsh-rtl] [class*='_bubble_']",
    ].join(',\n');

    const CSS = String.raw`
/* ── dsh-rtl-smart-patcher ────────────────────────────────────────────────
   Every rule is scoped under html[data-dsh-rtl], so switching the control off
   restores the host layout exactly and leaves no computed-style residue. */

${PROSE_SELECTOR} {
  direction: rtl !important;
  /* Each paragraph picks its own direction from its first strong character, so
     an English paragraph is not dragged to the right and Persian punctuation
     lands on the reading side. */
  unicode-bidi: plaintext !important;
  text-align: right !important;
  /* A Persian-first fallback chain that keeps the host's own families last. */
  font-family: Vazirmatn, Vazir, Sahel, 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma,
    var(--dsw-font-family, sans-serif) !important;
}

/* Text surfaces that hold prose rather than code. */
html[data-dsh-rtl] [data-composer-seat] [contenteditable='true'],
html[data-dsh-rtl] [data-composer-seat] textarea,
html[data-dsh-rtl] [data-context-text] :where(input, textarea) {
  direction: rtl !important;
  unicode-bidi: plaintext !important;
  text-align: right !important;
}

/* Lists read from the right edge; their markers follow the content. */
${PROSE_SELECTOR} :where(ul, ol) {
  padding-left: 0 !important;
  padding-right: 22px !important;
}
${PROSE_SELECTOR} :where(ul, ol) :where(ul, ol) {
  padding-right: 18px !important;
}

/* Blockquote, table, and separator mirror with the text. */
${PROSE_SELECTOR} blockquote {
  border-left: 0 !important;
  border-right: 2px solid var(--dsw-alias-border-l2, currentColor) !important;
  padding-left: 0 !important;
  padding-right: 14px !important;
}
${PROSE_SELECTOR} :where(th, td) {
  text-align: right !important;
}
${PROSE_SELECTOR} :where(th, td):first-child {
  padding-left: 16px !important;
  padding-right: 0 !important;
}
${PROSE_SELECTOR} :where(th, td):last-child {
  padding-right: 16px !important;
  padding-left: 0 !important;
}

/* ── LTR islands: code, terminal, editors, diffs, tool payloads ──────────
   Code and machine output stay exactly as authored, whatever the page
   direction is. These rules come last, so they win over the ones above. */
html[data-dsh-rtl] [class*='_markdown_'] :where(pre, code, kbd, samp),
html[data-dsh-rtl] [class*='_markdown_'] :where(.md-code-block, .md-code-block *),
html[data-dsh-rtl] .monaco-editor,
html[data-dsh-rtl] .monaco-editor *,
html[data-dsh-rtl] .xterm,
html[data-dsh-rtl] .xterm *,
html[data-dsh-rtl] [data-diff-line],
html[data-dsh-rtl] [data-tool-payload],
html[data-dsh-rtl] [class*='_jsonTree_'],
html[data-dsh-rtl] [class*='_JsonTree_'] {
  direction: ltr !important;
  unicode-bidi: normal !important;
  text-align: left !important;
}

/* ── The toggle control ──────────────────────────────────────────────────
   One small pill on the shell overlay layer, styled only from host tokens. */
.dsh-rtl-toggle {
  position: fixed;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  height: 26px;
  padding: 0 9px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgb(0 0 0 / 12%));
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-button-floating-fill, var(--dsw-alias-bg-layer-1, #fff));
  color: var(--dsw-alias-label-tertiary, #81858c);
  font: 600 11px/16px var(--dsw-font-family, system-ui, sans-serif);
  letter-spacing: 0.04em;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity var(--ds-transition-duration, 0.2s) var(--ds-ease-in-out, ease),
    color var(--ds-transition-duration, 0.2s) var(--ds-ease-in-out, ease),
    border-color var(--ds-transition-duration, 0.2s) var(--ds-ease-in-out, ease);
}
.dsh-rtl-toggle:hover,
.dsh-rtl-toggle:focus-visible {
  opacity: 1;
  color: var(--dsw-alias-label-primary, #0f1115);
  border-color: var(--dsw-alias-border-l3, rgb(0 0 0 / 22%));
  background: var(--dsw-alias-button-floating-hover, var(--dsw-alias-bg-layer-2, #f5f5f5));
}
.dsh-rtl-toggle:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #247bbf));
  outline-offset: 2px;
}
.dsh-rtl-toggle[data-active='true'] {
  opacity: 1;
  color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary, #0f1115));
  border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-border-l3, rgb(0 0 0 / 22%)));
}
.dsh-rtl-toggle__glyph {
  display: block;
  flex: none;
}

/* Placement, mirrored so the control never sits over the reading column. */
html[data-dsh-rtl-offset='bottom-left'] .dsh-rtl-toggle {
  left: var(--dsh-composer-side-clearance, 16px);
  bottom: calc(var(--dsh-composer-dock-inset, 12px) + 40px);
}
html[data-dsh-rtl-offset='bottom-right'] .dsh-rtl-toggle {
  right: var(--dsh-composer-side-clearance, 16px);
  bottom: calc(var(--dsh-composer-dock-inset, 12px) + 40px);
}
html[data-dsh-rtl-offset='top-left'] .dsh-rtl-toggle {
  left: var(--dsh-composer-side-clearance, 16px);
  top: calc(var(--dsh-frame-overlay-top, 44px) + 8px);
}
html[data-dsh-rtl-offset='top-right'] .dsh-rtl-toggle {
  right: var(--dsh-composer-side-clearance, 16px);
  top: calc(var(--dsh-frame-overlay-top, 44px) + 8px);
}
`;

    /* ------------------------------------------------------- *
     * Toggle control                                          *
     * ------------------------------------------------------- */

    /**
     * Glyph naming the direction the toggle would turn on: text lines whose
     * ragged edge sits on the reading side.
     *
     * @param {{ rtl: boolean }} props
     */
    function DirectionGlyph(props) {
      const rtl = props.rtl;
      const lines = [
        { y: 3.25, width: 10, left: rtl ? 4.25 : 1.25 },
        { y: 7, width: 12, left: 1.25 },
        { y: 10.75, width: 7, left: rtl ? 4.25 : 1.25 },
      ];
      return h(
        'svg',
        {
          className: 'dsh-rtl-toggle__glyph',
          width: 15,
          height: 15,
          viewBox: '0 0 15 15',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        lines.map((line, index) =>
          h('rect', {
            key: index,
            x: line.left,
            y: line.y,
            width: line.width,
            height: 1.5,
            rx: 0.75,
            fill: 'currentColor',
          }),
        ),
      );
    }

    /** The single overlay control; reads and writes the module-level store. */
    function RtlToggle() {
      const enabled = React.useSyncExternalStore(
        store.subscribe,
        () => store.enabled,
        () => store.enabled,
      );
      const title = enabled
        ? 'RTL layout is on — click to switch back to LTR (Ctrl+Alt+R)'
        : 'Right-to-left (Persian/Arabic) layout (Ctrl+Alt+R)';
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-rtl-toggle',
          'data-active': enabled ? 'true' : 'false',
          'data-dsh-rtl-toggle': '',
          'aria-pressed': enabled,
          title,
          'aria-label': title,
          onClick: () => store.toggle(),
        },
        h(DirectionGlyph, { rtl: !enabled }),
        enabled ? 'RTL' : 'LTR',
      );
    }

    /* ------------------------------------------------------- *
     * Page-level side effects                                 *
     * ------------------------------------------------------- */

    /** Apply or remove every page-level trace of the patch. */
    function syncDocument() {
      const root = document.documentElement;
      if (store.enabled) root.setAttribute('data-' + ROOT_FLAG, '');
      else root.removeAttribute('data-' + ROOT_FLAG);
    }

    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.key.toLowerCase() !== SHORTCUT.key) return;
      if (Boolean(event.ctrlKey) !== SHORTCUT.ctrl) return;
      if (Boolean(event.altKey) !== SHORTCUT.alt) return;
      if (event.shiftKey || event.metaKey) return;
      event.preventDefault();
      store.toggle();
    }

    return {
      inject: ['slots'],

      /**
       * Install the stylesheet, the shortcut, and the overlay control.
       *
       * @param {object} ctx - Client plugin context with the injected `slots` service.
       */
      apply(ctx) {
        document.documentElement.dataset.dshRtlOffset = 'bottom-left';
        store.set(readPersisted());

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = 'dsh-rtl-smart-patcher';
          style.dataset.pluginCss = 'dsh-rtl-smart-patcher/rtl.css';
          style.textContent = CSS;
          document.head.appendChild(style);

          syncDocument();
          window.addEventListener('keydown', onKeyDown, true);
          const unsubscribe = store.subscribe(syncDocument);

          return () => {
            unsubscribe();
            window.removeEventListener('keydown', onKeyDown, true);
            style.remove();
            document.documentElement.removeAttribute('data-' + ROOT_FLAG);
          };
        }, 'dsh-rtl-smart-patcher: stylesheet, shortcut, and page flag');

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'rtl-smart-patcher', order: 50 },
            RtlToggle,
          ),
        );
      },
    };
  },
});
