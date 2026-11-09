import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import ccStyle from "pi-cc-extensions/extensions/index.ts";
import comfyUi from "../vendor/comfy-ui/extensions/comfy-ui.ts";
import { config } from "pi-cc-extensions/extensions/config/config.ts";
import footer from "../vendor/pikit-footer/index.ts";

// One entrypoint gives each component a single owner and a stable load order.
export default function claudeStyle(pi: ExtensionAPI): void {
  // This preset owns the editor/footer slots. CC 1.x now provides its own.
  config.enableEditorPrefix = false;
  config.enableCustomFooter = false;
  ccStyle(pi);
  comfyUi(pi);
  footer(pi);
}
