import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createKagiWebSearchProvider } from "./kagi-search-provider.js";

export default definePluginEntry({
  id: "kagi",
  name: "Kagi Search",
  description: "Kagi privacy-first web search for OpenClaw via Session Links",
  register(api) {
    api.registerWebSearchProvider(createKagiWebSearchProvider());
  },
});
