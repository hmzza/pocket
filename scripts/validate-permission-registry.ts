import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveAdminPermission } from "../apps/api/src/lib/permissions.js";

const routeFiles = [
  { file: "apps/api/src/routes/admin.ts", prefix: "/api/admin", exempt: new Set(["/branches", "/permissions", "/settings", "/notifications", "/uploads"]) },
  { file: "apps/api/src/routes/pos.ts", prefix: "/api/pos", exempt: new Set<string>() },
  { file: "apps/api/src/routes/ops.ts", prefix: "/api/ops", exempt: new Set<string>() }
];

async function main() {
  for (const routeFile of routeFiles) {
    const source = await readFile(resolve(process.cwd(), routeFile.file), "utf8");
    const paths = [...source.matchAll(/router\.(?:get|post|patch|delete)\("([^\"]+)"/g)].map((match) => match[1]);

    if (routeFile.prefix !== "/api/admin") continue;
    const missing = paths.filter((path) => {
      if ([...routeFile.exempt].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
      return !resolveAdminPermission(`${routeFile.prefix}${path}`);
    });

    if (missing.length) {
      throw new Error(`Unregistered admin routes: ${missing.join(", ")}`);
    }
  }

  console.log("Permission registry validation passed.");
}

void main();
