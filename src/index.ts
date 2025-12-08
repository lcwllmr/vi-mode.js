export type Mode = "insert" | "normal";
export type CursorPosition = { row: number; col: number };

export class ViModeController {
  private document: Document;
  private textareaDiv: HTMLDivElement;
  private contentDiv: HTMLDivElement;
  private cursorSpan: HTMLSpanElement;
  private mode: Mode;
  private cursorPosition: CursorPosition;

  constructor(
    container: HTMLDivElement,
    initialContent: string = "",
    initialMode: Mode = "normal",
    initialCursorRow: number = 0,
    initialCursorCol: number = 0,
  ) {
    this.document = container.ownerDocument;
    this.textareaDiv = container.appendChild(
      this.document.createElement("div"),
    );
    this.textareaDiv.style.position = "relative";

    this.contentDiv = this.textareaDiv.appendChild(
      this.document.createElement("div"),
    );
    for (const line of initialContent.split("\n")) {
      const newLineDiv = this.makeNewLineDiv(line);
      this.contentDiv.appendChild(newLineDiv);
    }

    this.mode = initialMode;
    const clampedRow = Math.min(
      Math.max(initialCursorRow, 0),
      this.contentDiv.children.length - 1,
    );
    const clampedCol = Math.min(
      Math.max(initialCursorCol, 0),
      (this.contentDiv.children[clampedRow] as HTMLDivElement).textContent
        ?.length || 0,
    );
    this.cursorPosition = { row: clampedRow, col: clampedCol };

    this.cursorSpan = this.textareaDiv.appendChild(
      this.document.createElement("span"),
    );
    this.cursorSpan.style.position = "absolute";
    this.cursorSpan.style.width = "1ch";
    this.cursorSpan.style.height = "1em";
    this.updateCursorSpan();
  }

  public getMode(): Mode {
    return this.mode;
  }

  public getCursorPosition(): CursorPosition {
    return { ...this.cursorPosition };
  }

  public extractContent(): string {
    const lines: string[] = [];
    for (let i = 0; i < this.contentDiv.children.length; i++) {
      const lineDiv = this.contentDiv.children[i] as HTMLDivElement;
      lines.push(lineDiv.textContent || "");
    }
    return lines.join("\n");
  }

  private makeNewLineDiv(content: string): HTMLDivElement {
    const lineDiv = this.document.createElement("div");
    lineDiv.style.height = "1em";
    lineDiv.style.whiteSpace = "pre";
    lineDiv.textContent = content;
    return lineDiv;
  }

  private updateCursorSpan() {
    const lineDiv = this.contentDiv.children[
      this.cursorPosition.row
    ] as HTMLDivElement;
    this.cursorSpan.style.top = `${lineDiv.offsetTop}px`;
    this.cursorSpan.style.left = `${this.cursorPosition.col}ch`;
    if (this.mode === "normal") {
      this.cursorSpan.style.backgroundColor = "blue";
      this.cursorSpan.style.color = "white";
      this.cursorSpan.style.border = "none";
      this.cursorSpan.textContent =
        lineDiv.textContent?.charAt(this.cursorPosition.col) || " ";
    } else if (this.mode === "insert") {
      this.cursorSpan.style.backgroundColor = "transparent";
      this.cursorSpan.style.color = "black";
      this.cursorSpan.style.borderLeft = "1px solid black";
      this.cursorSpan.textContent = "";
    }
  }

