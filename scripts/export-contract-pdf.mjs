// Exports the Lead Generation Services Agreement as a vector PDF in Lead Velocity's house style.
//
// Same code path as the CRM Contract Generator: canonical markdown + pricing seed
// -> resolveAgreement() -> renderAgreementHtml() -> headless Chrome --print-to-pdf.
// Modules are loaded through Vite's SSR loader so the `?raw` markdown import and the `@/` alias work
// exactly as in the app; nothing extra to install.
//
// Usage:
//   node scripts/export-contract-pdf.mjs --fields <fields.json> --out <file.pdf> [--html <file.html>] [--source <agreement.md>]
// --source renders another text of the agreement (e.g. a client copy with changes marked); default = canonical template.
// fields.json = { "plan": "Bronze", "client_phone": "...", "include_notes": false,
//                 "placeholders": { "[CLIENT FULL NAME]": "...", "[LV REG NO]": "(blank)",
//                                   "[OPTIONAL — CONFIRM]": "(omit)", "[PRACTICE NAME]": "?Name to confirm" } }
// Placeholder values: "(blank)" = hand-fill line, "(omit)" = drop the marker, "?text" = show text highlighted.
// Chrome: CHROME_PATH env, default C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fieldsPath = arg("fields");
const outPath = arg("out");
if (!fieldsPath || !outPath) {
  console.error("Usage: node scripts/export-contract-pdf.mjs --fields <fields.json> --out <file.pdf> [--html <file.html>] [--source <agreement.md>]");
  process.exit(2);
}
const CHROME = process.env.CHROME_PATH || "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  resolve: { alias: { "@": path.resolve(root, "src") } },
});
let html, doc;
try {
  const A = await server.ssrLoadModule("/src/lib/contract/agreement.ts");
  const R = await server.ssrLoadModule("/src/lib/contract/renderHtml.ts");
  const fields = { ...A.defaultFields(), ...JSON.parse(readFileSync(fieldsPath, "utf8")) };
  if (fields.include_notes) console.warn("WARNING: include_notes is on: internal notes will be in this PDF. Not for clients.");
  const sourcePath = arg("source");
  doc = A.resolveAgreement(fields, sourcePath ? readFileSync(sourcePath, "utf8") : undefined);
  const logo = readFileSync(path.join(root, "src/assets/lead-velocity-logo-contract.png")).toString("base64");
  html = R.renderAgreementHtml(doc, fields, { logoSrc: `data:image/png;base64,${logo}` });
} finally {
  await server.close();
}

const tmp = mkdtempSync(path.join(tmpdir(), "lv-contract-"));
const htmlFile = arg("html") || path.join(tmp, "agreement.html");
writeFileSync(htmlFile, html, "utf8");
try {
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--user-data-dir=${path.join(tmp, "profile")}`,
      `--print-to-pdf=${path.resolve(outPath)}`,
      pathToFileURL(htmlFile).href,
    ],
    { stdio: "ignore", timeout: 120000 }
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`${outPath}: ${Math.round(statSync(outPath).size / 1024)} KB · template ${doc.templateVersion} · ${doc.tier.name} plan`);
if (doc.warnings.length) console.log("Template/pricing warnings:\n  " + doc.warnings.join("\n  "));
console.log(`Highlighted (unfilled or to confirm): ${doc.unfilled.length ? doc.unfilled.join("  ") : "none"}`);
