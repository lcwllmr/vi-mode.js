import { expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createFullEditor, ViModeController } from "../src";

interface FakeKeyboardEvent {
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
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
        altKey: keyEvent.alt ?? false,
        metaKey: keyEvent.meta ?? false,
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

test("v enters character visual mode and motions extend the selection", () => {
  const controller = makeController("abcd", 0, 1);
  simulateKeys(controller, [{ key: "v" }, { key: "l" }, { key: "l" }]);

  expect(controller.getMode()).toBe("visual-character");
  expect(controller.getSelection()).toEqual({
    type: "character",
    anchor: { row: 0, col: 1 },
    head: { row: 0, col: 3 },
  });
});

test("V enters line visual mode and respects line motions", () => {
  const controller = makeController("one\ntwo\nthree", 1, 0);
  simulateKeys(controller, [{ key: "V" }, { key: "j" }]);

  expect(controller.getMode()).toBe("visual-line");
  expect(controller.getSelection()).toEqual({
    type: "line",
    anchor: { row: 1, col: 0 },
    head: { row: 2, col: 0 },
  });
});

test("Escape leaves visual mode and clears the selection", () => {
  const controller = makeController("hello", 0, 1);
  simulateKeys(controller, [{ key: "v" }, { key: "l" }, { key: "Escape" }]);

  expect(controller.getMode()).toBe("normal");
  expect(controller.getSelection()).toBeNull();
});

test("character visual selections span multiple lines", () => {
  const controller = makeController("aa\nbb\ncc", 0, 1);
  simulateKeys(controller, [{ key: "v" }, { key: "j" }, { key: "l" }]);

  expect(controller.getSelection()).toEqual({
    type: "character",
    anchor: { row: 0, col: 1 },
    head: { row: 1, col: 2 },
  });
});

test("selection past end of line includes trailing newline column", () => {
  const controller = makeController("abc\ndef", 0, 3);
  simulateKeys(controller, [{ key: "v" }, { key: "j" }]);

  const segments = controller.__getSelectionSegmentsForTest();
  expect(segments[0]).toEqual({ row: 0, startCol: 3, endCol: 4 });
});
