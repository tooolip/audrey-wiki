"use strict";

// Notes at audrey.rocks/notes: folders of markdown notes. Plain JS, no build step.
// Notes are addressed by path, like "Projects/Wiki ideas", and the page URL is
// "#/Projects/Wiki%20ideas".

const $ = (id) => document.getElementById(id);
const SAVE_DELAY = 700;

const state = {
	folders: [],
	notes: [],
	current: null, // { path, version, saved } for the open note
	dirty: false,
	saving: null, // promise of the save in flight
	conflict: false,
	mode: store("mode") ?? "edit",
	open: new Set(JSON.parse(store("open") ?? "[]")),
};

function store(key, value) {
	try {
		if (value === undefined) return localStorage.getItem(key);
		localStorage.setItem(key, value);
	} catch {
		return null;
	}
}

function el(tag, props = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (v === undefined || v === null || v === false) continue;
		if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
		else if (k === "class") node.className = v;
		else if (k in node) node[k] = v;
		else node.setAttribute(k, v);
	}
	node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
	return node;
}

const nameOf = (path) => path.split("/").pop();
const parentOf = (path) => path.split("/").slice(0, -1).join("/");
const join = (folder, name) => (folder ? `${folder}/${name}` : name);
const hashFor = (path) => "#/" + path.split("/").map(encodeURIComponent).join("/");

function pathFromHash() {
	const raw = location.hash.replace(/^#\/?/, "");
	if (!raw) return null;
	try {
		return raw.split("/").map(decodeURIComponent).join("/");
	} catch {
		return null;
	}
}

// API

async function api(method, url, body) {
	const res = await fetch(url, {
		method,
		redirect: "manual",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	// Access redirects to its login page once the session runs out.
	if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) {
		location.reload();
		throw new Error("Signed out");
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
	return data;
}

function setStatus(text) {
	$("status").textContent = text;
}

// The status line at the bottom reads like an editor's: INSERT while editing,
// READ in read mode, and the open note's path.
function setModeLine() {
	$("sb-mode").textContent = !state.current ? "NORMAL" : state.mode === "read" ? "READ" : "INSERT";
	$("sb-path").textContent = state.current ? state.current.path : "";
}

// Basic accounts see how many saves are left today; the dev account gets the admin link.
async function loadMe() {
	try {
		const me = await api("GET", "/notes/api/me");
		$("admin-link").hidden = me.role !== "dev";
		$("sb-left").textContent = me.writes_left === null ? "" : `${me.writes_left} saves left today`;
	} catch {
		/* only a nicety */
	}
}

function fail(err) {
	setStatus("");
	alert(err.message);
}

// Tree

async function loadTree() {
	const { folders, notes } = await api("GET", "/notes/api/tree");
	state.folders = folders;
	state.notes = notes;
	renderTree();
}

function buildTree() {
	const root = { folders: new Map(), notes: [] };
	const folderNode = (path) => {
		let node = root;
		let sofar = "";
		for (const part of path.split("/")) {
			sofar = join(sofar, part);
			if (!node.folders.has(part)) node.folders.set(part, { path: sofar, folders: new Map(), notes: [] });
			node = node.folders.get(part);
		}
		return node;
	};
	for (const f of state.folders) folderNode(f);
	for (const n of state.notes) (parentOf(n.path) ? folderNode(parentOf(n.path)) : root).notes.push(n);
	return root;
}

function rowTools(...buttons) {
	return el("span", { class: "tools" }, ...buttons);
}

const GLYPHS = { plus: "+", pencil: "✎", trash: "×" };

function toolButton(title, glyph, onclick) {
	return el(
		"button",
		{
			class: "glyph",
			type: "button",
			title,
			"aria-label": title,
			onclick: (e) => {
				e.preventDefault();
				e.stopPropagation();
				onclick();
			},
		},
		GLYPHS[glyph],
	);
}

function draggable(row, path) {
	row.draggable = true;
	row.addEventListener("dragstart", (e) => {
		e.dataTransfer.setData("text/x-wiki-path", path);
		e.dataTransfer.effectAllowed = "move";
	});
}

function dropTarget(row, folder) {
	row.addEventListener("dragover", (e) => {
		if (!e.dataTransfer.types.includes("text/x-wiki-path")) return;
		e.preventDefault();
		row.classList.add("drop");
	});
	row.addEventListener("dragleave", () => row.classList.remove("drop"));
	row.addEventListener("drop", (e) => {
		e.preventDefault();
		row.classList.remove("drop");
		const from = e.dataTransfer.getData("text/x-wiki-path");
		if (!from || parentOf(from) === folder || from === folder) return;
		moveTo(from, join(folder, nameOf(from)));
	});
}

function renderFolder(node) {
	const list = el("ul");
	const folders = [...node.folders.values()].sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path)));
	for (const f of folders) {
		const item = el("li", { class: "folder" + (state.open.has(f.path) ? " open" : "") });
		const row = el(
			"div",
			{
				class: "row",
				tabIndex: 0,
				role: "button",
				"aria-expanded": String(state.open.has(f.path)),
				onclick: () => toggleFolder(f.path),
				onkeydown: (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						toggleFolder(f.path);
					}
				},
			},
			el("span", { class: "chev", "aria-hidden": "true" }),
			el("span", { class: "name" }, nameOf(f.path) + "/"),
			rowTools(
				toolButton("New note here", "plus", () => newNote(f.path)),
				toolButton("Rename or move", "pencil", () => renamePrompt(f.path)),
				toolButton("Delete folder", "trash", () => deletePath(f.path, true)),
			),
		);
		draggable(row, f.path);
		dropTarget(row, f.path);
		item.append(row, renderFolder(f));
		list.append(item);
	}
	const notes = [...node.notes].sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path)));
	for (const n of notes) {
		const row = el(
			"a",
			{
				class: "row note" + (state.current?.path === n.path ? " current" : ""),
				href: hashFor(n.path),
				title: n.path,
			},
			el("span", { class: "name" }, nameOf(n.path)),
		);
		draggable(row, n.path);
		list.append(el("li", {}, row));
	}
	return list;
}

