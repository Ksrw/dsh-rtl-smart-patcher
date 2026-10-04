# RTL Smart Patcher for DeepSeek Harness

Smart right-to-left (Persian / Arabic / Hebrew) layout for the DeepSeek Harness
desktop app, with one tiny toggle inside the app itself.

<div dir="rtl">

**راست‌چین‌سازی هوشمند متن در DeepSeek Harness، با یک دکمهٔ کوچک در خود برنامه.**

متن چت (هم پاسخ مدل، هم پرامپتی که خودت می‌نویسی) راست‌چین می‌شود، ولی کد، ترمینال،
دیف، JSON و ویرایشگرها چپ‌چین می‌مانند. هیچ متنی بازنویسی نمی‌شود و هیچ کاراکتر
کنترلی به session اضافه نمی‌شود؛ فقط `direction` و `unicode-bidi` عوض می‌شوند.

</div>

---

## Install (one line)

PowerShell, no clone needed:

```powershell
irm https://raw.githubusercontent.com/Ksrw/dsh-rtl-smart-patcher/main/dsh-rtl-smart-patcher-install/install.ps1 | iex
```

Then **quit and reopen DeepSeek Harness** — the first installation needs a
restart. Later updates apply on a page reload once new client bundles are served.

To update after a new release, run the same line again.

### Install from a clone (CMD or PowerShell)

```powershell
.\dsh-rtl-smart-patcher-install\dsh-rtl.cmd              # install or update
.\dsh-rtl-smart-patcher-install\dsh-rtl.cmd restore      # remove
.\dsh-rtl-smart-patcher-install\dsh-rtl.cmd install -DryRun
```

Inside the installer folder, `.\dsh-rtl.cmd` alone is enough. If PowerShell
refuses to run the script, `-ExecutionPolicy Bypass` or CMD will do; the `.cmd`
entry point already sets what it needs.

## Use

| Where | What |
|---|---|
| Small `LTR` / `RTL` pill in the page corner | switch the layout |
| `Ctrl+Alt+R` anywhere in the app | same switch |
| **Plugins** page (sidebar) | disable the whole bundle |

The choice is remembered per browser.

## Uninstall

```powershell
$env:DSH_RTL_RESTORE=1; irm https://raw.githubusercontent.com/Ksrw/dsh-rtl-smart-patcher/main/dsh-rtl-smart-patcher-install/install.ps1 | iex
```

or, from a clone, `.\dsh-rtl-smart-patcher-install\dsh-rtl.cmd restore`.

## What it changes

**In the app**, when RTL is on:

- chat prose — the assistant's markdown answers, the plain-text bubble of your own
  prompts, context blocks, and the composer — becomes right-to-left, with
  `unicode-bidi: plaintext` so an English paragraph inside a Persian page keeps its
  own left-to-right flow;
- code blocks, terminal output, diffs, JSON trees, and editors are pinned back to
  left-to-right;
- a Persian-first font fallback chain (`Vazirmatn`, `Vazir`, `Sahel`,
  `Noto Naskh Arabic`, `Tahoma`, then the app's own family) is used for prose only.

**On disk**, the installer writes exactly two things:

1. `<profile>\node_modules\dsh-rtl-smart-patcher\` — the plugin package;
2. `<profile>\package.json` — its name added to `dependencies` and to
   `dsh.profile.bundles`.

The profile is `%USERPROFILE%\.dsh\profiles\desktop` (or `$env:DSH_HOME`, or
`-ProfileDir`). Your own `cordis.patch.yml` is never touched, and the bundle is
removable from the app's **Plugins** page like any other.

## Repository layout

```
dsh-rtl-smart-patcher/                 the installable bundle payload
  package.json                         bundle + client manifest, display metadata
  cordis.patch.yml                     the bundle's Loader layer: one browser row
  lib/index.js                         host half (no-op; the Client half owns the UI)
  lib/client.js                        browser half: RTL stylesheet + the toggle
  icon.svg, locale/*.json              Plugin Manager card text and artwork
dsh-rtl-smart-patcher-install/         the installer
  install.ps1                          local, remote, and uninstall paths
  dsh-rtl.cmd                          CMD / PowerShell entry point
  tools/                               validators, browser-free smoke test, helpers
test.ps1                               runs every offline check
```

## Verify

```powershell
.\test.ps1
```

Runs, with no browser and no running app:

- `validate-bundle.mjs` — manifest fields, exported resources, icon media type and
  size limit, locale dictionaries, the Loader patch parsed as YAML, and the
  browser bundle's registration shape;
- `client-smoke-test.mjs` — drives the shipped `lib/client.js` against a stub DOM
  and stub React: registration, render, click, the page flag, persistence, the
  keyboard shortcut, and disposal.

What these cannot establish is how the control looks inside the running app,
because that needs the page itself.

## Tuning

Everything visual lives in `dsh-rtl-smart-patcher/lib/client.js`:

| Want | Change |
|---|---|
| Move the pill | `document.documentElement.dataset.dshRtlOffset` → `bottom-left` (default), `bottom-right`, `top-left`, `top-right` |
| Start switched off | `readPersisted()` → return `false` |
| Different shortcut | the `SHORTCUT` constant at the top |
| Add a Persian font you installed | prepend it to the `font-family` chain in the `PROSE_SELECTOR` rule |

Re-run the installer after editing.

## License

MIT — see [LICENSE](LICENSE).
