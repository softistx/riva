import { type Ctx, type Entry, peek, unreadable } from './query-entry';

/**
 * The 1000 ms an entry stays fresh when no `staleTime` is set: what an entry
 * `hydrate` seeded gets after its seeding, and the floor a Suspense mount
 * trusts. @internal
 */
export const FRESH_FLOOR_MS = 1000;

/** Whether `hydrate` seeded the entry's current data less than `FRESH_FLOOR_MS` ago. */
const freshlySeeded = (c: Ctx, e: Entry): boolean =>
	!!e.seeded &&
	e.seeded.u === peek(c, e).updatedAt &&
	c.sched.now() - e.seeded.t < FRESH_FLOOR_MS;

/**
 * Whether the entry must be fetched: not a success, invalidated, or older than
 * `staleTime` (the call's, the definition's, the riva's default), and never
 * younger than `minFresh` (an internal floor, Suspense's). With no `staleTime`
 * set, an entry `hydrate` seeded stays fresh for `FRESH_FLOOR_MS` after its
 * seeding, so a hydrated page does not refetch on mount.
 */
export const stale = (
	c: Ctx,
	e: Entry,
	staleTime?: number,
	minFresh = 0,
): boolean => {
	const st = staleTime ?? e.def.options.staleTime ?? c.riva.staleTimeSet;
	const age = c.sched.now() - peek(c, e).updatedAt;
	return (
		peek(c, e).status !== 'success' ||
		!!e.invalidated ||
		(st === undefined
			? !freshlySeeded(c, e) && age >= minFresh
			: age >= Math.max(st, minFresh)) ||
		unreadable(c, e)
	);
};