function renderTree() {
	const tree = $("tree");
	const root = buildTree();
	const list = renderFolder(root);
	if (!list.children.length) {
		tree.replaceChildren(el("p", { class: "hint" }, "No notes yet."));
	} else {
		tree.replaceChildren(list);
	}
	// Dropping on empty space moves to the top level.
	tree.ondragover = (e) => {
		if (e.target === tree && e.dataTransfer.types.includes("text/x-wiki-path")) e.preventDefault();
	};
	tree.ondrop = (e) => {
		if (e.target !== tree) return;
		e.preventDefault();
		const from = e.dataTransfer.getData("text/x-wiki-path");
		if (from && parentOf(from)) moveTo(from, nameOf(from));
	};
}

function toggleFolder(path) {
	if (state.open.has(path)) state.open.delete(path);
	else state.open.add(path);
	store("open", JSON.stringify([...state.open]));
	renderTree();
}

function revealInTree(path) {
	let changed = false;
	for (let p = parentOf(path); p; p = parentOf(p)) {
		if (!state.open.has(p)) {
			state.open.add(p);
			changed = true;
		}
	}
	if (changed) store("open", JSON.stringify([...state.open]));
}

// Markdown

// [[Note]] and [[Folder/Note|label]] link to other notes. A bare name finds the
// note with that name anywhere, preferring the shallowest.
function resolveLink(target) {
	const exact = state.notes.find((n) => n.path === target);
	if (exact) return exact.path;
	const lower = target.toLowerCase();
	const byName = state.notes
		.filter((n) => n.path.toLowerCase() === lower || n.path.toLowerCase().endsWith("/" + lower))
		.sort((a, b) => a.path.split("/").length - b.path.split("/").length);
	return byName[0]?.path ?? null;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

marked.use({
	gfm: true,
	extensions: [
		{
			name: "wikilink",
			level: "inline",
			start: (src) => src.indexOf("[["),
			tokenizer(src) {
				const m = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
				if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), label: (m[2] ?? m[1]).trim() };
			},
			renderer(token) {
				const found = resolveLink(token.target);
				const href = hashFor(found ?? token.target);
				const cls = found ? "wikilink" : "wikilink missing";
				return `<a href="${escapeHtml(href)}" class="${cls}">${escapeHtml(token.label)}</a>`;
			},
		},
	],
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
	if (node.tagName === "A" && /^https?:/i.test(node.getAttribute("href") ?? "")) {
		node.setAttribute("target", "_blank");
		node.setAttribute("rel", "noopener noreferrer");
	}
});

