// src/sf/exec.ts
import { execFile } from "child_process";

/**
 * Execute Salesforce CLI and return stdout.
 * - On Windows: always go via cmd.exe /c <sfPathOrName> <args> to avoid .cmd shim EINVAL/ENOENT.
 * - On macOS/Linux: exec the binary directly.
 * - If sfPath is provided, it is used verbatim; otherwise "sf" is used on all platforms.
 */
export async function execSfStdout(
  args: string[],
  verbose: boolean,
  sfPath?: string
): Promise<string> {
  const isWin = process.platform === "win32";
  const bin = sfPath && sfPath.trim().length > 0 ? sfPath : "sf";

  if (isWin) {
    // Windows: robust invocation through cmd.exe to ensure PATHEXT/association logic is honored.
    const cmdArgs = ["/c", bin, ...args];
    if (verbose) {
      console.log(`Running (Windows): cmd.exe ${cmdArgs.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`);
    }
    return await new Promise<string>((resolve, reject) => {
      execFile(
        "cmd.exe",
        cmdArgs,
        { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const msg = (stderr || error.message || "").trim();
            return reject(new Error(`Salesforce CLI failed. ${msg}`));
          }
          resolve(stdout);
        }
      );
    });
  }

  // macOS/Linux: direct execution
  if (verbose) {
    console.log(`Running (*nix): ${bin} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`);
  }
  return await new Promise<string>((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const msg = (stderr || error.message || "").trim();
        return reject(new Error(`Salesforce CLI failed. ${msg}`));
      }
      resolve(stdout);
    });
  });
}
