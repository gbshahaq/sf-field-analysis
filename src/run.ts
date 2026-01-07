import * as fsp from "fs/promises";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import { resolvePaths } from "./utils/pathing";
import { logInfo } from "./utils/logger";
import { preloadTextContent } from "./loaders/glob";
import { processFields } from "./analysis/fields";
import { fetchFieldDefinitions, mergeStandardFields } from "./analysis/standard";
import { exportToExcel } from "./exporters/excel";
import { exportToCsv } from "./exporters/csv";
import { openFile } from "./os/open";
import { ResultRow, StringMap } from "./types";
import { execSfStdout } from "./sf/exec";

function buildLastModifiedMap(tempCsv: string, verbose: boolean): StringMap {
  if (!fs.existsSync(tempCsv)) {
    logInfo(`No LastModified CSV found at ${tempCsv}; continuing without LastModified dates.`, verbose);
    return {};
  }
  const raw = fs.readFileSync(tempCsv, "utf8");
  const records = parse(raw, { columns: true, skip_empty_lines: true });
  const map: StringMap = {};
  for (const row of records) {
    const devName: string = String(row.DeveloperName ?? "").trim();
    const lastMod: string = String(row.LastModifiedDate ?? "").trim();
    if (!devName) continue;
    map[devName.toLowerCase()] = lastMod;
    map[`${devName}__c`.toLowerCase()] = lastMod;
  }
  logInfo(`Fetched ${records.length} field entries for LastModifiedDate from Salesforce.`, verbose);
  return map;
}

async function execSfQueryToCsv(
  orgAlias: string,
  objectName: string,
  tempCsv: string,
  verbose: boolean,
  dryRun: boolean
): Promise<void> {
  const sfQuery = `SELECT DeveloperName, LastModifiedDate FROM CustomField WHERE TableEnumOrId = '${objectName}'`;
  if (dryRun) {
    if (fs.existsSync(tempCsv)) {
      logInfo(`--dryRun enabled: reusing cached CSV at ${tempCsv}`, verbose);
      return;
    }
    logInfo(`--dryRun enabled: no cached CSV found at ${tempCsv}; skipping LastModified load.`, verbose);
    return;
  }
  const args = ["data", "query", "--use-tooling-api", "--target-org", orgAlias, "--query", sfQuery, "--result-format", "csv"];
  const stdout = await execSfStdout(args, verbose);
  fs.writeFileSync(tempCsv, stdout, "utf8");
}

