import {
  BufferAdapter,
  Command,
  CursorState,
  EditorDom,
  EditorState,
  KeyMapper,
  Mode,
  NormalModeCommandResolver,
  UndoManager,
  ViModeController,
  VisualModeCommandResolver,
  createInsertKeymap,
  createMotions,
  initializeEditorDom,
  insertTextCommand,
} from "../src";

declare const __VERSION__: string;

interface NotebookCell {
  id: number;
  text: string;
  element: HTMLDivElement;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

class NotebookBuffer implements BufferAdapter {
  private cells: NotebookCell[] = [];
  private idCounter = 0;

  constructor(
    private container: HTMLDivElement,
    initialCells: string[],
  ) {
    for (const text of initialCells) {
      this.appendCell(text);
    }
    if (this.cells.length === 0) {
      this.appendCell("");
    }
  }

  public getCell(row: number): NotebookCell | undefined {
    return this.cells[row];
  }

  public forEachCell(fn: (cell: NotebookCell, index: number) => void): void {
    this.cells.forEach(fn);
  }

  public extractContent(): string {
    return this.cells.map((cell) => cell.text).join("\n");
  }

  public replaceContent(content: string): void {
    this.container.innerHTML = "";
    this.cells = [];
    for (const line of content.split("\n")) {
      this.appendCell(line);
    }
    if (this.cells.length === 0) {
      this.appendCell("");
    }
  }

  public lineCount(): number {
    return this.cells.length;
  }

  public getLineText(row: number): string {
    return this.cells[row]?.text ?? "";
  }

  public getLineLength(row: number): number {
    return this.getLineText(row).length;
  }

  public setLineText(row: number, text: string): void {
    const cell = this.cells[row];
    if (!cell) return;
    cell.text = text;
    this.renderCell(cell);
  }

  public insertLineAfter(row: number, text: string): void {
    const index = clamp(row + 1, 0, this.cells.length);
    const cell = this.createCell(text);
    this.cells.splice(index, 0, cell);
    this.container.insertBefore(
      cell.element,
      this.container.children[index] ?? null,
    );
    this.renderCell(cell);
  }

  public insertLineBefore(row: number, text: string): void {
    const index = clamp(row, 0, this.cells.length);
    const cell = this.createCell(text);
    this.cells.splice(index, 0, cell);
    this.container.insertBefore(
      cell.element,
      this.container.children[index] ?? null,
    );
    this.renderCell(cell);
  }

  public removeLine(row: number): void {
    const cell = this.cells[row];
    if (!cell) return;
    cell.element.remove();
    this.cells.splice(row, 1);
    if (this.cells.length === 0) {
      this.appendCell("");
    }
  }

  private appendCell(text: string): void {
    const cell = this.createCell(text);
    this.cells.push(cell);
    this.container.appendChild(cell.element);
    this.renderCell(cell);
  }

  private createCell(text: string): NotebookCell {
    const element = this.container.ownerDocument.createElement("div");
    element.style.padding = "8px";
    element.style.borderRadius = "4px";
    element.style.border = "1px solid #ccc";
    element.style.fontFamily = "monospace";
    element.style.minHeight = "40px";
    element.style.background = "#fff";
    return { id: this.idCounter++, text, element };
  }

  private renderCell(cell: NotebookCell): void {
    cell.element.innerHTML = "";
    const pre = cell.element.appendChild(
      this.container.ownerDocument.createElement("pre"),
    );
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = cell.text || "(empty)";
  }
}

type NotebookState = EditorState<NotebookBuffer>;

class NotebookController {
  private state: NotebookState;
  private keyMapper: KeyMapper<NotebookState>;
  private undoManager: UndoManager<NotebookState>;
  private register = "";

