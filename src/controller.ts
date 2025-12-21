import type {
  Command,
  CursorPosition,
  EditorState,
  Mode,
  NormalizedSelectionRange,
  SelectionSegment,
} from "./types";
import { CursorState } from "./cursor-state";
import type { EditorBuffer } from "./editor-buffer";
import type { EditorDom } from "./editor-dom";
import { initializeEditorDom } from "./editor-dom";
import { createDefaultKeyMapper } from "./default-key-mapper";
import type { KeyMapper } from "./key-mapper";
import { CommandExecutor } from "./command-executor";
import { UndoManager } from "./undo-manager";
import { clampNumber } from "./utils";

export class ViModeController {
  private document: Document;
  private textareaDiv: HTMLDivElement;
  private selectionOverlay: HTMLDivElement;
  private cursorSpan: HTMLSpanElement;
  private register = "";
  private state: EditorState<EditorBuffer>;
  private keyMapper: KeyMapper<EditorState<EditorBuffer>>;
  private executor: CommandExecutor<EditorState<EditorBuffer>>;
  private undoManager: UndoManager<EditorState<EditorBuffer>>;
  private undoCommand: Command<EditorState<EditorBuffer>> | null;
  private redoCommand: Command<EditorState<EditorBuffer>> | null;

  constructor(options: {
    dom: EditorDom;
    initialMode?: Mode;
    initialCursorRow?: number;
    initialCursorCol?: number;
    keyMapper?: KeyMapper<EditorState<EditorBuffer>>;
    undoManager?: UndoManager<EditorState<EditorBuffer>>;
    extendNormalCommands?: (
      commands: Map<string, Command<EditorState<EditorBuffer>>>,
    ) => void;
  }) {
    const {
      dom,
      initialMode = "normal",
      initialCursorRow = 0,
      initialCursorCol = 0,
      keyMapper,
      undoManager,
    } = options;

    this.document = dom.root.ownerDocument;
    this.textareaDiv = dom.root;
    this.selectionOverlay = dom.selectionOverlay;
    this.cursorSpan = dom.cursorSpan;

    const cursor = new CursorState(initialCursorRow, initialCursorCol);
    cursor.clampToBuffer(dom.buffer);

    this.state = {
      mode: initialMode,
      cursor,
      buffer: dom.buffer,
      selection: null,
    };

    this.undoManager = undoManager ?? new UndoManager();
    if (keyMapper) {
      this.undoCommand = null;
      this.redoCommand = null;
      this.keyMapper = keyMapper;
    } else {
      const defaults = createDefaultKeyMapper<EditorState<EditorBuffer>>(
        this.undoManager,
        (text) => this.setRegister(text),
        () => this.copySelectionToRegister(),
        () => this.getSelectionRange(),
        (range) => this.deleteSelectionInBuffer(range),
        (before) => this.pasteFromRegister(before),
        {
          extendNormalCommands: options.extendNormalCommands,
        },
      );
      this.keyMapper = defaults.keyMapper;
      this.undoCommand = defaults.undoCommand;
      this.redoCommand = defaults.redoCommand;
    }
    this.executor = new CommandExecutor<EditorState<EditorBuffer>>(
      this.state,
      this.undoManager,
    );

    this.updateSelectionOverlay();
    this.updateCursorSpan();
  }

  public getMode(): Mode {
    return this.state.mode;
  }

  public getCursorPosition(): CursorPosition {
    return this.state.cursor.getPosition();
  }

  public getSelection(): {
    type: "character" | "line";
    anchor: CursorPosition;
    head: CursorPosition;
  } | null {
    if (!this.state.selection) return null;
    return {
      type: this.state.selection.type,
      anchor: { ...this.state.selection.anchor },
      head: this.state.cursor.getPosition(),
    };
  }

  public extractContent(): string {
    return this.state.buffer.extractContent();
  }

  private setRegister(text: string): void {
    this.register = text;
  }

  /** test-only helper */
  public __getSelectionSegmentsForTest(): SelectionSegment[] {
    return this.calculateSelectionSegments();
  }

  public processKeyboardEvent(event: KeyboardEvent) {
    const resolved = this.keyMapper.resolve(this.state, event);
    const command = resolved?.command;
    if (command) {
      const wasInsertMode = this.state.mode === "insert";

      if (this.shouldStartInsertSession(event)) {
        this.undoManager.beginCompound(this.state);
      }

      const isUndo =
        resolved?.isUndo ??
        (this.undoCommand !== null && command === this.undoCommand);
      const isRedo =
        resolved?.isRedo ??
        (this.redoCommand !== null && command === this.redoCommand);
      const recordUndo =
        !isUndo && !isRedo && !this.undoManager.hasPendingCompound();

      this.executor.run(command, event, { recordUndo });

      if (wasInsertMode && this.state.mode === "normal") {
        this.undoManager.commitCompoundIfChanged(this.state);
      }
    }
    this.state.cursor.clampToBuffer(this.state.buffer);
    this.updateSelectionOverlay();
    this.updateCursorSpan();
  }

  private shouldStartInsertSession(event: KeyboardEvent): boolean {
    if (this.state.mode !== "normal") return false;
    return ["i", "a", "A", "o", "O"].includes(event.key);
  }

