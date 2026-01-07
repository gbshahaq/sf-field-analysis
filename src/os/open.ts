import * as fs from "fs";
import { spawn } from "child_process";
import { logInfo } from "../utils/logger";

/** Detect WSL */
function isWSL(): boolean {
  return !!process.env.WSL_DISTRO_NAME ||
         (typeof process.env.__COMPAT_LAYER !== "undefined") ||
         (() => {
           try {
             const txt = fs.readFileSync("/proc/version", "utf8");
             return txt.toLowerCase().includes("microsoft");
           } catch {
             return false;
           }
         })();
}

/** Quote a file path for Windows cmd.exe/powershell */
function quoteWin(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

/** Cross-platform "open file" via OS launcher; detached so Node can exit */
export function openFile(outputExcel: string, verbose: boolean) {
  if (!fs.existsSync(outputExcel)) {
    console.error(`Cannot open: file not found at ${outputExcel}`);
    return;
  }

  const platform = process.platform;

  try {
    if (platform === "win32") {
      if (isWSL()) {
        // WSL: use Windows PowerShell from WSL to open with default app
        const child = spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process", outputExcel], {
          detached: true, stdio: "ignore", windowsHide: true,
        });
        child.unref();
        if (verbose) logInfo("Opening Excel via WSL PowerShell Start-Process…", verbose);
        return;
      }

      // Windows native: try explorer.exe first (simplest & reliable)
      const child1 = spawn("explorer.exe", [outputExcel], {
        detached: true, stdio: "ignore", windowsHide: true,
      });
      child1.on("error", () => {
        // Fallback: cmd.exe start "" "<path>"
        const child2 = spawn("cmd.exe", ["/c", "start", "", quoteWin(outputExcel)], {
          detached: true, stdio: "ignore", windowsHide: true,
        });
        child2.on("error", () => {
          // Final fallback: PowerShell Start-Process
          const child3 = spawn("powershell", ["-NoProfile", "-Command", "Start-Process", outputExcel], {
            detached: true, stdio: "ignore", windowsHide: true,
          });
          child3.unref();
        });
        child2.unref();
      });
      child1.unref();
      if (verbose) logInfo("Opening Excel via explorer.exe…", verbose);
      return;
    }

    if (platform === "darwin") {
      const child = spawn("open", [outputExcel], { detached: true, stdio: "ignore" });
      child.unref();
      if (verbose) logInfo("Opening Excel via macOS 'open'…", verbose);
      return;
    }

    // Linux: try xdg-open, then gio open
    const child = spawn("xdg-open", [outputExcel], { detached: true, stdio: "ignore" });
    child.on("error", () => {
      const child2 = spawn("gio", ["open", outputExcel], { detached: true, stdio: "ignore" });
      child2.unref();
    });
    child.unref();
    if (verbose) logInfo("Opening Excel via 'xdg-open'…", verbose);
  } catch (err: any) {
    console.error("Failed to open Excel file:", err?.message ?? err);
  }
}
