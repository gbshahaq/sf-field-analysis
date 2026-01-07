#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { run } from "./run";

(async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("sf-field-analysis")
    .usage("$0 [options]")
    .option("object", { alias: "o", type: "string", describe: "SObject API name", default: "Case" })
    .option("org", { alias: "g", type: "string", describe: "Salesforce org alias", default: "ShamDev" })
    .option("outDir", { alias: "d", type: "string", describe: "Base output directory (defaults to ~/Projects/GearsetCRM)" })
    .option("repoRoot", {
      alias: "r",
      type: "string",
      describe: "Path to metadata root (e.g., .../force-app/main/default). Overrides the default unpackaged path.",
    })
    .option("verbose", { alias: "v", type: "boolean", describe: "Enable verbose logging", default: true })
    .option("dryRun", { type: "boolean", describe: "Skip Salesforce LastModified query and reuse cached CSV if present", default: false })
    .option("includeStandard", { type: "boolean", describe: "Include standard fields via Tooling API FieldDefinition", default: true })
    .option("csv", { type: "boolean", describe: "Also export a CSV alongside the Excel file", default: false })
    .option("noOpen", { type: "boolean", describe: "Do not attempt to open the Excel file automatically", default: false })
    .example("$0 -o Case -g ShamDev", "Analyze Case fields in default Gearset path")
    .example(
      "$0 --object Case --org ShamDev --repoRoot \"C:\\repo\\force-app\\main\\default\"",
      "Analyze Case fields in an SFDX project on Windows"
    )
    .example(
      "$0 -o Opportunity -g DevHub -r /Users/you/repo/force-app/main/default --csv",
      "Analyze Opportunity fields and export both Excel and CSV"
    )
    .help()
    .strict()
    .parse();

  try {
    await run(
      argv.object as string,
      argv.org as string,
      argv.outDir as string | undefined,
      argv.repoRoot as string | undefined,
      argv.verbose as boolean,
      argv.dryRun as boolean,
      argv.includeStandard as boolean,
      argv.csv as boolean,
      argv.noOpen as boolean
    );
    // Ensure we exit cleanly; file opening is detached.
    process.exit(0);
  } catch (err: any) {
    console.error("Error:", err?.message ?? err);
    process.exit(1);
  }
})();
