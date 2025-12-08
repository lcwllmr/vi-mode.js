export type Mode = "insert" | "normal";

export interface CursorPosition {
  row: number;
  col: number;
}

interface EditorSnapshot {
  content: string;
  cursor: CursorPosition;
  mode: Mode;
}

interface EditorState {
  mode: Mode;
  cursor: CursorState;
  buffer: EditorBuffer;
}

type Command = (state: EditorState, event: KeyboardEvent) => void;

interface ResolvedCommand {
  command: Command;
  isUndo?: boolean;
  isRedo?: boolean;
}

type MotionRange =
  | { type: "line"; startRow: number; endRow: number }
  | { type: "character"; row: number; startCol: number; endCol: number };

interface MotionDefinition {
  key: string;
  move: (state: EditorState, count: number) => void;
  toRange: (state: EditorState, count: number) => MotionRange;
}

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const makeKey = (event: KeyboardEvent): string => {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.metaKey) modifiers.push("Meta");
  modifiers.push(event.key);
  return modifiers.join("+");
};

class EditorBuffer {
  private document: Document;
  private container: HTMLDivElement;
  private contentDiv: HTMLDivElement;

  constructor(document: Document, container: HTMLDivElement, content: string) {
    this.document = document;
    this.container = container;
    this.contentDiv = this.container.appendChild(
      this.document.createElement("div"),
    );
    for (const line of content.split("\n")) {
      this.contentDiv.appendChild(this.makeLineDiv(line));
    }
  }

  public getContentDiv(): HTMLDivElement {
    return this.contentDiv;
  }

  public extractContent(): string {
    const lines: string[] = [];
    for (const lineDiv of this.contentDiv.children) {
      lines.push((lineDiv as HTMLDivElement).textContent || "");
    }
    return lines.join("\n");
  }

  public replaceContent(content: string): void {
    while (this.contentDiv.firstChild) {
      this.contentDiv.removeChild(this.contentDiv.firstChild);
    }
    for (const line of content.split("\n")) {
      this.contentDiv.appendChild(this.makeLineDiv(line));
    }
  }

  public lineCount(): number {
    return this.contentDiv.children.length;
  }

  public getLineDiv(row: number): HTMLDivElement {
    return this.contentDiv.children[row] as HTMLDivElement;
  }

  public getLineText(row: number): string {
    return this.getLineDiv(row).textContent || "";
  }

  public getLineLength(row: number): number {
    return this.getLineText(row).length;
  }

  public setLineText(row: number, text: string): void {
    this.getLineDiv(row).textContent = text;
  }

  public insertLineAfter(row: number, text: string): void {
    const baseLine = this.getLineDiv(row);
    const newLine = this.makeLineDiv(text);
    this.contentDiv.insertBefore(newLine, baseLine.nextSibling);
  }

  public insertLineBefore(row: number, text: string): void {
    const baseLine = this.getLineDiv(row);
    const newLine = this.makeLineDiv(text);
    this.contentDiv.insertBefore(newLine, baseLine);
  }

  public removeLine(row: number): void {
    this.contentDiv.removeChild(this.getLineDiv(row));
  }

  private makeLineDiv(content: string): HTMLDivElement {
    const lineDiv = this.document.createElement("div");
    lineDiv.style.height = "1em";
    lineDiv.style.whiteSpace = "pre";
    lineDiv.textContent = content;
    return lineDiv;
  }
}

class CursorState {
  private position: CursorPosition;

  constructor(row: number, col: number) {
    this.position = { row, col };
  }

  public getPosition(): CursorPosition {
    return { ...this.position };
  }

  public clampToBuffer(buffer: EditorBuffer): void {
    const maxRow = Math.max(0, buffer.lineCount() - 1);
    const clampedRow = Math.min(Math.max(this.position.row, 0), maxRow);
    const lineLength = buffer.getLineLength(clampedRow);
    const clampedCol = Math.min(Math.max(this.position.col, 0), lineLength);
    this.position = { row: clampedRow, col: clampedCol };
  }

