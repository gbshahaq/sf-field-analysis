import * as fsp from "fs/promises";
import * as path from "path";
import fg, { Options as FastGlobOptions } from "fast-glob";
import { toPosix } from "../utils/pathing";
import { TextMap } from "../types";
import { logInfo } from "../utils/logger";

export async function preloadTextContent(globPatterns: string[], verbose: boolean): Promise<TextMap> {
  const posixPatterns = globPatterns.map(toPosix);
  const files = await fg(posixPatterns, { dot: false } as FastGlobOptions);
  const content: TextMap = {};
  await Promise.all(
    files.map(async (f) => {
      try {
        const txt = await fsp.readFile(f, "utf8");
        content[path.basename(f)] = txt;
      } catch {
        /* ignore read errors */
      }
    })
  );
  logInfo(`Preloaded ${Object.keys(content).length} files for patterns: ${posixPatterns.join(", ")}`, verbose);
  return content;
}