export async function run(
  objectName: string,
  orgAlias: string,
  outDir: string | undefined,
  repoRoot: string | undefined,
  verbose: boolean,
  dryRun: boolean,
  includeStandard: boolean,
  exportCsvFlag: boolean,
  noOpen: boolean
) {
  const { outPath, repoPath, objectPath, objectFieldsPath, outputExcel, outputCsv, tempCsv } =
    resolvePaths(objectName, outDir, repoRoot);

  const repoPosix = repoPath.replace(/\\/g, "/");
  const objectPosix = objectPath.replace(/\\/g, "/");

  logInfo(`Analyzing fields for object: ${objectName}`, verbose);
  logInfo(`Repo path: ${repoPath}`, verbose);
  logInfo(`Output Excel: ${outputExcel}`, verbose);

  await fsp.mkdir(outPath, { recursive: true });

  await execSfQueryToCsv(orgAlias, objectName, tempCsv, verbose, dryRun);
  const lastModifiedMap = buildLastModifiedMap(tempCsv, verbose);

  logInfo("Pre-loading metadata files into memory...", verbose);
  const apexContent = await preloadTextContent([`${repoPosix}/classes/**/*.cls`, `${repoPosix}/triggers/**/*.trigger`], verbose);
  const flowContent = await preloadTextContent([`${repoPosix}/flows/**/*.flow-meta.xml`], verbose);
  const vrContent = await preloadTextContent([`${repoPosix}/validationRules/**/*.validationRule-meta.xml`], verbose);
  const dupContent = await preloadTextContent([`${repoPosix}/duplicateRules/**/*.duplicateRule-meta.xml`], verbose);
  const layoutContent = await preloadTextContent([`${repoPosix}/layouts/${objectName}-*.layout-meta.xml`], verbose);
  const recordTypeContent = await preloadTextContent([`${objectPosix}/recordTypes/**/*.recordType-meta.xml`], verbose);
  const flexipageContent = await preloadTextContent([`${repoPosix}/flexipages/**/*.flexipage-meta.xml`], verbose);
  const reportContent = await preloadTextContent(
    [`${repoPosix}/reports/**/*.report-meta.xml`, `${repoPosix}/reportTypes/**/*.reportType-meta.xml`, `${repoPosix}/reportTypes/**/*.report-meta.xml`],
    verbose
  );
  const emailTemplateContent = await preloadTextContent([`${repoPosix}/email/**/*.email-meta.xml`], verbose);
  const lwcContent = await preloadTextContent([`${repoPosix}/lwc/**/*.{js,html,xml}`], verbose);
  const auraContent = await preloadTextContent([`${repoPosix}/aura/**/*.{cmp,app,evt,design,js,xml}`], verbose);
  const profilesContent = await preloadTextContent([`${repoPosix}/profiles/**/*.profile-meta.xml`], verbose);
  const permsetContent = await preloadTextContent([`${repoPosix}/permissionsets/**/*.permissionset-meta.xml`], verbose);

  logInfo("Metadata pre-loading complete.", verbose);

  // Build results from local custom fields
  let results: ResultRow[] = await processFields(
    objectFieldsPath,
    {
      lastModified: lastModifiedMap,
      apex: apexContent,
      flow: flowContent,
      vr: vrContent,
      dup: dupContent,
      layout: layoutContent,
      recordType: recordTypeContent,
      flexipage: flexipageContent,
      report: reportContent,
      email: emailTemplateContent,
      lwc: lwcContent,
      aura: auraContent,
      profiles: profilesContent,
      permsets: permsetContent,
    },
    verbose
  );

  // Optionally add standard fields from Tooling API
  if (includeStandard) {
    try {
      logInfo("Fetching FieldDefinition for standard fields...", verbose);
      const defs = await (async () => {
        const q = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName='${objectName}'`;
        const args = ["data", "query", "--use-tooling-api", "--target-org", orgAlias, "--query", q, "--result-format", "csv"];
        const stdout = await execSfStdout(args, verbose);
        const rows = (await import("csv-parse/sync")).parse(stdout, { columns: true, skip_empty_lines: true }) as Array<any>;
        return rows.map((r) => ({
          QualifiedApiName: String(r.QualifiedApiName ?? "").trim(),
          DataType: String(r.DataType ?? "").trim(),
        }));
      })();
      results = mergeStandardFields(results, defs, {
        apex: apexContent,
        flow: flowContent,
        vr: vrContent,
        dup: dupContent,
        report: reportContent,
        email: emailTemplateContent,
        layout: layoutContent,
        recordType: recordTypeContent,
        flexipage: flexipageContent,
        lwc: lwcContent,
        aura: auraContent,
        profiles: profilesContent,
        permsets: permsetContent,
      });
      logInfo(`Merged ${defs.length} standard fields (deduped against local metadata).`, verbose);
    } catch (err: any) {
      console.warn(`Warning: Failed to fetch FieldDefinition. ${err?.message ?? err}`);
    }
  }

  logInfo(`Processing complete. ${results.length} rows generated. Exporting...`, verbose);

// Export Excel
await exportToExcel(results, objectName, outputExcel, verbose);
// Optional CSV
if (exportCsvFlag) await exportToCsv(results, outputCsv, verbose);

// Open file unless disabled
if (!noOpen) openFile(outputExcel, verbose);

// ✅ Give the OS a moment to accept the spawn, then exit cleanly
setTimeout(() => process.exit(0), 500);
}
