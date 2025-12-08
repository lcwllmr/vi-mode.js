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

Planned features for the next releases (sorted after priority):

- undo/redo stack
- visual mode
- deal with horizontal and vertical scrolling
- configuration options (like colors and tab size)
- registers (as reusable object) and clipboard support

`v0.2.0`: a few more commands

- [ ] normal mode motions: `0`, `$`
- [ ] delete commands in normal mode: `x`, `D`
- [x] more ways to enter insert mode: `a`, `A`, `o`, `O`

`v0.1.0`: first mvp

- [x] basic text editor component with mode-aware cursor
- [x] normal mode: `hjkl` motions, `i` to insert
- [x] insert mode: normal text input, `Backspace` and `Delete` working, `Esc` to normal
- [x] CI: unit tests, coverage report and live demo on GitHub Pages