  public setPosition(row: number, col: number, buffer: EditorBuffer): void {
    this.position = { row, col };
    this.clampToBuffer(buffer);
  }

  public setFromSnapshot(position: CursorPosition, buffer: EditorBuffer): void {
    this.position = { ...position };
    this.clampToBuffer(buffer);
  }

  public moveLeft(): void {
    this.position.col = Math.max(0, this.position.col - 1);
  }

  public moveRight(buffer: EditorBuffer): void {
    const lineLength = buffer.getLineLength(this.position.row);
    this.position.col = Math.min(lineLength, this.position.col + 1);
  }

  public moveUp(buffer: EditorBuffer): void {
    this.position.row = Math.max(0, this.position.row - 1);
    const lineLength = buffer.getLineLength(this.position.row);
    this.position.col = Math.min(lineLength, this.position.col);
  }

  public moveDown(buffer: EditorBuffer): void {
    this.position.row = Math.min(buffer.lineCount() - 1, this.position.row + 1);
    const lineLength = buffer.getLineLength(this.position.row);
    this.position.col = Math.min(lineLength, this.position.col);
  }

  public moveToLineStart(): void {
    this.position.col = 0;
  }

  public moveToLineEnd(buffer: EditorBuffer): void {
    this.position.col = buffer.getLineLength(this.position.row);
  }
}

class CommandExecutor {
  constructor(
    private state: EditorState,
    private undoManager: UndoManager,
  ) {}

  public run(
    command: Command,
    event: KeyboardEvent,
    { recordUndo }: { recordUndo: boolean },
  ): void {
    if (recordUndo) {
      const snapshot = this.undoManager.createSnapshot(this.state);
      command(this.state, event);
      this.undoManager.recordChange(snapshot, this.state);
      return;
    }

    command(this.state, event);
  }
}

class NormalModeCommandResolver {
  private countBuffer = "";
  private pendingOperator: "delete" | null = null;

  constructor(
    private motions: Map<string, MotionDefinition>,
    private normalCommands: Map<string, Command>,
    private undoManager: UndoManager,
  ) {}

  public resolve(event: KeyboardEvent): ResolvedCommand | null {
    if (this.isDigit(event.key)) {
      if (this.shouldTreatZeroAsMotion(event.key)) {
        return this.resolveMotionKey("0");
      }
      this.countBuffer += event.key;
      return null;
    }

    const key = makeKey(event);

    if (key === "d") {
      if (this.pendingOperator === "delete") {
        const count = this.consumeCountOrOne();
        this.pendingOperator = null;
        return { command: this.buildDeleteLinesCommand(count) };
      }
      this.pendingOperator = "delete";
      return null;
    }

    if (key === "u") {
      const count = this.consumeCountOrOne();
      this.pendingOperator = null;
      return { command: this.buildUndoCommand(count), isUndo: true };
    }

    if (key === "Ctrl+r") {
      const count = this.consumeCountOrOne();
      this.pendingOperator = null;
      return { command: this.buildRedoCommand(count), isRedo: true };
    }

    const motionResult = this.resolveMotionKey(key);
    if (motionResult) return motionResult;

    const command = this.normalCommands.get(key);
    if (command) {
      this.resetPending();
      return { command };
    }

    this.resetPending();
    return null;
  }

  private resolveMotionKey(key: string): ResolvedCommand | null {
    const motion = this.motions.get(key);
    if (!motion) return null;
    const count = this.consumeCountOrOne();
    const operator = this.pendingOperator;
    this.pendingOperator = null;
    if (operator === "delete") {
      return { command: this.buildDeleteWithMotionCommand(motion, count) };
    }
    return { command: this.buildMotionCommand(motion, count) };
  }

