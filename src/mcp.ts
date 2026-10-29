import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as notes from "./notes";
import { UserError } from "./notes";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

function text(value: string): Result {
	return { content: [{ type: "text", text: value }] };
}

function json(value: unknown): Result {
	return text(JSON.stringify(value));
}

// Turns UserError into a tool error the model can read and fix.
function tool<A>(fn: (args: A) => Promise<Result>) {
	return async (args: A): Promise<Result> => {
		try {
			return await fn(args);
		} catch (err) {
			if (err instanceof UserError) return { isError: true, content: [{ type: "text", text: err.message }] };
			throw err;
		}
	};
}

function kb(size: number) {
	return size < 1000 ? `${size}b` : `${(size / 1000).toFixed(1)}k`;
}

// Header line, then the markdown, so a model reads the note as-is rather than
// as an escaped JSON string.
function formatNote(note: notes.Note, lines?: { offset?: number; limit?: number }) {
	let body = note.content;
	let range = "";
	if (lines?.offset || lines?.limit) {
		const all = body.split("\n");
		const start = Math.max(1, lines.offset ?? 1);
		const end = Math.min(all.length, start - 1 + (lines.limit ?? all.length));
		body = all.slice(start - 1, end).join("\n");
		range = ` lines=${start}-${end}/${all.length}`;
	}
	return `--- ${note.path} (version=${note.version} updated=${note.updated_at}${range})\n${body}`;
}

const path = z.string().describe('Slash-separated, like "Projects/Wiki ideas". No file extension.');

export function createServer(env: Env) {
	const server = new McpServer(
		{ name: "audrey.wiki", version: "1.0.0" },
		{
			instructions:
				"Private notes: folders of markdown notes, addressed by path like \"Projects/Wiki ideas\" (no .md). " +
				"She edits them in a browser at https://notes.example.com too. " +
				"To find things, use search or list rather than reading notes one by one. " +
				"To change part of a note, use edit with the exact text to swap instead of rewriting the whole note. " +
				"Notes can link to each other with [[Note name]] or [[Folder/Note name]].",
		},
	);

	server.registerTool(
		"list",
		{
			description:
				"List folders and notes, one per line with size and last update. Folders end in /. " +
				"Leave out folder for everything.",
			inputSchema: z.object({
				folder: z.string().optional(),
				recursive: z.boolean().default(true).describe("false lists only the folder's direct contents"),
			}),
			annotations: { readOnlyHint: true },
		},
		tool(async (args) => {
			const { folder, folders, notes: found } = await notes.list(env, args);
			const lines = [
				...folders.map((f) => `${f}/`),
				...found.map((n) => `${n.path}  ${kb(n.size)}  ${n.updated_at.slice(0, 16)}`),
			].sort((a, b) => a.localeCompare(b));
			if (!lines.length) return text(folder ? `${folder}/ is empty.` : "No notes yet.");
			return text(lines.join("\n"));
		}),
	);

	server.registerTool(
		"read",
		{
			description:
				"Read one or more notes. Each comes back as a header line with its version, then its markdown. " +
				"For a long note, pass offset and limit to read some lines.",
			inputSchema: z.object({
				paths: z.array(path).min(1).max(50),
				offset: z.number().int().min(1).optional().describe("First line to return, from 1"),
				limit: z.number().int().min(1).optional().describe("How many lines to return"),
			}),
			annotations: { readOnlyHint: true },
		},
		tool(async ({ paths, offset, limit }) => {
			const found = await notes.readMany(env, paths);
			return text(
				found.map((n) => ("error" in n ? `--- ${n.path}\n(${n.error})` : formatNote(n, { offset, limit }))).join("\n\n"),
			);
		}),
	);

	server.registerTool(
		"search",
		{
			description:
				"Find notes where every word of the query appears in the path or text (case-insensitive). " +
				"Returns paths, newest first, with up to 5 matching lines each.",
			inputSchema: z.object({
				query: z.string(),
				folder: z.string().optional().describe("Only search inside this folder"),
				limit: z.number().int().min(1).max(100).default(20),
			}),
			annotations: { readOnlyHint: true },
		},
		tool(async (args) => {
			const results = await notes.search(env, args);
			if (!results.length) return text("No matches.");
			return text(
				results
					.map((r) => [r.path, ...r.matches.map((m) => `  ${m.line}: ${m.text}`)].join("\n"))
					.join("\n"),
			);
		}),
	);

	server.registerTool(
		"write",
		{
			description:
				"Create a note, or change a whole note. Missing folders are created. " +
				'mode "replace" (default) overwrites, "append" adds to the end, "prepend" adds to the start. ' +
				"When rewriting a note you read, pass if_version from its header so you don't wipe out changes made since.",
			inputSchema: z.object({
				path,
				content: z.string().max(notes.MAX_NOTE),
				mode: z.enum(["replace", "append", "prepend"]).default("replace"),
				if_version: z.number().int().optional(),
			}),
		},
		tool(async (args) => json(await notes.write(env, args))),
	);

	server.registerTool(
		"edit",
		{
			description:
				"Replace exact text in a note. old_text must match exactly once (include surrounding text to make it " +
				"unique), or pass replace_all. new_text can be empty to delete.",
			inputSchema: z.object({
				path,
				old_text: z.string(),
				new_text: z.string(),
				replace_all: z.boolean().default(false),
			}),
		},
		tool(async (args) => json(await notes.edit(env, args))),
	);

	server.registerTool(
		"move",
		{
			description:
				"Rename or move a note or a folder. A folder moves with everything in it. Missing folders are created.",
			inputSchema: z.object({ from: z.string(), to: z.string() }),
			annotations: { destructiveHint: false },
		},
		tool(async (args) => json(await notes.move(env, args))),
	);

	server.registerTool(
		"create_folder",
		{
			description: "Create an empty folder. You don't need this before writing a note; write creates folders.",
			inputSchema: z.object({ path: z.string() }),
		},
		tool(async ({ path }) => json(await notes.createFolder(env, path))),
	);

	server.registerTool(
		"delete",
		{
			description:
				"Delete a note or a folder. This can't be undone. A folder with anything in it needs recursive: true.",
			inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(false) }),
			annotations: { destructiveHint: true },
		},
		tool(async (args) => json(await notes.remove(env, args))),
	);

	return server;
}
