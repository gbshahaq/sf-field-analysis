import * as fsp from "fs/promises";
import * as ExcelJS from "exceljs";
import { ResultRow } from "../types";
import { logInfo } from "../utils/logger";

export async function exportToExcel(
  rows: ResultRow[],
  objectName: string,
  outputExcel: string,
  verbose: boolean
): Promise<void> {
  try { await fsp.unlink(outputExcel); } catch {}

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${objectName} Fields`, {
    properties: { defaultRowHeight: 15 },
    views: [{ state: "frozen", xSplit: 0, ySplit: 2 }],
  });

  const title = `${objectName} Field Analysis`;
  const headers = Object.keys(rows[0] ?? {
    FieldName: "", FieldLabel: "", Description: "", FieldType: "", Formula: "", FieldLength: "",
    LookupRef: "", Required: "", HistoryTracking: "", PicklistValues: "", ControllingField: "",
    LastModifiedDate: "", Layouts: "", Flexipages: "", RecordTypes: "", References: "",
  });

  ws.addRow([title]);
  if (headers.length > 1) ws.mergeCells(1, 1, 1, headers.length);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(1).alignment = { horizontal: "center" };

  ws.addRow(headers);
  const headerRow = ws.getRow(2);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center" };
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };

  for (const r of rows) ws.addRow(headers.map((h) => (r as any)[h] ?? ""));

  const lastRow = ws.rowCount;
  for (let r = 3; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= headers.length; c++) row.getCell(c).alignment = { wrapText: true, vertical: "top" };
  }

  for (let c = 1; c <= headers.length; c++) {
    let maxLength = 0;
    for (let r = 1; r <= lastRow; r++) {
      const text = String(ws.getRow(r).getCell(c).value ?? "");
      maxLength = Math.max(maxLength, text.length);
    }
    ws.getColumn(c).width = Math.min(maxLength + 5, 50);
  }

  await wb.xlsx.writeFile(outputExcel);
  logInfo(`Excel file generated at: ${outputExcel}`, verbose);
}
