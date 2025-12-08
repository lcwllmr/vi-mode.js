export type Mode = "insert" | "normal";

export interface CursorPosition {
  row: number;
  col: number;
}

interface EditorState {
  mode: Mode;
  cursor: CursorState;
  buffer: EditorBuffer;
}

type Command = (state: EditorState, event: KeyboardEvent) => void;

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
  constructor(private state: EditorState) {}

  public run(command: Command, event: KeyboardEvent): void {
    command(this.state, event);
  }
}

class KeyMapper {
  constructor(
    private normalKeymap: Map<string, Command>,
    private insertKeymap: Map<string, Command>,
    private insertTextCommand: Command,
  ) {}

  public resolve(state: EditorState, event: KeyboardEvent): Command | null {
    const map = state.mode === "normal" ? this.normalKeymap : this.insertKeymap;
    const command = map.get(event.key);
    if (command) return command;

    if (state.mode === "insert" && event.key.length === 1) {
      return this.insertTextCommand;
    }

    return null;
  }
}

const createNormalKeymap = (): Map<string, Command> => {
  const keymap = new Map<string, Command>();

  keymap.set("i", (state) => {
    state.mode = "insert";
  });

  keymap.set("a", (state) => {
    state.cursor.moveRight(state.buffer);
    state.mode = "insert";
  });

  keymap.set("A", (state) => {
    state.cursor.moveToLineEnd(state.buffer);
    state.mode = "insert";
  });

  keymap.set("o", (state) => {
    const { row } = state.cursor.getPosition();
    state.buffer.insertLineAfter(row, "");
    state.cursor.setPosition(row + 1, 0, state.buffer);
    state.mode = "insert";
  });

  keymap.set("O", (state) => {
    const { row } = state.cursor.getPosition();
    state.buffer.insertLineBefore(row, "");
    state.cursor.setPosition(row, 0, state.buffer);
    state.mode = "insert";
  });

  keymap.set("0", (state) => {
    state.cursor.moveToLineStart();
  });

  keymap.set("$", (state) => {
    state.cursor.moveToLineEnd(state.buffer);
  });

  keymap.set("x", (state) => {
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

  keymap.set("D", (state) => {
    const { row, col } = state.cursor.getPosition();
    const text = state.buffer.getLineText(row);
    state.buffer.setLineText(row, text.slice(0, col));
  });

  keymap.set("h", (state) => {
    state.cursor.moveLeft();
  });

  keymap.set("l", (state) => {
    state.cursor.moveRight(state.buffer);
  });

  keymap.set("j", (state) => {
    state.cursor.moveDown(state.buffer);
  });

  keymap.set("k", (state) => {
    state.cursor.moveUp(state.buffer);
  });

  return keymap;
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

    this.keyMapper = new KeyMapper(
      createNormalKeymap(),
      createInsertKeymap(),
      insertTextCommand,
    );
    this.executor = new CommandExecutor(this.state);

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
    const command = this.keyMapper.resolve(this.state, event);
    if (command) {
      this.executor.run(command, event);
    }
    this.state.cursor.clampToBuffer(this.state.buffer);
    this.updateCursorSpan();
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