  private buildMotionCommand(motion: MotionDefinition, count: number): Command {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      motion.move(state, normalizedCount);
    };
  }

  private buildDeleteWithMotionCommand(
    motion: MotionDefinition,
    count: number,
  ): Command {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      const range = motion.toRange(state, normalizedCount);
      if (range.type === "line") {
        this.deleteLineRange(state, range.startRow, range.endRow);
      } else {
        this.deleteCharacterRange(
          state,
          range.row,
          range.startCol,
          range.endCol,
        );
      }
    };
  }

  private buildDeleteLinesCommand(count: number): Command {
    const normalizedCount = Math.max(1, count);
    return (state) => {
      const { row } = state.cursor.getPosition();
      const endRow = clampNumber(
        row + normalizedCount - 1,
        0,
        state.buffer.lineCount() - 1,
      );
      this.deleteLineRange(state, row, endRow);
    };
  }

  private buildUndoCommand(count: number): Command {
    const normalizedCount = Math.max(1, count);
    return (state, event) => {
      event.preventDefault();
      for (let i = 0; i < normalizedCount; i += 1) {
        if (!this.undoManager.undo(state)) break;
      }
      state.mode = "normal";
    };
  }

  private buildRedoCommand(count: number): Command {
    const normalizedCount = Math.max(1, count);
    return (state, event) => {
      event.preventDefault();
      for (let i = 0; i < normalizedCount; i += 1) {
        if (!this.undoManager.redo(state)) break;
      }
      state.mode = "normal";
    };
  }

  private deleteLineRange(
    state: EditorState,
    startRow: number,
    endRow: number,
  ): void {
    const normalizedStart = Math.max(0, Math.min(startRow, endRow));
    const normalizedEnd = clampNumber(
      Math.max(startRow, endRow),
      normalizedStart,
      state.buffer.lineCount() - 1,
    );
    for (let i = normalizedStart; i <= normalizedEnd; i += 1) {
      state.buffer.removeLine(normalizedStart);
    }
    if (state.buffer.lineCount() === 0) {
      state.buffer.replaceContent("");
    }
    const targetRow = clampNumber(
      normalizedStart,
      0,
      state.buffer.lineCount() - 1,
    );
    const currentCol = state.cursor.getPosition().col;
    const targetCol = Math.min(
      currentCol,
      state.buffer.getLineLength(targetRow),
    );
    state.cursor.setPosition(targetRow, targetCol, state.buffer);
  }

  private deleteCharacterRange(
    state: EditorState,
    row: number,
    startCol: number,
    endCol: number,
  ): void {
    const lineText = state.buffer.getLineText(row);
    const clampedStart = clampNumber(startCol, 0, lineText.length);
    const clampedEnd = clampNumber(endCol, clampedStart, lineText.length);
    if (clampedStart === clampedEnd) return;
    const updated =
      lineText.slice(0, clampedStart) + lineText.slice(clampedEnd);
    state.buffer.setLineText(row, updated);
    state.cursor.setPosition(row, clampedStart, state.buffer);
  }

  private shouldTreatZeroAsMotion(key: string): boolean {
    if (key !== "0") return false;
    return this.countBuffer === "";
  }

  private isDigit(key: string | undefined): key is string {
    return !!key && /^[0-9]$/.test(key);
  }

  private consumeCountOrOne(): number {
    const parsed = this.countBuffer === "" ? NaN : Number(this.countBuffer);
    this.countBuffer = "";
    return Number.isNaN(parsed) ? 1 : parsed;
  }

  private resetPending(): void {
    this.countBuffer = "";
    this.pendingOperator = null;
  }
}

class KeyMapper {
  constructor(
    private normalResolver: NormalModeCommandResolver,
    private insertKeymap: Map<string, Command>,
    private insertTextCommand: Command,
  ) {}

  public resolve(
    state: EditorState,
    event: KeyboardEvent,
  ): ResolvedCommand | null {
    if (state.mode === "normal") {
      return this.normalResolver.resolve(event);
    }

    const key = makeKey(event);
    const command = this.insertKeymap.get(key);
    if (command) return { command };

    if (state.mode === "insert" && event.key.length === 1) {
      return { command: this.insertTextCommand };
    }

    return null;
  }
}