  private isVisualMode(): boolean {
    return (
      this.state.mode === "visual-character" ||
      this.state.mode === "visual-line"
    );
  }

  private updateSelectionOverlay(): void {
    this.selectionOverlay.replaceChildren();
    if (!this.isVisualMode() || !this.state.selection) return;
    const segments = this.calculateSelectionSegments();
    for (const segment of segments) {
      const block = this.document.createElement("div");
      block.style.position = "absolute";
      block.style.top = `${segment.row}em`;
      block.style.left = `${segment.startCol}ch`;
      block.style.width = `${Math.max(1, segment.endCol - segment.startCol)}ch`;
      block.style.height = "1em";
      block.style.backgroundColor = "rgba(0, 0, 255, 0.2)";
      block.style.pointerEvents = "none";
      this.selectionOverlay.appendChild(block);
    }
  }

  private calculateSelectionSegments(): SelectionSegment[] {
    const selection = this.state.selection;
    if (!selection) return [];
    const anchor = selection.anchor;
    const head = this.state.cursor.getPosition();
    if (selection.type === "line") {
      const startRow = Math.min(anchor.row, head.row);
      const endRow = Math.max(anchor.row, head.row);
      const segments: SelectionSegment[] = [];
      for (let row = startRow; row <= endRow; row += 1) {
        segments.push({
          row,
          startCol: 0,
          endCol: this.safeLineLength(row),
        });
      }
      return segments;
    }

    if (anchor.row === head.row) {
      const startCol = Math.min(anchor.col, head.col);
      const endCol = Math.max(anchor.col, head.col) + 1;
      return [
        {
          row: anchor.row,
          startCol,
          endCol,
        },
      ];
    }

    const anchorIsTop = anchor.row < head.row;
    const top = anchorIsTop ? anchor : head;
    const bottom = anchorIsTop ? head : anchor;
    const segments: SelectionSegment[] = [];
    segments.push({
      row: top.row,
      startCol: top.col,
      endCol: Math.max(top.col + 1, this.safeLineLength(top.row)),
    });
    for (let row = top.row + 1; row < bottom.row; row += 1) {
      segments.push({
        row,
        startCol: 0,
        endCol: this.safeLineLength(row),
      });
    }
    segments.push({
      row: bottom.row,
      startCol: 0,
      endCol: bottom.col + 1,
    });

    return segments.map((segment) => ({
      ...segment,
      endCol: Math.max(segment.startCol + 1, segment.endCol),
    }));
  }

  private safeLineLength(row: number): number {
    const len = this.state.buffer.getLineLength(row);
    const hasTrailingNewline = row < this.state.buffer.lineCount() - 1;
    return Math.max(1, len + (hasTrailingNewline ? 1 : 0));
  }

  private getSelectionRange(): NormalizedSelectionRange | null {
    if (!this.state.selection) return null;
    const anchor = this.state.selection.anchor;
    const head = this.state.cursor.getPosition();
    if (this.state.selection.type === "line") {
      return {
        type: "line",
        startRow: Math.min(anchor.row, head.row),
        endRow: Math.max(anchor.row, head.row),
      };
    }

    const anchorIsTop =
      anchor.row < head.row ||
      (anchor.row === head.row && anchor.col <= head.col);
    const start = anchorIsTop ? anchor : head;
    const end = anchorIsTop ? head : anchor;
    return {
      type: "character",
      startRow: start.row,
      startCol: start.col,
      endRow: end.row,
      endCol: end.col + 1,
    };
  }

  private copySelectionToRegister(): void {
    const range = this.getSelectionRange();
    if (!range) return;
    if (range.type === "line") {
      const lines: string[] = [];
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        lines.push(this.state.buffer.getLineText(row));
      }
      this.register = `${lines.join("\n")}\n`;
      return;
    }

    const parts: string[] = [];
    if (range.startRow === range.endRow) {
      const line = this.state.buffer.getLineText(range.startRow);
      const endCol = Math.min(line.length, range.endCol);
      this.register = line.slice(range.startCol, endCol);
      return;
    }