function renderPreview() {
	const html = DOMPurify.sanitize(marked.parse($("editor").value));
	$("preview").innerHTML = html;
}

// Open note

function showEmpty() {
	state.current = null;
	state.dirty = false;
	document.title = "notes · audrey.rocks";
	for (const id of ["title", "editor", "preview", "conflict"]) $(id).hidden = true;
	for (const id of ["rename", "delete"]) $(id).hidden = true;
	$("crumbs").replaceChildren();
	$("empty").hidden = false;
	setStatus("");
	setModeLine();
	renderTree();
}

function applyMode() {
	const reading = state.mode === "read";
	$("mode-edit").setAttribute("aria-pressed", String(!reading));
	$("mode-read").setAttribute("aria-pressed", String(reading));
	setModeLine();
	if (!state.current) return;
	$("editor").hidden = reading;
	$("preview").hidden = !reading;
	if (reading) renderPreview();
}

function setMode(mode) {
	state.mode = mode;
	store("mode", mode);
	applyMode();
	if (mode === "edit" && state.current) $("editor").focus();
}

function showNote(note) {
	state.current = { path: note.path, version: note.version, saved: note.content };
	state.dirty = false;
	state.conflict = false;
	document.title = `${nameOf(note.path)} · notes`;
	$("empty").hidden = true;
	$("conflict").hidden = true;
	for (const id of ["title", "rename", "delete"]) $(id).hidden = false;
	$("title").value = nameOf(note.path);
	$("editor").value = note.content;
	$("crumbs").replaceChildren(parentOf(note.path) ? parentOf(note.path).split("/").join(" / ") : "");
	setStatus("");
	applyMode();
	revealInTree(note.path);
	renderTree();
}

async function openPath(path) {
	await flushSave();
	if (!path) return showEmpty();
	try {
		showNote(await api("GET", "/notes/api/note?path=" + encodeURIComponent(path)));
	} catch (err) {
		if (err.status === 400) {
			setStatus("");
			showEmpty();
			$("empty").querySelector("p").textContent = `There's no note at ${path}.`;
			return;
		}
		fail(err);
	}
	$("sidebar").classList.remove("open");
}

// Saving

let saveTimer = 0;

function scheduleSave() {
	state.dirty = true;
	setStatus("Edited");
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, SAVE_DELAY);
}

async function save() {
	clearTimeout(saveTimer);
	if (state.saving) await state.saving;
	const note = state.current;
	if (!note || !state.dirty || state.conflict) return;
	const content = $("editor").value;
	state.dirty = false;
	setStatus("Saving…");
	state.saving = api("PUT", "/notes/api/note", { path: note.path, content, if_version: note.version })
		.then((saved) => {
			note.version = saved.version;
			note.saved = content;
			const meta = state.notes.find((n) => n.path === note.path);
			if (meta) Object.assign(meta, { version: saved.version, size: saved.size, updated_at: saved.updated_at });
			if (!state.dirty) setStatus("Saved");
			loadMe();
		})
		.catch((err) => {
			state.dirty = true;
			if (/changed since version|changed while saving/.test(err.message)) {
				state.conflict = true;
				$("conflict").hidden = false;
				setStatus("Not saved");
			} else {
				setStatus("Not saved");
				console.error(err);
			}
		})
		.finally(() => {
			state.saving = null;
		});
	await state.saving;
}

async function flushSave() {
	if (state.dirty && !state.conflict) await save();
	else if (state.saving) await state.saving;
}

