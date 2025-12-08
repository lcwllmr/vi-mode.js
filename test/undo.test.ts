import { expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { ViModeController } from "../src";

interface FakeKeyboardEvent {
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  text?: string;
}

function makeController(initialText: string): ViModeController {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="editor"></div></body>`);
  const editorDiv = dom.window.document.getElementById(
    "editor",
  ) as HTMLDivElement;
  return new ViModeController(editorDiv, initialText, "normal", 0, 0);
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

test("undo and redo restore content changes", () => {
  const controller = makeController("Hello");
  simulateKeys(controller, [{ key: "i" }, { text: "!" }, { key: "Escape" }]);
  expect(controller.extractContent()).toBe("!Hello");
  expect(controller.getMode()).toBe("normal");

  simulateKeys(controller, [{ key: "u" }]);
  expect(controller.extractContent()).toBe("Hello");
  expect(controller.getMode()).toBe("normal");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 0 });

  simulateKeys(controller, [{ key: "r", ctrl: true }]);
  expect(controller.extractContent()).toBe("!Hello");
  expect(controller.getMode()).toBe("normal");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 1 });
});

test("redo stack is cleared after a new edit", () => {
  const controller = makeController("Hello");
  simulateKeys(controller, [{ key: "i" }, { text: "!" }, { key: "Escape" }]);
  expect(controller.extractContent()).toBe("!Hello");

  simulateKeys(controller, [{ key: "u" }]);
  expect(controller.extractContent()).toBe("Hello");

  simulateKeys(controller, [{ key: "i" }, { text: "?" }, { key: "Escape" }]);
  expect(controller.extractContent()).toBe("?Hello");

  simulateKeys(controller, [{ key: "r", ctrl: true }]);
  expect(controller.extractContent()).toBe("?Hello");
});

test("undo treats one insert session as a single action", () => {
  const controller = makeController("Hello");
  simulateKeys(controller, [{ key: "i" }, { text: "abc" }, { key: "Escape" }]);
  expect(controller.extractContent()).toBe("abcHello");

  simulateKeys(controller, [{ key: "u" }]);
  expect(controller.extractContent()).toBe("Hello");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 0 });

  simulateKeys(controller, [{ key: "r", ctrl: true }]);
  expect(controller.extractContent()).toBe("abcHello");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
});
