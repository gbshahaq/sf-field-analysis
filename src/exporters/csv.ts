import * as fsp from "fs/promises";
import { ResultRow } from "../types";
import { logInfo } from "../utils/logger";

export async function exportToCsv(rows: ResultRow[], outputCsv: string, verbose: boolean): Promise<void> {
  try { await fsp.unlink(outputCsv); } catch {}
  const headers = Object.keys(rows[0] ?? {
    FieldName: "", FieldLabel: "", Description: "", FieldType: "", Formula: "", FieldLength: "",
    LookupRef: "", Required: "", HistoryTracking: "", PicklistValues: "", ControllingField: "",
    LastModifiedDate: "", Layouts: "", Flexipages: "", RecordTypes: "", References: "",
  });
  const lines = [headers.join(",")];
  for (const r of rows) {
    const vals = headers.map((h) => `"${String((r as any)[h] ?? "").replace(/"/g, '""')}"`);
    lines.push(vals.join(","));
  }
  await fsp.writeFile(outputCsv, lines.join("\n"), "utf8");
  logInfo(`CSV file generated at: ${outputCsv}`, verbose);
}
