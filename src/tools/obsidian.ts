/**
 * Obsidian tools — read/write markdown. Supports personal and work vaults.
 * Personal: OBSIDIAN_VAULT_PATH (patrick@shiel.io). Work: OBSIDIAN_VAULT_PATH_WORK (patrick@xwave.ie).
 * If only one vault is set, context defaults to that vault.
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { Context } from "../config/contexts.js";

const contextSchema = z.enum(["personal", "work"]).nullable().optional().describe("personal = patrick@shiel.io, work = patrick@xwave.ie");

const PLACEHOLDER_VAULT_PATTERNS = ["/Users/you", "C:\\Users\\you", "/path/to"];

function getVaultPath(context?: Context): string {
  if (context === "work") return process.env.OBSIDIAN_VAULT_PATH_WORK ?? process.env.OBSIDIAN_VAULT_PATH ?? "";
  return process.env.OBSIDIAN_VAULT_PATH ?? "";
}

function validateVaultPath(vaultPath: string, context: "personal" | "work"): string | null {
  if (!vaultPath.trim()) return null;
  const isPlaceholder = PLACEHOLDER_VAULT_PATTERNS.some((p) => vaultPath.startsWith(p));
  if (isPlaceholder) {
    const envVar = context === "work" ? "OBSIDIAN_VAULT_PATH_WORK" : "OBSIDIAN_VAULT_PATH";
    return `Obsidian vault path looks like a placeholder (${vaultPath}). Set ${envVar} in .env to your actual vault folder (e.g. /Users/yourname/Documents/ObsidianWork).`;
  }
  return null;
}

function resolveVaultPath(relativePath: string, basePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/g, "");
  const full = path.resolve(basePath, normalized);
  if (!basePath || !full.startsWith(path.resolve(basePath))) {
    throw new Error("Path outside Obsidian vault is not allowed");
  }
  return full;
}

export const listNotesSchema = z.object({
  context: contextSchema,
  folder: z.string().nullable().optional().default("").describe("Subfolder relative to vault, e.g. 'Daily' or 'Projects'"),
  extension: z.string().nullable().optional().default(".md"),
});

export const readNoteSchema = z.object({
  context: contextSchema,
  relativePath: z.string().describe("Path relative to vault, e.g. 'Daily/2025-03-08.md'"),
});

export const writeNoteSchema = z.object({
  context: contextSchema,
  relativePath: z.string(),
  content: z.string(),
  frontmatter: z.record(z.unknown()).nullable().optional(),
});

export const appendToNoteSchema = z.object({
  context: contextSchema,
  relativePath: z.string(),
  content: z.string(),
});

export const searchNotesSchema = z.object({
  context: contextSchema,
  query: z.string().describe("Text to search in note contents"),
  folder: z.string().nullable().optional(),
});

export type ListNotesInput = z.infer<typeof listNotesSchema>;
export type ReadNoteInput = z.infer<typeof readNoteSchema>;
export type WriteNoteInput = z.infer<typeof writeNoteSchema>;
export type AppendToNoteInput = z.infer<typeof appendToNoteSchema>;
export type SearchNotesInput = z.infer<typeof searchNotesSchema>;

function getContext(input: { context?: Context | null }): Context | undefined {
  return input.context ?? undefined;
}

export async function listNotes(input: ListNotesInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const vaultPath = getVaultPath(ctx);
  if (!vaultPath) return JSON.stringify({ error: "OBSIDIAN_VAULT_PATH not set (and no OBSIDIAN_VAULT_PATH_WORK for work)." });
  const placeholderErr = validateVaultPath(vaultPath, ctx);
  if (placeholderErr) return JSON.stringify({ error: placeholderErr });
  try {
    const folder = input.folder ?? "";
    const ext = input.extension ?? ".md";
    const dir = resolveVaultPath(folder, vaultPath);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(ext))
      .map((e) => path.join(folder, e.name).replace(/\\/g, "/"));
    return JSON.stringify({ context: getContext(input) ?? "personal", files });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

export async function readNote(input: ReadNoteInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const vaultPath = getVaultPath(ctx);
  if (!vaultPath) return JSON.stringify({ error: "OBSIDIAN_VAULT_PATH not set." });
  const placeholderErr = validateVaultPath(vaultPath, ctx);
  if (placeholderErr) return JSON.stringify({ error: placeholderErr });
  try {
    const full = resolveVaultPath(input.relativePath, vaultPath);
    const raw = await fs.readFile(full, "utf-8");
    const { data, content } = matter(raw);
    return JSON.stringify({ context: getContext(input) ?? "personal", frontmatter: data, content });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

export async function writeNote(input: WriteNoteInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const vaultPath = getVaultPath(ctx);
  if (!vaultPath) {
    const envVar = ctx === "work" ? "OBSIDIAN_VAULT_PATH_WORK" : "OBSIDIAN_VAULT_PATH";
    return JSON.stringify({ error: `${envVar} not set. Add your Obsidian vault path to .env.` });
  }
  const placeholderErr = validateVaultPath(vaultPath, ctx);
  if (placeholderErr) return JSON.stringify({ error: placeholderErr });
  try {
    const full = resolveVaultPath(input.relativePath, vaultPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const body = input.frontmatter
      ? matter.stringify(input.content, input.frontmatter)
      : input.content;
    await fs.writeFile(full, body, "utf-8");
    return JSON.stringify({ success: true, context: ctx, path: input.relativePath });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "EACCES" || err?.code === "EPERM") {
      const envVar = ctx === "work" ? "OBSIDIAN_VAULT_PATH_WORK" : "OBSIDIAN_VAULT_PATH";
      return JSON.stringify({
        error: `Permission denied writing to vault. Check that ${envVar} in .env points to a folder you can write to (your actual Obsidian vault path).`,
      });
    }
    return JSON.stringify({ error: String(e) });
  }
}

export async function appendToNote(input: AppendToNoteInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const vaultPath = getVaultPath(ctx);
  if (!vaultPath) return JSON.stringify({ error: "OBSIDIAN_VAULT_PATH not set." });
  const placeholderErr = validateVaultPath(vaultPath, ctx);
  if (placeholderErr) return JSON.stringify({ error: placeholderErr });
  try {
    const full = resolveVaultPath(input.relativePath, vaultPath);
    await fs.appendFile(full, "\n" + input.content, "utf-8");
    return JSON.stringify({ success: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "EACCES" || err?.code === "EPERM") {
      const envVar = ctx === "work" ? "OBSIDIAN_VAULT_PATH_WORK" : "OBSIDIAN_VAULT_PATH";
      return JSON.stringify({ error: `Permission denied. Check ${envVar} in .env points to your actual vault.` });
    }
    return JSON.stringify({ error: String(e) });
  }
}

export async function searchNotes(input: SearchNotesInput): Promise<string> {
  const ctx = getContext(input) ?? "personal";
  const vaultPath = getVaultPath(ctx);
  if (!vaultPath) return JSON.stringify({ error: "OBSIDIAN_VAULT_PATH not set." });
  const placeholderErr = validateVaultPath(vaultPath, ctx);
  if (placeholderErr) return JSON.stringify({ error: placeholderErr });
  try {
    const dir = resolveVaultPath(input.folder ?? "", vaultPath);
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    const results: { path: string; snippet: string }[] = [];
    const q = input.query.toLowerCase();
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const full = path.join(e.path ?? dir, e.name);
      const rel = path.relative(vaultPath, full);
      const raw = await fs.readFile(full, "utf-8");
      const { content } = matter(raw);
      if (content.toLowerCase().includes(q)) {
        const idx = content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + q.length + 40);
        results.push({ path: rel, snippet: content.slice(start, end) });
      }
    }
    return JSON.stringify({ context: getContext(input) ?? "personal", results });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}
