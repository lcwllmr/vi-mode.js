import { ViModeController } from "../src";

let controller: ViModeController;

document.onreadystatechange = () => {
  if (document.readyState === "complete") {
    const versionSpan = document.getElementById("version") as HTMLSpanElement;
    versionSpan.textContent = "v" + __VERSION__;

    const editorDiv = document.getElementById("editor") as HTMLDivElement;
    controller = new ViModeController(
      editorDiv,
      "Welcome!\nStart typing in vi mode...",
    );
    editorDiv.addEventListener("keydown", (event) => {
      controller.processKeyboardEvent(event);
    });
    editorDiv.focus();
    console.log("Editor initialized.");
  }
};
