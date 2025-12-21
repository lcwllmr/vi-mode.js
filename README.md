# `vi-mode.js`: lightweight vi-like editor component for the web

[![npm version](https://img.shields.io/npm/v/vi-mode.svg)](https://www.npmjs.com/package/vi-mode)
[![codecov](https://codecov.io/gh/lcwllmr/vi-mode.js/branch/main/graph/badge.svg)](https://codecov.io/gh/lcwllmr/vi-mode.js)

Setup for local development: clone the repo and `cd` into it, then run:

```bash
npm i
npx simple-git-hooks

# dev commands
npm run dev # starts local dev server for live demo
npm run test:watch # runs unit tests in watch mode
```

## Usage

Create the DOM nodes for the editor yourself and wire the keyboard handler explicitly:

```ts
import { initializeEditorDom, ViModeController } from "vi-mode";

const container = document.getElementById("editor") as HTMLDivElement;
const dom = initializeEditorDom(container, "Hello, world!");
const controller = new ViModeController({ dom });

container.addEventListener("keydown", (event) =>
  controller.processKeyboardEvent(event),
);
```

For a full-featured editor with the built-in keybindings, use the quickstart helper:

```ts
import { createFullEditor } from "vi-mode";

const { controller, dom } = createFullEditor(container, {
  initialContent: "Hello!",
});
container.addEventListener("keydown", (event) =>
  controller.processKeyboardEvent(event),
);
```

You can also build your own maps for normal/visual/insert mode using the exported building blocks (`KeyMapper`, `NormalModeCommandResolver`, `VisualModeCommandResolver`, `createMotions`, `createInsertKeymap`, `createDefaultKeyMapper`). Pass a custom `keyMapper` into `ViModeController` to enable or disable actions and wire keys to different consumers (e.g. let `Escape` exit insert mode while also handing control back to a parent notebook layout).

## Roadmap and Changelog

Planned features for upcoming releases:

- deal with horizontal and vertical scrolling
- configuration options (like colors and tab size)
- change commands in normal mode `c[motion]`, `cc`
- word based motions `w`, `b`, `e`

`v0.5.0`: api overhaul

- [x] expose keyboard handling pieces and abstract buffer adapter so that the controller can drive non-editor contexts (e.g. notebook cell navigation a la Jupyter)
- [ ] add jupyter-style notebook demo
- [ ] improve CI and docs
- [ ] reach 100% test coverage
- [ ] reduce code complexity where possible

`v0.4.0`: visual mode

- [x] visual mode via `v` and `V` with all supported motions we have so far
- [x] a single internal register for yanked and deleted text
- [x] delete commands in normal mode `d[motion]` copy to that register
- [x] yank and paste commands in normal (`yy`, `y[motion]`, `p`, `P`) and visual mode (`y`)

`v0.3.0`: architecture overhaul

- [x] separate motions and edit actions from keymap and buffer
- [x] undo/redo stack via `[n]u` and `[n]Ctrl+r`
- [x] composed actions `dd`, `d[motion]`, `[n]hjkl`

`v0.2.1`: tiny fixes

- [x] fix behavior of `x` at end of line
- [x] apply thorough linting

`v0.2.0`: a few more commands

- [x] normal mode motions: `0`, `$`
- [x] delete commands in normal mode: `x`, `D`
- [x] more ways to enter insert mode: `a`, `A`, `o`, `O`

`v0.1.0`: first mvp

- [x] basic text editor component with mode-aware cursor
- [x] normal mode: `hjkl` motions, `i` to insert
- [x] insert mode: normal text input, `Backspace` and `Delete` working, `Esc` to normal
- [x] CI: unit tests, coverage report and live demo on GitHub Pages
