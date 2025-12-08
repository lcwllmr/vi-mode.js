import { test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { ViModeController } from "../src";

function makeTestSetup(
  initialText: string,
  initialMode: "insert" | "normal",
  initialCursorRow: number,
  initialCursorCol: number,
): ViModeController {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="editor"></div></body>`);
  const editorDiv = dom.window.document.getElementById(
    "editor",
  ) as HTMLDivElement;
  const controller = new ViModeController(
    editorDiv,
    initialText,
    initialMode,
    initialCursorRow,
    initialCursorCol,
  );
  return controller;
}

interface FakeKeyboardEvent {
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  text?: string;
}

function simulateKeys(
  controller: ViModeController,
  keySeq: FakeKeyboardEvent[],
) {
  for (const keyEvent of keySeq) {
    if (keyEvent.key) {
      const event = new KeyboardEvent("keydown", {
        key: keyEvent.key,
        ctrlKey: keyEvent.ctrl || false,
        altKey: keyEvent.alt || false,
        metaKey: keyEvent.meta || false,
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

test("extract content returns the correct text", () => {
  const controller = makeTestSetup("\nAAA\nBBB\n", "normal", 0, 0);
  const content = controller.extractContent();
  expect(content).toBe("\nAAA\nBBB\n");
});

test("cursor position is clamped correctly", () => {
  const controller = makeTestSetup("AAA\nBBB\nCCC", "normal", 100, 100);
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 2, col: 3 });
});

test("cursor movement in normal mode", () => {
  const controller = makeTestSetup("ABC\nDEF\nGHI", "normal", 0, 0);
  simulateKeys(controller, [
    { key: "j" },
    { key: "j" },
    { key: "l" },
    { key: "l" },
    { key: "h" },
    { key: "k" },
  ]);
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 1, col: 1 });
});

test("cursor movement to line ends in normal mode", () => {
  const controller = makeTestSetup("ABCD\nEFGH\n", "normal", 1, 1);
  simulateKeys(controller, [{ key: "0" }]);
  expect(controller.getCursorPosition()).toEqual({ row: 1, col: 0 });
  simulateKeys(controller, [{ key: "$" }]);
  expect(controller.getCursorPosition()).toEqual({ row: 1, col: 4 });
});

test("mode switching works correctly", () => {
  const controller = makeTestSetup("ABC", "normal", 0, 0);
  expect(controller.getMode()).toBe("normal");

  simulateKeys(controller, [{ key: "i" }]);
  expect(controller.getMode()).toBe("insert");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 0 });
  simulateKeys(controller, [{ key: "Escape" }]);
  expect(controller.getMode()).toBe("normal");

  simulateKeys(controller, [{ key: "a" }]);
  expect(controller.getMode()).toBe("insert");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 1 });
  simulateKeys(controller, [{ key: "Escape" }]);
  expect(controller.getMode()).toBe("normal");

  simulateKeys(controller, [{ key: "A" }]);
  expect(controller.getMode()).toBe("insert");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
  simulateKeys(controller, [{ key: "Escape" }]);
  expect(controller.getMode()).toBe("normal");
});

test("opening new lines in normal mode", () => {
  const controller = makeTestSetup("ABC", "normal", 0, 1);
  simulateKeys(controller, [{ key: "o" }]);
  let content = controller.extractContent();
  expect(content).toBe("ABC\n");
  let cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 1, col: 0 });
  simulateKeys(controller, [{ key: "Escape" }, { key: "k" }, { key: "O" }]);
  content = controller.extractContent();
  expect(content).toBe("\nABC\n");
  cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 0 });
});

test("insertion of text in insert mode", () => {
  const controller = makeTestSetup("AC", "insert", 0, 1);
  simulateKeys(controller, [{ text: " B " }]);
  const content = controller.extractContent();
  expect(content).toBe("A B C");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 4 });
});

test("backspace removes characters", () => {
  const controller = makeTestSetup("ABCD", "insert", 0, 4);
  simulateKeys(controller, [{ key: "Backspace" }, { key: "Backspace" }]);
  const content = controller.extractContent();
  expect(content).toBe("AB");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 2 });
});

test("backspace at start of line merges lines", () => {
  const controller = makeTestSetup("Hello\nWorld", "insert", 1, 0);
  simulateKeys(controller, [{ key: "Backspace" }]);
  const content = controller.extractContent();
  expect(content).toBe("HelloWorld");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 5 });
});

test("backspace at start of first line does nothing", () => {
  const controller = makeTestSetup("Hello", "insert", 0, 0);
  simulateKeys(controller, [{ key: "Backspace" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hello");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 0 });
});

test("enter key splits lines correctly", () => {
  const controller = makeTestSetup("HelloWorld", "insert", 0, 5);
  simulateKeys(controller, [{ key: "Enter" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hello\nWorld");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 1, col: 0 });
});

test("delete key removes characters", () => {
  const controller = makeTestSetup("HelloWorld", "insert", 0, 5);
  simulateKeys(controller, [{ key: "Delete" }, { key: "Delete" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hellorld");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 5 });
});

test("tab key inserts spaces", () => {
  const controller = makeTestSetup("HelloWorld", "insert", 0, 5);
  simulateKeys(controller, [{ key: "Tab" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hello    World");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 9 });
});

test("single character deletions in normal mode", () => {
  const controller = makeTestSetup("ABCDE\nF", "normal", 0, 3);
  simulateKeys(controller, [{ key: "x" }]);
  expect(controller.extractContent()).toBe("ABCE\nF");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
  simulateKeys(controller, [{ key: "x" }]);
  expect(controller.extractContent()).toBe("ABC\nF");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
  simulateKeys(controller, [{ key: "x" }]);
  expect(controller.extractContent()).toBe("ABCF");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
  simulateKeys(controller, [{ key: "x" }]);
  expect(controller.extractContent()).toBe("ABC");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
  simulateKeys(controller, [{ key: "x" }]);
  expect(controller.extractContent()).toBe("ABC");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 3 });
});

test("deleting to end of line in normal mode", () => {
  const controller = makeTestSetup("01234", "normal", 0, 2);
  simulateKeys(controller, [{ key: "D" }]);
  expect(controller.extractContent()).toBe("01");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 2 });
  simulateKeys(controller, [{ key: "D" }]);
  expect(controller.extractContent()).toBe("01");
  expect(controller.getCursorPosition()).toEqual({ row: 0, col: 2 });
});
