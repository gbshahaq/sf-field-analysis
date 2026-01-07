import * as os from "os";
import * as path from "path";

export const toPosix = (p: string) => p.replace(/\\/g, "/");

export function resolvePaths(objectName: string, outDir?: string, repoRoot?: string) {
  const outPath = outDir ?? path.join(os.homedir());
  const repoPath = repoRoot ? repoRoot : path.join(outPath, "force-app", "main", "default");
  const objectPath = path.join(repoPath, "objects", objectName);
  const objectFieldsPath = path.join(objectPath, "fields");
  const outputExcel = path.join(outPath, `${objectName}_Field_Analysis.xlsx`);
  const outputCsv = path.join(outPath, `${objectName}_Field_Analysis.csv`);
  const tempCsv = path.join(outPath, `${objectName}_LastModified.csv`);
  return { outPath, repoPath, objectPath, objectFieldsPath, outputExcel, outputCsv, tempCsv };
}