    const startLine = this.state.buffer.getLineText(range.startRow);
    parts.push(startLine.slice(range.startCol));
    for (let row = range.startRow + 1; row < range.endRow; row += 1) {
      parts.push(this.state.buffer.getLineText(row));
    }
    const endLine = this.state.buffer.getLineText(range.endRow);
    parts.push(endLine.slice(0, Math.min(endLine.length, range.endCol)));
    this.register = parts.join("\n");
  }

  private deleteSelectionInBuffer(range: NormalizedSelectionRange): void {
    if (range.type === "line") {
      const start = Math.max(0, range.startRow);
      const end = clampNumber(
        range.endRow,
        start,
        this.state.buffer.lineCount() - 1,
      );
      for (let i = start; i <= end; i += 1) {
        this.state.buffer.removeLine(start);
      }
      if (this.state.buffer.lineCount() === 0) {
        this.state.buffer.replaceContent("");
      }
      this.state.cursor.setPosition(
        Math.min(start, this.state.buffer.lineCount() - 1),
        0,
        this.state.buffer,
      );
      return;
    }

    if (range.startRow === range.endRow) {
      const line = this.state.buffer.getLineText(range.startRow);
      const newText =
        line.slice(0, range.startCol) +
        line.slice(Math.min(line.length, range.endCol));
      this.state.buffer.setLineText(range.startRow, newText);
      this.state.cursor.setPosition(
        range.startRow,
        range.startCol,
        this.state.buffer,
      );
      return;
    }

    const startLine = this.state.buffer.getLineText(range.startRow);
    const endLine = this.state.buffer.getLineText(range.endRow);
    const tail = endLine.slice(Math.min(endLine.length, range.endCol));
    this.state.buffer.setLineText(
      range.startRow,
      startLine.slice(0, range.startCol) + tail,
    );

    for (let row = range.startRow + 1; row <= range.endRow; row += 1) {
      this.state.buffer.removeLine(range.startRow + 1);
    }

    this.state.cursor.setPosition(
      range.startRow,
      range.startCol,
      this.state.buffer,
    );
  }

  private pasteFromRegister(before: boolean): void {
    if (this.register === "") return;
    const { row, col } = this.state.cursor.getPosition();
    const text = this.register;
    const isLineWise = text.endsWith("\n");

    if (isLineWise) {
      const lines = text.slice(0, -1).split("\n");
      const insertRow = before ? row : row + 1;
      const lineCount = this.state.buffer.lineCount();
      if (insertRow >= lineCount) {
        let current = lineCount - 1;
        for (const line of lines) {
          this.state.buffer.insertLineAfter(current, line);
          current += 1;
        }
        this.state.cursor.setPosition(current, 0, this.state.buffer);
      } else {
        for (let i = 0; i < lines.length; i += 1) {
          this.state.buffer.insertLineBefore(insertRow + i, lines[i]);
        }
        this.state.cursor.setPosition(
          insertRow + lines.length - 1,
          0,
          this.state.buffer,
        );
      }
      return;
    }

    const insertPos = before ? col : col + 1;
    this.insertTextAtPosition(row, insertPos, text);
  }

  private insertTextAtPosition(row: number, col: number, text: string): void {
    const lines = text.split("\n");
    const original = this.state.buffer.getLineText(row);
    const clampedCol = clampNumber(col, 0, original.length);
    if (lines.length === 1) {
      const newLine =
        original.slice(0, clampedCol) + text + original.slice(clampedCol);
      this.state.buffer.setLineText(row, newLine);
      this.state.cursor.setPosition(
        row,
        Math.max(0, clampedCol + text.length - 1),
        this.state.buffer,
      );
      return;
    }

    const firstLine = original.slice(0, clampedCol) + lines[0];
    const lastLine = lines[lines.length - 1] + original.slice(clampedCol);
    this.state.buffer.setLineText(row, firstLine);
    for (let i = 1; i < lines.length - 1; i += 1) {
      this.state.buffer.insertLineAfter(row + i - 1, lines[i]);
    }
    this.state.buffer.insertLineAfter(row + lines.length - 2, lastLine);
    this.state.cursor.setPosition(
      row + lines.length - 1,
      Math.max(0, lines[lines.length - 1].length - 1),
      this.state.buffer,
    );
  }

  private updateCursorSpan() {
    const { row, col } = this.state.cursor.getPosition();
    const lineDiv = this.state.buffer.getLineDiv(row);
    this.cursorSpan.style.top = `${lineDiv.offsetTop}px`;
    this.cursorSpan.style.left = `${col}ch`;
    if (this.state.mode === "normal") {
      this.cursorSpan.style.backgroundColor = "blue";
      this.cursorSpan.style.color = "white";
      this.cursorSpan.style.border = "none";
      this.cursorSpan.textContent = lineDiv.textContent?.charAt(col) || " ";
    } else if (this.isVisualMode()) {
      this.cursorSpan.style.backgroundColor = "rgba(0, 0, 255, 0.4)";
      this.cursorSpan.style.color = "white";
      this.cursorSpan.style.border = "none";
      this.cursorSpan.textContent = lineDiv.textContent?.charAt(col) || " ";
    } else {
      this.cursorSpan.style.backgroundColor = "transparent";
      this.cursorSpan.style.color = "black";
      this.cursorSpan.style.borderLeft = "1px solid black";
      this.cursorSpan.textContent = "";
    }
  }
}

export const createFullEditor = (
  container: HTMLDivElement,
  options?: {
    initialContent?: string;
    initialMode?: Mode;
    initialCursorRow?: number;
    initialCursorCol?: number;
    keyMapper?: KeyMapper<EditorState>;
    undoManager?: UndoManager;
  },
): { controller: ViModeController; dom: EditorDom } => {
  const dom = initializeEditorDom(container, options?.initialContent ?? "");
  const controller = new ViModeController({
    dom,
    initialMode: options?.initialMode,
    initialCursorRow: options?.initialCursorRow,
    initialCursorCol: options?.initialCursorCol,
    keyMapper: options?.keyMapper,
    undoManager: options?.undoManager,
  });
  return { controller, dom };
};
