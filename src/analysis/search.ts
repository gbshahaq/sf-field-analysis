import { TextMap } from "../types";
import { containsField } from "./matchers";

/** Finds all files where the field name appears */
export function searchUsage(contentMap: TextMap, needle: string): string {
  const matches: string[] = [];
  for (const [name, text] of Object.entries(contentMap)) {
    if (containsField(text, needle)) matches.push(name);
  }
  return matches.join("; ");
}

/** Collects references across multiple metadata types */
export function collectReferences(
  apex: TextMap,
  flow: TextMap,
  vr: TextMap,
  dup: TextMap,
  report: TextMap,
  email: TextMap,
  fieldName: string,
  extras?: { lwc?: TextMap; aura?: TextMap; profiles?: TextMap; permsets?: TextMap }
): string {
  const refs: string[] = [];
  const f = fieldName;

  for (const k of Object.keys(apex)) if (containsField(apex[k], f)) refs.push(`Apex: ${k}`);
  for (const k of Object.keys(flow)) if (containsField(flow[k], f)) refs.push(`Flow: ${k}`);
  for (const k of Object.keys(vr)) if (containsField(vr[k], f)) refs.push(`ValidationRule: ${k}`);
  for (const k of Object.keys(dup)) if (containsField(dup[k], f)) refs.push(`DuplicateRule: ${k}`);
  for (const k of Object.keys(report)) if (containsField(report[k], f)) refs.push(`Report: ${k}`);
  for (const k of Object.keys(email)) if (containsField(email[k], f)) refs.push(`EmailTemplate: ${k}`);

  if (extras?.lwc) for (const k of Object.keys(extras.lwc)) if (containsField(extras.lwc[k], f)) refs.push(`LWC: ${k}`);
  if (extras?.aura) for (const k of Object.keys(extras.aura)) if (containsField(extras.aura[k], f)) refs.push(`Aura: ${k}`);
  if (extras?.profiles) for (const k of Object.keys(extras.profiles)) if (containsField(extras.profiles[k], f)) refs.push(`Profile: ${k}`);
  if (extras?.permsets) for (const k of Object.keys(extras.permsets)) if (containsField(extras.permsets[k], f)) refs.push(`PermSet: ${k}`);

  return refs.join(";\n");
}