async function resolveConflict(keepMine) {
	const note = state.current;
	const latest = await api("GET", "/notes/api/note?path=" + encodeURIComponent(note.path));
	state.conflict = false;
	$("conflict").hidden = true;
	if (keepMine) {
		note.version = latest.version;
		state.dirty = true;
		await save();
	} else {
		showNote(latest);
	}
}

// Notes coming back into view may have been changed by an agent.
async function refresh() {
	if (document.hidden) return;
	await loadTree().catch(() => {});
	const note = state.current;
	if (!note || state.dirty || state.saving || state.conflict) return;
	const meta = state.notes.find((n) => n.path === note.path);
	if (meta && meta.version !== note.version) {
		const latest = await api("GET", "/notes/api/note?path=" + encodeURIComponent(note.path)).catch(() => null);
		if (latest && !state.dirty) {
			const pos = $("editor").selectionStart;
			showNote(latest);
			$("editor").setSelectionRange(pos, pos);
		}
	}
}

// Actions

function currentFolder() {
	return state.current ? parentOf(state.current.path) : "";
}

async function newNote(folder = currentFolder()) {
	const name = prompt(folder ? `New note in ${folder}:` : "New note:", "Untitled");
	if (!name?.trim()) return;
	const path = join(folder, name.trim().replace(/^\/+|\/+$/g, ""));
	if (!state.notes.some((n) => n.path === path)) {
		try {
			await api("PUT", "/notes/api/note", { path, content: "" });
			await loadTree();
		} catch (err) {
			return fail(err);
		}
	}
	setMode("edit");
	location.hash = hashFor(path);
}

async function newFolder(parent = currentFolder()) {
	const name = prompt(parent ? `New folder in ${parent}:` : "New folder:");
	if (!name?.trim()) return;
	const path = join(parent, name.trim().replace(/^\/+|\/+$/g, ""));
	try {
		await api("POST", "/notes/api/folder", { path });
		state.open.add(path);
		revealInTree(path);
		store("open", JSON.stringify([...state.open]));
		await loadTree();
	} catch (err) {
		fail(err);
	}
}

async function moveTo(from, to) {
	if (!to || to === from) return;
	await flushSave();
	try {
		const moved = await api("POST", "/notes/api/move", { from, to });
		// Keep folders open under their new names.
		for (const p of [...state.open]) {
			if (p === from || p.startsWith(from + "/")) {
				state.open.delete(p);
				state.open.add(moved.to + p.slice(from.length));
			}
		}
		store("open", JSON.stringify([...state.open]));
		await loadTree();
		const cur = state.current?.path;
		if (cur && (cur === from || cur.startsWith(from + "/"))) {
			const next = moved.to + cur.slice(from.length);
			state.current.path = next;
			history.replaceState(null, "", hashFor(next));
			await openPath(next);
		}
	} catch (err) {
		fail(err);
	}
}

function renamePrompt(path) {
	const to = prompt("Rename or move to (use / for folders):", path);
	if (to?.trim()) moveTo(path, to.trim());
}

async function deletePath(path, isFolder) {
	const what = isFolder ? `the folder "${path}" and everything in it` : `"${path}"`;
	if (!confirm(`Delete ${what}? This can't be undone.`)) return;
	try {
		await api("POST", "/notes/api/delete", { path, recursive: isFolder });
		if (state.current && (state.current.path === path || state.current.path.startsWith(path + "/"))) {
			state.dirty = false;
			state.current = null;
			history.replaceState(null, "", "#/");
			showEmpty();
		}
		await loadTree();
	} catch (err) {
		fail(err);
	}
}

// Search

let searchTimer = 0;

function highlight(text, words) {
	const out = [];
	const lower = text.toLowerCase();
	let i = 0;
	while (i < text.length) {
		let hit = null;
		for (const w of words) {
			const at = lower.indexOf(w, i);
			if (at !== -1 && (!hit || at < hit.at)) hit = { at, len: w.length };
		}
		if (!hit) break;
		out.push(text.slice(i, hit.at), el("mark", {}, text.slice(hit.at, hit.at + hit.len)));
		i = hit.at + hit.len;
	}
	out.push(text.slice(i));
	return out;
}

