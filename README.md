# `vi-mode.js`: lightweight vi-like editor component for the web

## Roadmap and Changelog

Planned features for the next releases (sorted after priority):

- undo/redo stack
- visual mode
- deal with horizontal and vertical scrolling
- configuration options (like colors and tab size)
- registers (as reusable object) and clipboard support

`v0.2.0`: more features

- [ ] normal mode motions: `0`, `$`, and `[n]hjkl`
- [ ] delete commands in normal mode: `x`, `dd` and `d[motion]`
- [ ] more ways to enter insert mode: `a`, `A`, `o`, `O`

`v0.1.0`: first mvp

- [x] basic text editor component with mode-aware cursor
- [x] normal mode: `hjkl` motions, `i` to insert
- [x] insert mode: normal text input, `Backspace` and `Delete` working, `Esc` to normal
- [x] CI: unit tests, coverage report and live demo on GitHub Pages
