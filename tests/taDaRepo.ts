import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** The Ta Da repo: `TADA_REPO` when set, else the clone beside this one. */
export const taDaRepo = process.env["TADA_REPO"] ?? resolve(fileURLToPath(new URL("..", import.meta.url)), "../Ta Da");