async function runSearch() {
	const q = $("search").value.trim();
	if (!q) {
		$("results").hidden = true;
		$("tree").hidden = false;
		return;
	}
	const words = q.toLowerCase().split(/\s+/);
	try {
		const { results } = await api("GET", "/notes/api/search?q=" + encodeURIComponent(q));
		if (q !== $("search").value.trim()) return;
		$("results").replaceChildren(
			...(results.length
				? results.map((r) =>
						el(
							"li",
							{},
							el(
								"a",
								{ href: hashFor(r.path) },
								el("span", {}, highlight(r.path, words)),
								r.matches[0] && el("span", { class: "snip" }, highlight(r.matches[0].text.trim(), words)),
							),
						),
					)
				: [el("li", { class: "hint" }, "No matches.")]),
		);
		$("tree").hidden = true;
		$("results").hidden = false;
	} catch (err) {
		console.error(err);
	}
}

// Wiring

$("editor").addEventListener("input", scheduleSave);
$("editor").addEventListener("keydown", (e) => {
	if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
		e.preventDefault();
		document.execCommand("insertText", false, "\t");
	}
});
$("title").addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		e.preventDefault();
		$("editor").focus();
	}
	if (e.key === "Escape") {
		$("title").value = nameOf(state.current?.path ?? "");
		$("editor").focus();
	}
});
$("title").addEventListener("change", () => {
	const name = $("title").value.trim().replace(/\//g, "-");
	if (!state.current || !name || name === nameOf(state.current.path)) {
		$("title").value = nameOf(state.current?.path ?? "");
		return;
	}
	moveTo(state.current.path, join(parentOf(state.current.path), name));
});

$("mode-edit").onclick = () => setMode("edit");
$("mode-read").onclick = () => setMode("read");
$("rename").onclick = () => state.current && renamePrompt(state.current.path);
$("delete").onclick = () => state.current && deletePath(state.current.path, false);
$("new-note").onclick = () => newNote();
$("empty-new").onclick = () => newNote();
$("new-folder").onclick = () => newFolder();
$("conflict-reload").onclick = () => resolveConflict(false).catch(fail);
$("conflict-keep").onclick = () => resolveConflict(true).catch(fail);
$("toggle-sidebar").onclick = () => $("sidebar").classList.toggle("open");
$("main").addEventListener("click", (e) => {
	if (!e.target.closest("#toggle-sidebar")) $("sidebar").classList.remove("open");
});

$("search").addEventListener("input", () => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(runSearch, 200);
});
$("search").addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		$("search").value = "";
		runSearch();
	}
	if (e.key === "Enter") $("results").querySelector("a")?.click();
});

document.addEventListener("keydown", (e) => {
	const mod = e.metaKey || e.ctrlKey;
	if (mod && e.key === "s") {
		e.preventDefault();
		save();
	}
	if (mod && e.key === "e" && state.current) {
		e.preventDefault();
		setMode(state.mode === "edit" ? "read" : "edit");
	}
	if (mod && e.key === "k") {
		e.preventDefault();
		$("sidebar").classList.add("open");
		$("search").focus();
		$("search").select();
	}
});

// Clicking a [[link]] to a note that doesn't exist yet creates it.
$("preview").addEventListener("click", async (e) => {
	const link = e.target.closest("a.wikilink.missing");
	if (!link) return;
	e.preventDefault();
	const target = link
		.getAttribute("href")
		.replace(/^#\//, "")
		.split("/")
		.map(decodeURIComponent)
		.join("/");
	if (!confirm(`Create "${target}"?`)) return;
	try {
		await api("PUT", "/notes/api/note", { path: target, content: "" });
		await loadTree();
		setMode("edit");
		location.hash = hashFor(target);
	} catch (err) {
		fail(err);
	}
});

window.addEventListener("hashchange", () => openPath(pathFromHash()));
window.addEventListener("beforeunload", (e) => {
	if (state.dirty) e.preventDefault();
});
document.addEventListener("visibilitychange", refresh);
window.addEventListener("focus", refresh);

loadMe();
loadTree()
	.then(() => openPath(pathFromHash()))
	.catch(fail);
