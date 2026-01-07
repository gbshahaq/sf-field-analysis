import * as fs from "fs";
import * as fsp from "fs/promises";
import fg, { Options as FastGlobOptions } from "fast-glob";
import { parseStringPromise } from "xml2js";
import { ResultRow, StringMap, TextMap } from "../types";
import { toPosix } from "../utils/pathing";
import { logInfo } from "../utils/logger";
import { searchUsage, collectReferences } from "./search";

function readXmlFieldValue(obj: any, pathChain: string[]): string {
  let node = obj;
  for (const key of pathChain) {
    if (!node || !(key in node)) return "";
    node = node[key];
  }
  if (Array.isArray(node)) {
    if (node.length === 0) return "";
    const v = node[0];
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  return typeof node === "string" ? node : JSON.stringify(node);
}

function getPicklistValues(customField: any): { values: string; controlling: string } {
  const vs = customField?.valueSet?.[0];
  if (!vs) return { values: "", controlling: "" };

  const definition = vs?.valueSetDefinition?.[0];
  const controlling = vs?.controllingField ? String(vs.controllingField[0]) : "";

  const vals = definition?.value;
  if (Array.isArray(vals) && vals.length > 0) {
    const names = vals.map((v: any) => String(v?.fullName?.[0] ?? "")).filter(Boolean);
    if (names.length > 0) return { values: names.join(", "), controlling };
  }

  const vsetName = vs?.valueSetName?.[0];
  if (vsetName) return { values: String(vsetName), controlling };

  return { values: "", controlling };
}

function getFieldLength(customField: any, fieldType: string): string {
  const t = (fieldType || "").trim();
  if (t === "Text" || t === "Html" || t === "LongTextArea") {
    const len = customField?.length?.[0];
    return len ? String(len) : "";
  }
  if (t === "Number" || t === "Currency" || t === "Currency ") {
    const precision = customField?.precision?.[0];
    const scale = customField?.scale?.[0];
    const p = precision ? String(precision) : "";
    const s = scale ? String(scale) : "";
    return [p, s].filter(Boolean).join(", ");
  }
  return "";
}

export async function processFields(
  objectFieldsPath: string,
  maps: {
    lastModified: StringMap;
    apex: TextMap;
    flow: TextMap;
    vr: TextMap;
    dup: TextMap;
    layout: TextMap;
    recordType: TextMap;
    flexipage: TextMap;
    report: TextMap;
    email: TextMap;
    lwc?: TextMap;
    aura?: TextMap;
    profiles?: TextMap;
    permsets?: TextMap;
  },
  verbose: boolean
): Promise<ResultRow[]> {
  if (!fs.existsSync(objectFieldsPath)) {
    throw new Error(
      `Fields folder not found: ${objectFieldsPath}.
Check --repoRoot is correct and that '${objectFieldsPath.split(/[\\/]/).slice(-2, -1)[0]}' exists under 'objects/'.`
    );
  }

  const fieldGlob = `${toPosix(objectFieldsPath)}/**/*.field-meta.xml`;
  const fieldFiles = await fg([fieldGlob], { dot: false } as FastGlobOptions);
  logInfo(`Discovered ${fieldFiles.length} field files using glob: ${fieldGlob}`, verbose);

  if (fieldFiles.length === 0) {
    throw new Error(
      `No field metadata files found for object at: ${objectFieldsPath}.
Verify the object API name and the repo root (try --repoRoot ".../force-app/main/default").`
    );
  }

  const results: ResultRow[] = [];
  for (const file of fieldFiles) {
    const xmlText = await fsp.readFile(file, "utf8");
    const xml = await parseStringPromise(xmlText, { explicitArray: true });
    const cf = xml?.CustomField;
    if (!cf) continue;

    const fieldName = readXmlFieldValue(xml, ["CustomField", "fullName"]);
    const fieldDesc = readXmlFieldValue(xml, ["CustomField", "description"]);
    const fieldTrack = readXmlFieldValue(xml, ["CustomField", "trackHistory"]);
    const fieldLabel = readXmlFieldValue(xml, ["CustomField", "label"]);
    const fieldType = readXmlFieldValue(xml, ["CustomField", "type"]);
    const fieldFormula = readXmlFieldValue(xml, ["CustomField", "formula"]);
    const fieldLength = getFieldLength(cf, fieldType);
    const lookupRef = (fieldType === "Lookup" ? readXmlFieldValue(xml, ["CustomField", "referenceTo"]) : "") || "";
    const requiredRaw = readXmlFieldValue(xml, ["CustomField", "required"]).toLowerCase();
    const isRequired: "TRUE" | "FALSE" = requiredRaw === "true" ? "TRUE" : "FALSE";
    const { values: picklistValues, controlling: controllingField } = getPicklistValues(cf);

    const lastModified = maps.lastModified[fieldName.toLowerCase()] ?? "";
    const layoutsUsed = searchUsage(maps.layout, fieldName);
    const recordTypesUsed = searchUsage(maps.recordType, fieldName);
    const flexipagesUsed = searchUsage(maps.flexipage, fieldName);

    const references = collectReferences(
      maps.apex,
      maps.flow,
      maps.vr,
      maps.dup,
      maps.report,
      maps.email,
      fieldName,
      { lwc: maps.lwc, aura: maps.aura }
    );

    // ✅ NEW: Collect Profile and Permission Set references
    const profilesRefs = Object.keys(maps.profiles || {})
      .filter(k => maps.profiles && maps.profiles[k] && maps.profiles[k].includes(fieldName))
      .map(k => `Profile: ${k}`);

    const permsetRefs = Object.keys(maps.permsets || {})
      .filter(k => maps.permsets && maps.permsets[k] && maps.permsets[k].includes(fieldName))
      .map(k => `PermSet: ${k}`);

    const profilesAndPermSets = [...profilesRefs, ...permsetRefs].join(";\n");

    results.push({
      FieldName: fieldName,
      FieldLabel: fieldLabel,
      Description: fieldDesc,
      FieldType: fieldType,
      Formula: fieldFormula,
      FieldLength: fieldLength,
      LookupRef: lookupRef,
      Required: isRequired,
      HistoryTracking: fieldTrack,
      PicklistValues: picklistValues,
      ControllingField: controllingField,
      LastModifiedDate: lastModified,
      Layouts: layoutsUsed,
      Flexipages: flexipagesUsed,
      RecordTypes: recordTypesUsed,
      References: references,
      ProfilesAndPermSets: profilesAndPermSets // ✅ NEW COLUMN
    });
  }

  return results;
}
