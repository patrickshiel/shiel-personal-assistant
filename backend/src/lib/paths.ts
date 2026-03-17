import path from "node:path";
import { fileURLToPath } from "node:url";

function getRepoRoot() {
  // backend/src/lib/paths.ts -> backend/src/lib -> backend/src -> backend -> repo root
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../../../");
}

export function getStateDir(): string {
  return path.join(getRepoRoot(), "state");
}

