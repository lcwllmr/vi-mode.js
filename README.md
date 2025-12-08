# `vi-mode.js`: lightweight vi-like editor component for the web

Setup for local development: clone the repo and `cd` into it, then run:

```bash
npm ci
npx simple-git-hooks

# dev commands
npm run dev # starts local dev server for live demo
npm run test:watch # runs unit tests in watch mode
```

## Roadmap and Changelog

Planned features for upcoming releases:

- deal with horizontal and vertical scrolling
- configuration options (like colors and tab size)

`v0.4.0`: visual mode

- [ ] visual mode via `v` and `V` with all motions we have so far
- [ ] external register store (reusable across sessions)
- [ ] yank and paste commands in normal (`yy`, `y[motion]`, `p`, `P`) and visual mode (`y`)
- [ ] system clipboard support

`v0.3.0`: architecture overhaul

- [ ] separate motions and edit actions from keymap and buffer
- [ ] undo/redo stack via `u` and `U`
- [ ] composed actions `dd`, `d[motion]`, `[n]hjkl`

`v0.2.1`: tiny fixes

- [ ] fix behavior of `x` at end of line
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