class UndoManager {
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];
  private pendingSnapshot: EditorSnapshot | null = null;

  public createSnapshot(state: EditorState): EditorSnapshot {
    return {
      content: state.buffer.extractContent(),
      cursor: state.cursor.getPosition(),
      mode: state.mode,
    };
  }

  public recordChange(
    previousSnapshot: EditorSnapshot,
    state: EditorState,
  ): void {
    const currentContent = state.buffer.extractContent();
    if (previousSnapshot.content !== currentContent) {
      this.undoStack.push(previousSnapshot);
      this.redoStack = [];
    }
  }

  public beginCompound(state: EditorState): void {
    if (!this.pendingSnapshot) {
      this.pendingSnapshot = this.createSnapshot(state);
    }
  }

  public commitCompoundIfChanged(state: EditorState): void {
    if (!this.pendingSnapshot) return;
    this.recordChange(this.pendingSnapshot, state);
    this.pendingSnapshot = null;
  }

  public hasPendingCompound(): boolean {
    return this.pendingSnapshot !== null;
  }

  public undo(state: EditorState): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    const currentSnapshot = this.createSnapshot(state);
    this.redoStack.push(currentSnapshot);
    this.applySnapshot(state, snapshot);
    return true;
  }

  public redo(state: EditorState): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    const currentSnapshot = this.createSnapshot(state);
    this.undoStack.push(currentSnapshot);
    this.applySnapshot(state, snapshot);
    return true;
  }

  private applySnapshot(state: EditorState, snapshot: EditorSnapshot): void {
    state.buffer.replaceContent(snapshot.content);
    state.mode = snapshot.mode;
    state.cursor.setFromSnapshot(snapshot.cursor, state.buffer);
  }
}

const createMotions = (): Map<string, MotionDefinition> => {
  const motions = new Map<string, MotionDefinition>();

  motions.set("h", {
    key: "h",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const targetCol = Math.max(0, col - Math.max(1, count));
      state.cursor.setPosition(row, targetCol, state.buffer);
    },
    toRange: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const delta = Math.max(1, count);
      const targetCol = Math.max(0, col - delta);
      return { type: "character", row, startCol: targetCol, endCol: col };
    },
  });

  motions.set("l", {
    key: "l",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const lineLength = state.buffer.getLineLength(row);
      const targetCol = Math.min(lineLength, col + Math.max(1, count));
      state.cursor.setPosition(row, targetCol, state.buffer);
    },
    toRange: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const step = Math.max(1, count);
      const lineLength = state.buffer.getLineLength(row);
      const targetCol = Math.min(lineLength, col + step);
      return { type: "character", row, startCol: col, endCol: targetCol };
    },
  });

  motions.set("j", {
    key: "j",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const targetRow = clampNumber(
        row + Math.max(1, count),
        0,
        state.buffer.lineCount() - 1,
      );
      state.cursor.setPosition(targetRow, col, state.buffer);
    },
    toRange: (state, count) => {
      const { row } = state.cursor.getPosition();
      const lastRow = state.buffer.lineCount() - 1;
      const endRow = clampNumber(row + Math.max(1, count) - 1, 0, lastRow);
      return { type: "line", startRow: row, endRow };
    },
  });

  motions.set("k", {
    key: "k",
    move: (state, count) => {
      const { row, col } = state.cursor.getPosition();
      const targetRow = clampNumber(
        row - Math.max(1, count),
        0,
        state.buffer.lineCount() - 1,
      );
      state.cursor.setPosition(targetRow, col, state.buffer);
    },
    toRange: (state, count) => {
      const { row } = state.cursor.getPosition();
      const startRow = clampNumber(row - (Math.max(1, count) - 1), 0, row);
      return { type: "line", startRow, endRow: row };
    },
  });

  motions.set("0", {
    key: "0",
    move: (state) => {
      const { row } = state.cursor.getPosition();
      state.cursor.setPosition(row, 0, state.buffer);
    },
    toRange: (state) => {
      const { row, col } = state.cursor.getPosition();
      return { type: "character", row, startCol: 0, endCol: col };
    },
  });

  motions.set("$", {
    key: "$",
    move: (state) => {
      const { row } = state.cursor.getPosition();
      state.cursor.setPosition(
        row,
        state.buffer.getLineLength(row),
        state.buffer,
      );
    },
    toRange: (state) => {
      const { row, col } = state.cursor.getPosition();
      const lineLength = state.buffer.getLineLength(row);
      return { type: "character", row, startCol: col, endCol: lineLength };
    },
  });

  return motions;
};

