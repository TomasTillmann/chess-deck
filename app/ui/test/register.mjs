import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Run source-level unit tests with the app's existing TypeScript compiler.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw error;
      for (const extension of [".ts", ".tsx"]) {
        try { return nextResolve(specifier + extension, context); }
        catch (candidateError) { if (candidateError.code !== "ERR_MODULE_NOT_FOUND") throw candidateError; }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !/\.tsx?$/.test(url)) return nextLoad(url, context);
    const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    return { format: "module", source: `import.meta.env = {};\n${source}`, shortCircuit: true };
  },
});
