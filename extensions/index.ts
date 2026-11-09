import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import ccStyle from "pi-cc-extensions/extensions/index.ts";
import comfyUi from "pi-comfy-ui/extensions/comfy-ui.ts";
import footer from "../vendor/pikit-footer/index.ts";

// One entrypoint gives each component a single owner and a stable load order.
export default function claudeStyle(pi: ExtensionAPI): void {
  ccStyle(pi);
  comfyUi(pi);
  footer(pi);
}
