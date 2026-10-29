import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { resolveInside } from "@/modules/coding/policy";

/** Discover local dependencies using the project's aliases, not product paths. */
export function sourceDependencies(root: string, file: string, content: string, canRead: (file: string) => boolean = () => true): string[] {
  let baseUrl = ".", aliases: Record<string, string[]> = {};
  for (const config of ["tsconfig.json", "jsconfig.json"]) {
    if (!canRead(config)) continue;
    const located = resolveInside(root, config);
    if (!located.ok || !fs.existsSync(located.absolute)) continue;
    const parsed = ts.parseConfigFileTextToJson(config, fs.readFileSync(located.absolute, "utf8"));
    baseUrl = parsed.config?.compilerOptions?.baseUrl ?? ".";
    aliases = parsed.config?.compilerOptions?.paths ?? {};
    break;
  }
  const tree = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers = new Set<string>();
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.add(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(tree) === "require")) specifiers.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const files = new Set<string>();
  for (const specifier of specifiers) {
    const stems: string[] = [];
    if (specifier.startsWith(".")) stems.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    for (const [pattern, replacements] of Object.entries(aliases)) {
      const star = pattern.indexOf("*");
      const matches = star < 0 ? specifier === pattern : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
      if (!matches) continue;
      const captured = star < 0 ? "" : specifier.slice(star, specifier.length - (pattern.length - star - 1));
      for (const replacement of replacements) stems.push(path.posix.join(baseUrl, replacement.replace("*", captured)));
    }
    for (const stem of stems) for (const candidate of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.mjs`, `${stem}/index.ts`, `${stem}/index.js`]) {
      const located = resolveInside(root, candidate);
      if (located.ok && fs.existsSync(located.absolute) && fs.statSync(located.absolute).isFile()) files.add(located.relative);
    }
  }
  return [...files];
}
