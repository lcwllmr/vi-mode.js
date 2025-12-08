import { test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { ViModeController } from "../src";

function makeTestSetup(
  initialText: string,
  initialMode: "insert" | "normal",
  initialCursorRow: number,
  initialCursorCol: number,
): [Document, ViModeController] {
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
  return [dom.window.document, controller];
}

function simulateKeys(
  document: Document,
  controller: ViModeController,
  keySeq: Array<{
    key?: string;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
    text?: string;
  }>,
) {
  for (const keyEvent of keySeq) {
    if (keyEvent.key) {
      const event = new document.defaultView!.KeyboardEvent("keydown", {
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
        const event = new document.defaultView!.KeyboardEvent("keydown", {
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
  const [_, controller] = makeTestSetup("\nAAA\nBBB\n", "normal", 0, 0);
  const content = controller.extractContent();
  expect(content).toBe("\nAAA\nBBB\n");
});

test("cursor position is clamped correctly", () => {
  const [_, controller] = makeTestSetup("AAA\nBBB\nCCC", "normal", 100, 100);
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 2, col: 3 });
});

test("cursor movement in normal mode", () => {
  const [document, controller] = makeTestSetup("ABC\nDEF\nGHI", "normal", 0, 0);
  simulateKeys(document, controller, [
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

test("mode switching works correctly", () => {
  const [document, controller] = makeTestSetup("ABC", "normal", 0, 0);
  expect(controller.getMode()).toBe("normal");
  simulateKeys(document, controller, [{ key: "i" }]);
  expect(controller.getMode()).toBe("insert");
  simulateKeys(document, controller, [{ key: "Escape" }]);
  expect(controller.getMode()).toBe("normal");
});

test("insertion of text in insert mode", () => {
  const [document, controller] = makeTestSetup("AC", "insert", 0, 1);
  simulateKeys(document, controller, [{ text: " B " }]);
  const content = controller.extractContent();
  expect(content).toBe("A B C");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 4 });
});

test("backspace removes characters", () => {
  const [document, controller] = makeTestSetup("ABCD", "insert", 0, 4);
  simulateKeys(document, controller, [
    { key: "Backspace" },
    { key: "Backspace" },
  ]);
  const content = controller.extractContent();
  expect(content).toBe("AB");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 2 });
});

test("backspace at start of line merges lines", () => {
  const [document, controller] = makeTestSetup("Hello\nWorld", "insert", 1, 0);
  simulateKeys(document, controller, [{ key: "Backspace" }]);
  const content = controller.extractContent();
  expect(content).toBe("HelloWorld");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 5 });
});

test("backspace at start of first line does nothing", () => {
  const [document, controller] = makeTestSetup("Hello", "insert", 0, 0);
  simulateKeys(document, controller, [{ key: "Backspace" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hello");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 0 });
});

test("enter key splits lines correctly", () => {
  const [document, controller] = makeTestSetup("HelloWorld", "insert", 0, 5);
  simulateKeys(document, controller, [{ key: "Enter" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hello\nWorld");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 1, col: 0 });
});

test("delete key removes characters", () => {
  const [document, controller] = makeTestSetup("HelloWorld", "insert", 0, 5);
  simulateKeys(document, controller, [{ key: "Delete" }, { key: "Delete" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hellorld");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 5 });
});

test("tab key inserts spaces", () => {
  const [document, controller] = makeTestSetup("HelloWorld", "insert", 0, 5);
  simulateKeys(document, controller, [{ key: "Tab" }]);
  const content = controller.extractContent();
  expect(content).toBe("Hello    World");
  const cursorPos = controller.getCursorPosition();
  expect(cursorPos).toEqual({ row: 0, col: 9 });
});