  constructor(
    private buffer: NotebookBuffer,
    private onEnterEdit: (row: number) => void,
    private onSelectionChange: (row: number) => void,
  ) {
    const cursor = new CursorState(0, 0);
    cursor.clampToBuffer(buffer);
    this.state = {
      mode: "normal",
      cursor,
      buffer,
      selection: null,
    };
    this.undoManager = new UndoManager<NotebookState>();
    const motions = createMotions<NotebookState>();
    const normalCommands = new Map<string, Command<NotebookState>>();

    normalCommands.set("j", (state) => {
      state.cursor.moveDown(state.buffer);
    });
    normalCommands.set("k", (state) => {
      state.cursor.moveUp(state.buffer);
    });
    normalCommands.set("o", (state) => {
      const { row } = state.cursor.getPosition();
      state.buffer.insertLineAfter(row, "");
      state.cursor.setPosition(row + 1, 0, state.buffer);
    });
    normalCommands.set("O", (state) => {
      const { row } = state.cursor.getPosition();
      state.buffer.insertLineBefore(row, "");
      state.cursor.setPosition(row, 0, state.buffer);
    });
    normalCommands.set("Enter", (state, event) => {
      event.preventDefault();
      const { row } = state.cursor.getPosition();
      this.onEnterEdit(row);
    });

    const normalResolver = new NormalModeCommandResolver<NotebookState>(
      motions,
      normalCommands,
      this.undoManager,
      (text) => {
        this.register = text;
      },
    );
    const noop: Command<NotebookState> = (state, event) => {
      event.preventDefault();
      state.mode = "normal";
    };
    const visualResolver = new VisualModeCommandResolver<NotebookState>(
      motions,
      noop,
      noop,
      noop,
    );

    this.keyMapper = new KeyMapper(
      normalResolver,
      visualResolver,
      createInsertKeymap<NotebookState>(),
      insertTextCommand as Command<NotebookState>,
    );
  }

  public processKeyboardEvent(event: KeyboardEvent) {
    const resolved = this.keyMapper.resolve(this.state, event);
    const command = resolved?.command;
    if (command) {
      const snapshot = this.undoManager.createSnapshot(this.state);
      command(this.state, event);
      this.undoManager.recordChange(snapshot, this.state);
    }
    this.state.cursor.clampToBuffer(this.state.buffer);
    this.onSelectionChange(this.state.cursor.getPosition().row);
  }

  public getSelectedRow(): number {
    return this.state.cursor.getPosition().row;
  }
}

interface ActiveEditor {
  controller: ViModeController;
  dom: EditorDom;
  cellIndex: number;
  handler: (event: KeyboardEvent) => void;
}

document.onreadystatechange = () => {
  if (document.readyState !== "complete") return;
  const versionSpan = document.getElementById("version") as HTMLSpanElement;
  versionSpan.textContent = "v" + __VERSION__;

  const notebook = document.getElementById("editor") as HTMLDivElement;
  notebook.style.display = "flex";
  notebook.style.flexDirection = "column";
  notebook.style.gap = "8px";
  notebook.tabIndex = 0;

  const notebookBuffer = new NotebookBuffer(notebook, [
    "Welcome!\nPress Enter to edit this cell.",
  ]);
  let activeEditor: ActiveEditor | null = null;

  const highlightSelection = (row: number) => {
    notebookBuffer.forEachCell((cell, index) => {
      const isSelected = index === row;
      cell.element.style.border = isSelected
        ? "1px solid #0070f3"
        : "1px solid #ccc";
      cell.element.style.background = isSelected ? "#f5fbff" : "#fff";
    });
  };

  const exitEditing = () => {
    if (!activeEditor) return;
    const { controller, dom, cellIndex, handler } = activeEditor;
    const cell = notebookBuffer.getCell(cellIndex);
    if (cell) {
      cell.text = controller.extractContent();
      cell.element.removeEventListener("keydown", handler);
      dom.root.remove();
      notebookBuffer.setLineText(cellIndex, cell.text);
    }
    activeEditor = null;
    highlightSelection(notebookController.getSelectedRow());
    notebook.focus();
  };

  const startEditing = (row: number) => {
    const cell = notebookBuffer.getCell(row);
    if (!cell) return;
    cell.element.innerHTML = "";
    const dom = initializeEditorDom(cell.element, cell.text);
    dom.root.tabIndex = 0;
    const controller = new ViModeController({
      dom,
      initialMode: "normal" as Mode,
      extendNormalCommands: (commands) => {
        commands.set("Escape", (state, event) => {
          if (state.mode === "normal") {
            event.preventDefault();
            exitEditing();
          }
        });
      },
    });
    const handler = (event: KeyboardEvent) =>
      controller.processKeyboardEvent(event);
    cell.element.addEventListener("keydown", handler);
    activeEditor = { controller, dom, cellIndex: row, handler };
    dom.root.focus();
  };

  const notebookController = new NotebookController(
    notebookBuffer,
    (row) => startEditing(row),
    (row) => highlightSelection(row),
  );
  highlightSelection(0);

  notebook.addEventListener("keydown", (event) => {
    if (activeEditor) return;
    notebookController.processKeyboardEvent(event);
  });
};
