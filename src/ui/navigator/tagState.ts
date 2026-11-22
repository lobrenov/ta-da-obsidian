import type { Tag } from "../../core/model/tag";
import { identityKey } from "../../core/text";
import type { Domain } from "./domain";

/** The navigator state kept by tag path. */
export interface TagState {
	/** The list pane's domain. */
	domain: Domain;
	/** The tags picked in each list's filter, by the list's `domainKey`. */
	picked: ReadonlyMap<string, ReadonlySet<string>>;
	/** Folded section ids; those of a tag page start with its `domainKey`. */
	folds: ReadonlySet<string>;
	/** Open tag rows, by id (`tag:<path>`). */
	expanded: ReadonlySet<string>;
}

/** Whether the navigator's state follows a rename or delete: every carrier was written, or only the case changed. */
export function followsEdit(tag: Tag, to: Tag | null, failed: number): boolean {
	return failed === 0 || to?.path === tag.path;
}

/**
 * The state after `from` is renamed to `to`, or deleted when `to` is null: every tag path at or under `from` follows
 * the rename, or is dropped. A domain that was a dropped tag becomes null, for the caller to replace.
 */
export function followTag(state: TagState, from: Tag, to: Tag | null): { state: Omit<TagState, "domain">; domain: Domain | null } {
	const fromSegments = from.path.split("/");
	/** The name with its `from` prefix replaced by `to`'s; null when deleted; unchanged when it isn't at or under `from`. */
	const follow = (name: string): string | null => {
		const segments = name.split("/");
		if (segments.length < fromSegments.length || !fromSegments.every((segment, at) => identityKey(segments[at] as string) === segment)) return name;
		return to === null ? null : [to.name, ...segments.slice(fromSegments.length)].join("/");
	};
	const followPath = (path: string): string | null => {
		const next = follow(path);
		return next === null || next === path ? next : identityKey(next);
	};
	/** An id or key made of a prefix, a tag path, and what follows the path (a `|` section name, or nothing). */
	const followId = (id: string): string | null => {
		const rest = id.startsWith("tag:") ? id.slice("tag:".length) : null;
		if (rest === null) return id;
		const bar = rest.indexOf("|");
		const path = bar < 0 ? rest : rest.slice(0, bar);
		const next = followPath(path);
		return next === null ? null : `tag:${next}${bar < 0 ? "" : rest.slice(bar)}`;
	};
	/** A group's fold id, `<list>|Tag: #<name>`, follows too. */
	const followFold = (id: string): string | null => {
		const marker = "|Tag: #";
		const at = id.indexOf(marker);
		if (at >= 0) {
			const next = follow(id.slice(at + marker.length));
			if (next === null) return null;
			return followId(`${id.slice(0, at)}${marker}${next}`);
		}
		return followId(id);
	};
	const picked = new Map<string, Set<string>>();
	for (const [key, paths] of state.picked) {
		const nextKey = followId(key);
		if (nextKey === null) continue;
		const next = new Set<string>();
		for (const path of paths) {
			const followed = path === "" ? path : followPath(path);
			if (followed !== null) next.add(followed);
		}
		picked.set(nextKey, new Set([...(picked.get(nextKey) ?? []), ...next]));
	}
	const keep = (ids: ReadonlySet<string>, change: (id: string) => string | null): Set<string> =>
		new Set([...ids].flatMap((id) => change(id) ?? []));
	let domain: Domain | null = state.domain;
	if (domain.kind === "tag" && domain.path !== null) {
		const path = followPath(domain.path);
		domain = path === null ? null : { kind: "tag", path };
	}
	return {
		state: { picked, folds: keep(state.folds, followFold), expanded: keep(state.expanded, followId) },
		domain,
	};
}
