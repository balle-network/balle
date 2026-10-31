// Lets `node --test` run the TypeScript sources directly: resolves the "@/" path alias
// (and extensionless relative imports) to files under src/, and turns "server-only" into an empty module.
import { register } from "node:module";

register(new URL("./test-resolve.mjs", import.meta.url));
