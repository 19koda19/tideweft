#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "src", "content", "patchNotes.json");
const outputPath = path.join(projectRoot, "CHANGELOG.md");
const categoryOrder = [
  ["gameplay", "Gameplay"],
  ["fixes", "Fixes"],
  ["balancing", "Balancing"],
  ["interface", "Interface"],
  ["saves", "Save changes"],
  ["knownLimitations", "Known limitations"],
];

const escapeMarkdown = (value) => value
  .replace(/[\\`*_\[\]<>]/gu, "\\$&")
  .replace(/^#/u, "\\#");

function render(document) {
  if (document?.schemaVersion !== 1 || !Array.isArray(document.releases) || document.releases.length === 0) {
    throw new Error("src/content/patchNotes.json is not a supported non-empty schema-v1 document.");
  }
  const lines = [
    "# TIDEWEFT Changelog",
    "",
    "<!-- Generated from src/content/patchNotes.json. Run node scripts/render-patch-notes.cjs; do not edit release prose here. -->",
    "",
    "Newest release first. Patch notes are bundled into the game and remain available offline.",
    "",
  ];
  for (const release of document.releases) {
    lines.push(
      `## ${escapeMarkdown(release.version)} — ${escapeMarkdown(release.releaseDate)}`,
      "",
      `Build: \`${String(release.buildIdentity).replace(/`/gu, "\\`")}\` · Gameplay contract: ${release.gameplayContractVersion} · Tutorial: ${release.tutorialVersion}`,
      "",
      escapeMarkdown(release.summary),
      "",
    );
    for (const [category, heading] of categoryOrder) {
      if (!Object.hasOwn(release.categories ?? {}, category)) {
        throw new Error(`Release ${release.version} is missing canonical category ${category}.`);
      }
      lines.push(`### ${heading}`, "");
      const entries = release.categories[category];
      if (!Array.isArray(entries)) {
        throw new Error(`Release ${release.version} category ${category} must be an array.`);
      }
      if (entries.length === 0) {
        lines.push("_None recorded for this release._", "");
      } else {
        for (const entry of entries) lines.push(`- ${escapeMarkdown(entry)}`);
        lines.push("");
      }
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const expected = render(source);
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== expected) {
    console.error("CHANGELOG.md is stale. Run: node scripts/render-patch-notes.cjs");
    process.exitCode = 1;
  } else {
    console.log("CHANGELOG.md matches src/content/patchNotes.json.");
  }
} else {
  fs.writeFileSync(outputPath, expected, "utf8");
  console.log("Rendered CHANGELOG.md from src/content/patchNotes.json.");
}
