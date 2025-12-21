import { expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createFullEditor, ViModeController } from "../src";

interface FakeKeyboardEvent {
  key?: string;
  ctrl?: boolean;
  text?: string;
}

function makeController(
  initialText: string,
  row = 0,
  col = 0,
): ViModeController {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="editor"></div></body>`);
  const editorDiv = dom.window.document.getElementById(
    "editor",
  ) as HTMLDivElement;
  const { controller } = createFullEditor(editorDiv, {
    initialContent: initialText,
    initialMode: "normal",
    initialCursorRow: row,
    initialCursorCol: col,
  });
  return controller;
}

function simulateKeys(
  controller: ViModeController,
  keySeq: FakeKeyboardEvent[],
) {
  for (const keyEvent of keySeq) {
    if (keyEvent.key) {
      const event = new KeyboardEvent("keydown", {
        key: keyEvent.key,
        ctrlKey: keyEvent.ctrl ?? false,
        bubbles: true,
        cancelable: true,
      });
      controller.processKeyboardEvent(event);
    } else if (keyEvent.text) {
      for (const char of keyEvent.text) {
        const event = new KeyboardEvent("keydown", {
          key: char,
          bubbles: true,
          cancelable: true,
        });
        controller.processKeyboardEvent(event);
      }
    }
  }
}

test("counted motions move multiple steps", () => {
  const controller = makeController(
    "line0\nline1\nline2\nline3\nline4\nline5\nline6",
  );
  simulateKeys(controller, [
    { key: "5" },
    { key: "j" },
    { key: "3" },
    { key: "l" },
  ]);
  expect(controller.getCursorPosition()).toEqual({ row: 5, col: 3 });
});

test("d5j deletes the current line and the next four", () => {
  const controller = makeController("a\nb\nc\nd\ne\nf");
  simulateKeys(controller, [{ key: "d" }, { key: "5" }, { key: "j" }]);
  expect(controller.extractContent()).toBe("f");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 0 });
});

test("d0 deletes to the start of the line without touching the cursor char", () => {
  const controller = makeController("abcde");
  simulateKeys(controller, [{ key: "3" }, { key: "l" }]);
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
  simulateKeys(controller, [{ key: "d" }, { key: "0" }]);
  expect(controller.extractContent()).toBe("de");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 0 });
});

test("d$ deletes from the cursor through the end of the line", () => {
  const controller = makeController("abcdef");
  simulateKeys(controller, [{ key: "2" }, { key: "l" }]);
  simulateKeys(controller, [{ key: "d" }, { key: "$" }]);
  expect(controller.extractContent()).toBe("ab");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 2 });
});

test("d$ deletes last character when already at end of line", () => {
  const controller = makeController("xyz");
  simulateKeys(controller, [{ key: "$" }]);
  simulateKeys(controller, [{ key: "d" }, { key: "$" }]);
  expect(controller.extractContent()).toBe("xy");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 2 });
});

test("dd removes the current line and keeps the row index", () => {
  const controller = makeController("first\nsecond\nthird");
  simulateKeys(controller, [{ key: "j" }, { key: "d" }, { key: "d" }]);
  expect(controller.extractContent()).toBe("first\nthird");
  expect(controller.getCursorPosition()).toEqual({ row: 1, col: 0 });
});

test("[n]u and [n]Ctrl+r perform repeated undo/redo", () => {
  const controller = makeController("one\ntwo\nthree");
  simulateKeys(controller, [{ key: "d" }, { key: "d" }]);
  simulateKeys(controller, [{ key: "d" }, { key: "d" }]);
  expect(controller.extractContent()).toBe("three");

  simulateKeys(controller, [{ key: "2" }, { key: "u" }]);
  expect(controller.extractContent()).toBe("one\ntwo\nthree");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 0 });

  simulateKeys(controller, [{ key: "2" }, { key: "r", ctrl: true }]);
  expect(controller.extractContent()).toBe("three");
});
