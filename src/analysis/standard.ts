import { parse } from "csv-parse/sync";
import { execSfStdout } from "../sf/exec";
import { ResultRow, TextMap } from "../types";
import { searchUsage, collectReferences } from "./search";

/**
 * Fetch standard fields for an object using Tooling API FieldDefinition.
 * Returns rows like: [{ QualifiedApiName, DataType }]
 */
export async function fetchFieldDefinitions(
  orgAlias: string,
  objectName: string,
  verbose: boolean,
  sfPath?: string
): Promise<Array<{ QualifiedApiName: string; DataType: string }>> {
  const q = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName='${objectName}'`;
  const args = [
    "data",
    "query",
    "--use-tooling-api",
    "--target-org",
    orgAlias,
    "--query",
    q,
    "--result-format",
    "csv",
  ];

  const stdout = await execSfStdout(args, verbose, sfPath);
  const rows = parse(stdout, { columns: true, skip_empty_lines: true }) as Array<any>;
  return rows.map((r) => ({
    QualifiedApiName: String(r.QualifiedApiName ?? "").trim(),
    DataType: String(r.DataType ?? "").trim(),
  }));
}

/**
 * Merge standard fields (from FieldDefinition) into existing result rows.
 * - Avoids duplicates based on FieldName (case-insensitive).
 * - Computes references (Apex/Flows/VR/Dup/Report/Email/LWC/Aura).
 * - ✅ Adds ProfilesAndPermSets column with Profile/PermSet references found.
 */
export function mergeStandardFields(
  existingRows: ResultRow[],
  fieldDefs: Array<{ QualifiedApiName: string; DataType: string }>,
  maps: {
    apex: TextMap;
    flow: TextMap;
    vr: TextMap;
    dup: TextMap;
    report: TextMap;
    email: TextMap;
    layout: TextMap;
    recordType: TextMap;
    flexipage: TextMap;
    lwc?: TextMap;
    aura?: TextMap;
    profiles?: TextMap;
    permsets?: TextMap;
  }
): ResultRow[] {
  const existingNames = new Set(existingRows.map((r) => r.FieldName.toLowerCase()));
  const merged = [...existingRows];

  for (const def of fieldDefs) {
    const name = def.QualifiedApiName;
    if (!name) continue;

    // skip if already present (custom fields)
    if (existingNames.has(name.toLowerCase())) continue;

    // Layout / RT / Flexipage usage
    const layoutsUsed = searchUsage(maps.layout, name);
    const recordTypesUsed = searchUsage(maps.recordType, name);
    const flexipagesUsed = searchUsage(maps.flexipage, name);

    // Automation / code references (Apex/Flows/etc.)
    const references = collectReferences(
      maps.apex,
      maps.flow,
      maps.vr,
      maps.dup,
      maps.report,
      maps.email,
      name,
      { lwc: maps.lwc, aura: maps.aura, profiles: maps.profiles, permsets: maps.permsets }
    );

    // ✅ NEW: Profiles & Permission Sets references (own column)
    const profilesRefs = Object.keys(maps.profiles || {})
      .filter((k) => maps.profiles && maps.profiles[k] && maps.profiles[k].includes(name))
      .map((k) => `Profile: ${k}`);

    const permsetRefs = Object.keys(maps.permsets || {})
      .filter((k) => maps.permsets && maps.permsets[k] && maps.permsets[k].includes(name))
      .map((k) => `PermSet: ${k}`);

    const profilesAndPermSets = [...profilesRefs, ...permsetRefs].join(";\n");

    merged.push({
      FieldName: name,
      FieldLabel: "",           // FieldDefinition does not provide label
      Description: "",
      FieldType: def.DataType,  // DataType for standard field
      Formula: "",
      FieldLength: "",
      LookupRef: "",
      Required: "FALSE",        // not available from FieldDefinition in this query
      HistoryTracking: "",
      PicklistValues: "",
      ControllingField: "",
      LastModifiedDate: "",     // not available from FieldDefinition
      Layouts: layoutsUsed,
      Flexipages: flexipagesUsed,
      RecordTypes: recordTypesUsed,
      References: references,
      ProfilesAndPermSets: profilesAndPermSets, // ✅ NEW COLUMN
    });
  }

  return merged;
}
