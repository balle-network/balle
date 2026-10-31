import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");
const tryFile = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((f) => existsSync(f) && !f.endsWith("/"));

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  // Next ships CommonJS entry points without an exports map; Node's ESM loader needs the file name.
  if (specifier === "next/server" || specifier === "next/headers") return next(`${specifier}.js`, context);
  if (specifier.startsWith("@/")) {
    const file = tryFile(resolvePath(SRC, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const file = tryFile(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}
