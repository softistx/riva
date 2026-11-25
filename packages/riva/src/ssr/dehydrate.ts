import type { RivaClient } from '../client';
import { RivaError, type RivaRequestError } from '../errors';
import { committed, peek } from '../query-entry';
import { encodeAt, ssrError } from './codec';

/** The error of a failed entry: what a client may act on, never a stack or a cause. */
export interface SnapshotError {
	code: string;
	message?: string | undefined;
	status?: number | undefined;
	retryable?: boolean | undefined;
}

export interface SnapshotEntry {
	/** The entry's key. */
	readonly k: string;
	readonly s: 'success' | 'error';
	/** The data, encoded. */
	readonly d?: unknown;
	readonly e?: SnapshotError | undefined;
	/** Its age in ms when dehydrated. */
	readonly u: number;
	/** Set when the entry was invalidated. */
	readonly i?: 1 | undefined;
}

/** What `dehydrate` makes: JSON-safe, to be handed to `hydrate` as is. */
export interface Snapshot {
	readonly v: 1;
	/** The clock of the dehydrating client, in ms. */
	readonly t: number;
	readonly q: readonly SnapshotEntry[];
	readonly a: Readonly<Record<string, unknown>>;
}

const errorOf = (e: unknown): SnapshotError => {
	const { code, message, status, retryable } = e as RivaRequestError;
	return e instanceof RivaError
		? { code, message, status, retryable }
		: { code: 'RIVA_UNKNOWN' };
};

/** The settled query entries and the changed named atoms of a client, as a JSON-safe snapshot. */
export function dehydrate(client: RivaClient): Snapshot {
	const c = client.queries.ctx;
	const now = c.sched.now();
	const q: SnapshotEntry[] = [];
	for (const e of c.entries.values()) {
		const s = peek(c, e);
		if (s.status !== 'success' && s.status !== 'error') continue;
		const data = committed(c, e);
		if (s.status === 'success' && data === undefined) continue;
		q.push({
			k: e.key,
			s: s.status,
			d: encodeAt(data, `${e.key}.data`),
			e: s.error === undefined ? undefined : errorOf(s.error),
			u: now - s.updatedAt,
			i: e.invalidated ? 1 : undefined,
		});
	}
	const a: Record<string, unknown> = {};
	for (const [name, n] of client.graph.named) {
		if (n === null)
			throw ssrError(
				`Cannot dehydrate: two atoms are named "${name}". Give each SSR atom a unique name, or set ssr: false.`,
			);
		if (n.value !== (n.def as { initial: unknown }).initial)
			a[name] = encodeAt(n.value, `atom "${name}"`);
	}
	return { v: 1, t: now, q, a };
}