const createNormalKeymap = (
  undoManager: UndoManager,
): {
  motions: Map<string, MotionDefinition>;
  normalCommands: Map<string, Command>;
  undoCommand: Command;
  redoCommand: Command;
} => {
  const normalCommands = new Map<string, Command>();

  normalCommands.set("i", (state) => {
    state.mode = "insert";
  });

  normalCommands.set("a", (state) => {
    state.cursor.moveRight(state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("A", (state) => {
    state.cursor.moveToLineEnd(state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("o", (state) => {
    const { row } = state.cursor.getPosition();
    state.buffer.insertLineAfter(row, "");
    state.cursor.setPosition(row + 1, 0, state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("O", (state) => {
    const { row } = state.cursor.getPosition();
    state.buffer.insertLineBefore(row, "");
    state.cursor.setPosition(row, 0, state.buffer);
    state.mode = "insert";
  });

  normalCommands.set("x", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const lineCount = state.buffer.lineCount();
    if (col < text.length) {
      const updated = text.slice(0, col) + text.slice(col + 1);
      state.buffer.setLineText(row, updated);
    } else if (col === text.length && row < lineCount - 1) {
      const nextText = state.buffer.getLineText(row + 1);
      state.buffer.setLineText(row, text + nextText);
      state.buffer.removeLine(row + 1);
    }
  });

  normalCommands.set("D", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    state.buffer.setLineText(row, text.slice(0, col));
  });

  const undoCommand: Command = (state, event) => {
    event.preventDefault();
    if (undoManager.undo(state)) {
      state.mode = "normal";
    }
  };

  const redoCommand: Command = (state, event) => {
    event.preventDefault();
    if (undoManager.redo(state)) {
      state.mode = "normal";
    }
  };

  return {
    motions: createMotions(),
    normalCommands,
    undoCommand,
    redoCommand,
  };
};

const createInsertKeymap = (): Map<string, Command> => {
  const keymap = new Map<string, Command>();

  keymap.set("Escape", (state, event) => {
    event.preventDefault();
    state.cursor.clampToBuffer(state.buffer);
    state.mode = "normal";
  });

  keymap.set("Backspace", (state, event) => {
    event.preventDefault();
    const { row, col } = state.cursor.getPosition();
    const lineText = state.buffer.getLineText(row);
    if (col > 0) {
      const updated = lineText.slice(0, col - 1) + lineText.slice(col);
      state.buffer.setLineText(row, updated);
      state.cursor.setPosition(row, col - 1, state.buffer);
    } else if (col === 0 && row > 0) {
      const prevLineText = state.buffer.getLineText(row - 1);
      const mergedText = prevLineText + lineText;
      state.buffer.setLineText(row - 1, mergedText);
      state.buffer.removeLine(row);
      state.cursor.setPosition(row - 1, prevLineText.length, state.buffer);
    }
  });

  keymap.set("Delete", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const updated = text.slice(0, col) + text.slice(col + 1);
    state.buffer.setLineText(row, updated);
  });

  keymap.set("Enter", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const before = text.slice(0, col);
    const after = text.slice(col);
    state.buffer.setLineText(row, before);
    state.buffer.insertLineAfter(row, after);
    state.cursor.setPosition(row + 1, 0, state.buffer);
  });

  keymap.set("Tab", (state, event) => {
    event.preventDefault();
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    const updated = text.slice(0, col) + "    " + text.slice(col);
    state.buffer.setLineText(row, updated);
    state.cursor.setPosition(row, col + 4, state.buffer);
  });

  return keymap;
};

const insertTextCommand: Command = (state, event) => {
  const { row, col } = state.cursor.getPosition();
  const text = state.buffer.getLineText(row);
  const updated = text.slice(0, col) + event.key + text.slice(col);
  state.buffer.setLineText(row, updated);
  state.cursor.setPosition(row, col + 1, state.buffer);
};

export class ViModeController {
  private document: Document;
  private textareaDiv: HTMLDivElement;
  private cursorSpan: HTMLSpanElement;
  private state: EditorState;
  private keyMapper: KeyMapper;
  private executor: CommandExecutor;
  private undoManager: UndoManager;
  private undoCommand: Command;
  private redoCommand: Command;

  constructor(
    container: HTMLDivElement,
    initialContent = "",
    initialMode: Mode = "normal",
    initialCursorRow = 0,
    initialCursorCol = 0,
  ) {
    this.document = container.ownerDocument;
    this.textareaDiv = container.appendChild(
      this.document.createElement("div"),
    );
    this.textareaDiv.style.position = "relative";

    const buffer = new EditorBuffer(
      this.document,
      this.textareaDiv,
      initialContent,
    );

    const cursor = new CursorState(initialCursorRow, initialCursorCol);
    cursor.clampToBuffer(buffer);

    this.state = {
      mode: initialMode,
      cursor,
      buffer,
    };

    this.cursorSpan = this.textareaDiv.appendChild(
      this.document.createElement("span"),
    );
    this.cursorSpan.style.position = "absolute";
    this.cursorSpan.style.width = "1ch";
    this.cursorSpan.style.height = "1em";

    this.undoManager = new UndoManager();
    const { motions, normalCommands, undoCommand, redoCommand } =
      createNormalKeymap(this.undoManager);
    const normalResolver = new NormalModeCommandResolver(
      motions,
      normalCommands,
      this.undoManager,
    );
    this.undoCommand = undoCommand;
    this.redoCommand = redoCommand;
    this.keyMapper = new KeyMapper(
      normalResolver,
      createInsertKeymap(),
      insertTextCommand,
    );
    this.executor = new CommandExecutor(this.state, this.undoManager);

    this.updateCursorSpan();
  }

  public getMode(): Mode {
    return this.state.mode;
  }

  public getCursorPosition(): CursorPosition {
    return this.state.cursor.getPosition();
  }

  public extractContent(): string {
    return this.state.buffer.extractContent();
  }

  public processKeyboardEvent(event: KeyboardEvent) {
    const resolved = this.keyMapper.resolve(this.state, event);
    const command = resolved?.command;
    if (command) {
      const wasInsertMode = this.state.mode === "insert";

      if (this.shouldStartInsertSession(event)) {
        this.undoManager.beginCompound(this.state);
      }

      const isUndo = resolved?.isUndo ?? command === this.undoCommand;
      const isRedo = resolved?.isRedo ?? command === this.redoCommand;
      const recordUndo =
        !isUndo && !isRedo && !this.undoManager.hasPendingCompound();

      this.executor.run(command, event, { recordUndo });

      if (wasInsertMode && this.state.mode === "normal") {
        this.undoManager.commitCompoundIfChanged(this.state);
      }
    }
    this.state.cursor.clampToBuffer(this.state.buffer);
    this.updateCursorSpan();
  }

  private shouldStartInsertSession(event: KeyboardEvent): boolean {
    if (this.state.mode !== "normal") return false;
    return ["i", "a", "A", "o", "O"].includes(event.key);
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
    } else {
      this.cursorSpan.style.backgroundColor = "transparent";
      this.cursorSpan.style.color = "black";
      this.cursorSpan.style.borderLeft = "1px solid black";
      this.cursorSpan.textContent = "";
    }
  }
}
