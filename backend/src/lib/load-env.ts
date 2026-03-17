import path from "node:path";
import { config } from "dotenv";
import { getStateDir } from "./paths.js";

// Resolve repo root from state dir (state is repo root / state)
const REPO_ROOT = path.resolve(getStateDir(), "..");
config({ path: path.join(REPO_ROOT, ".env") });
