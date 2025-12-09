import { expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { ViModeController } from "../src";

interface FakeKeyboardEvent {
  key?: string;
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
  return new ViModeController(editorDiv, initialText, "normal", row, col);
}

function simulateKeys(
  controller: ViModeController,
  keySeq: FakeKeyboardEvent[],
) {
  for (const keyEvent of keySeq) {
    if (keyEvent.key) {
      const event = new KeyboardEvent("keydown", {
        key: keyEvent.key,
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

test("visual yank copies selection and paste inserts it", () => {
  const controller = makeController("abc\ndef", 0, 0);
  simulateKeys(controller, [
    { key: "v" },
    { key: "l" },
    { key: "l" },
    { key: "y" },
  ]);
  simulateKeys(controller, [{ key: "j" }, { key: "0" }, { key: "P" }]);
  expect(controller.extractContent()).toBe("abc\nabcdef");
});

test("visual delete removes selection and stores it for paste", () => {
  const controller = makeController("first\nsecond\nthird", 0, 0);
  simulateKeys(controller, [{ key: "V" }, { key: "j" }, { key: "d" }]);
  expect(controller.extractContent()).toBe("third");
  simulateKeys(controller, [{ key: "P" }]);
  expect(controller.extractContent()).toBe("first\nsecond\nthird");
});

test("characterwise delete across a line works with paste", () => {
  const controller = makeController("abcd\nefg", 0, 1);
  simulateKeys(controller, [
    { key: "v" },
    { key: "l" },
    { key: "l" },
    { key: "d" },
  ]);
  expect(controller.extractContent()).toBe("a\nefg");
  simulateKeys(controller, [{ key: "j" }, { key: "0" }, { key: "p" }]);
  expect(controller.extractContent()).toBe("a\nebcdfg");
});

test("dd stores deleted line in register for paste", () => {
  const controller = makeController("one\ntwo\nthree", 0, 0);
  simulateKeys(controller, [{ key: "d" }, { key: "d" }]);
  expect(controller.extractContent()).toBe("two\nthree");
  simulateKeys(controller, [{ key: "P" }]);
  expect(controller.extractContent()).toBe("one\ntwo\nthree");
});

test("d$ stores deleted characters for paste", () => {
  const controller = makeController("abcd", 0, 1);
  simulateKeys(controller, [{ key: "d" }, { key: "$" }]);
  expect(controller.extractContent()).toBe("a");
  simulateKeys(controller, [{ key: "p" }]);
  expect(controller.extractContent()).toBe("abcd");
});