  public processKeyboardEvent(event: KeyboardEvent) {
    if (this.mode === "normal") {
      if (event.key === "i") {
        this.mode = "insert";
      } else if (event.key === "a") {
        const lineLength =
          (this.contentDiv.children[this.cursorPosition.row] as HTMLDivElement)
            .textContent?.length || 0;
        this.cursorPosition.col = Math.min(
          lineLength,
          this.cursorPosition.col + 1,
        );
        this.mode = "insert";
      } else if (event.key === "A") {
        const lineLength =
          (this.contentDiv.children[this.cursorPosition.row] as HTMLDivElement)
            .textContent?.length || 0;
        this.cursorPosition.col = lineLength;
        this.mode = "insert";
      } else if (event.key === "o") {
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const newLineDiv = this.makeNewLineDiv("");
        this.contentDiv.insertBefore(newLineDiv, lineDiv.nextSibling);
        this.cursorPosition.row += 1;
        this.cursorPosition.col = 0;
        this.mode = "insert";
      } else if (event.key === "O") {
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const newLineDiv = this.makeNewLineDiv("");
        this.contentDiv.insertBefore(newLineDiv, lineDiv);
        this.cursorPosition.col = 0;
        this.mode = "insert";
      } else if (event.key === "0") {
        this.cursorPosition.col = 0;
      } else if (event.key === "$") {
        const lineLength =
          (this.contentDiv.children[this.cursorPosition.row] as HTMLDivElement)
            .textContent?.length || 0;
        this.cursorPosition.col = lineLength;
      } else if (event.key === "x") {
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const text = lineDiv.textContent || "";
        lineDiv.textContent =
          text.slice(0, this.cursorPosition.col) +
          text.slice(this.cursorPosition.col + 1);
        this.cursorPosition.col = Math.min(
          this.cursorPosition.col,
          lineDiv.textContent.length,
        );
      } else if (event.key === "D") {
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const text = lineDiv.textContent || "";
        lineDiv.textContent = text.slice(0, this.cursorPosition.col);
      } else if (event.key === "h") {
        this.cursorPosition.col = Math.max(0, this.cursorPosition.col - 1);
      } else if (event.key === "l") {
        const lineLength =
          (this.contentDiv.children[this.cursorPosition.row] as HTMLDivElement)
            .textContent?.length || 0;
        this.cursorPosition.col = Math.min(
          lineLength,
          this.cursorPosition.col + 1,
        );
      } else if (event.key === "j") {
        this.cursorPosition.row = Math.min(
          this.contentDiv.children.length - 1,
          this.cursorPosition.row + 1,
        );
        const lineLength =
          (this.contentDiv.children[this.cursorPosition.row] as HTMLDivElement)
            .textContent?.length || 0;
        this.cursorPosition.col = Math.min(lineLength, this.cursorPosition.col);
      } else if (event.key === "k") {
        this.cursorPosition.row = Math.max(0, this.cursorPosition.row - 1);
        const lineLength =
          (this.contentDiv.children[this.cursorPosition.row] as HTMLDivElement)
            .textContent?.length || 0;
        this.cursorPosition.col = Math.min(lineLength, this.cursorPosition.col);
      }
    } else if (this.mode === "insert") {
      if (event.key === "Escape") {
        event.preventDefault();
        this.mode = "normal";
      } else if (event.key === "Backspace") {
        event.preventDefault();
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        if (this.cursorPosition.col > 0) {
          const text = lineDiv.textContent || "";
          lineDiv.textContent =
            text.slice(0, this.cursorPosition.col - 1) +
            text.slice(this.cursorPosition.col);
          this.cursorPosition.col -= 1;
        } else if (
          this.cursorPosition.col === 0 &&
          this.cursorPosition.row > 0
        ) {
          const prevLineDiv = this.contentDiv.children[
            this.cursorPosition.row - 1
          ] as HTMLDivElement;
          const currentText = lineDiv.textContent || "";
          const prevText = prevLineDiv.textContent || "";
          prevLineDiv.textContent = prevText + currentText;
          this.contentDiv.removeChild(lineDiv);
          this.cursorPosition.row -= 1;
          this.cursorPosition.col = prevText.length;
        }
      } else if (event.key === "Delete") {
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const text = lineDiv.textContent || "";
        lineDiv.textContent =
          text.slice(0, this.cursorPosition.col) +
          text.slice(this.cursorPosition.col + 1);
      } else if (event.key === "Enter") {
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const text = lineDiv.textContent || "";
        const newLineDiv = this.makeNewLineDiv(
          text.slice(this.cursorPosition.col),
        );
        lineDiv.textContent = text.slice(0, this.cursorPosition.col);
        this.contentDiv.insertBefore(newLineDiv, lineDiv.nextSibling);
        this.cursorPosition.row += 1;
        this.cursorPosition.col = 0;
      } else if (event.key === "Tab") {
        event.preventDefault();
        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const text = lineDiv.textContent || "";
        lineDiv.textContent =
          text.slice(0, this.cursorPosition.col) +
          "    " +
          text.slice(this.cursorPosition.col);
        this.cursorPosition.col += 4;
      } else {
        // ignore non-character keys
        if (event.key.length !== 1) return;

        const lineDiv = this.contentDiv.children[
          this.cursorPosition.row
        ] as HTMLDivElement;
        const text = lineDiv.textContent || "";
        lineDiv.textContent =
          text.slice(0, this.cursorPosition.col) +
          event.key +
          text.slice(this.cursorPosition.col);
        this.cursorPosition.col += 1;
      }
    }

    this.updateCursorSpan();
  }
}
