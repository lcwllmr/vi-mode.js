import { EditorBuffer } from "./editor-buffer";

export interface EditorDom {
  root: HTMLDivElement;
  buffer: EditorBuffer;
  selectionOverlay: HTMLDivElement;
  cursorSpan: HTMLSpanElement;
}

export const initializeEditorDom = (
  container: HTMLDivElement,
  initialContent = "",
): EditorDom => {
  const document = container.ownerDocument;
  const root = container.appendChild(document.createElement("div"));
  root.style.position = "relative";

  const buffer = new EditorBuffer(document, root, initialContent);

  const selectionOverlay = root.appendChild(document.createElement("div"));
  selectionOverlay.style.position = "absolute";
  selectionOverlay.style.top = "0";
  selectionOverlay.style.left = "0";
  selectionOverlay.style.right = "0";
  selectionOverlay.style.bottom = "0";
  selectionOverlay.style.pointerEvents = "none";
  selectionOverlay.style.zIndex = "0";

  const cursorSpan = root.appendChild(document.createElement("span"));
  cursorSpan.style.position = "absolute";
  cursorSpan.style.width = "1ch";
  cursorSpan.style.height = "1em";
  cursorSpan.style.zIndex = "2";

  return { root, buffer, selectionOverlay, cursorSpan };
};
