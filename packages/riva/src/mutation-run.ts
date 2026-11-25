import type { Riva } from './client';
import { RivaAbortError } from './errors';
import type { MutationOptions, RunOptions } from './mutation';
import type { Lay } from './query-entry';
import { raceAbort, withRetry } from './retry';

const SEQ = {};

/** The optimistic data and the server result, in the order mutations started. */
export async function execute<Vars, Data>(
	riva: Riva,
	o: MutationOptions<Vars, Data>,
	vars: Vars,
	opts?: RunOptions,
): Promise<Data> {
	const signal = opts?.signal ?? new AbortController().signal;
	if (signal.aborted) throw new RivaAbortError();
	const drops: Array<() => void> = [];
	const drop = () =>
		riva.batch(() => {
			for (const d of drops.splice(0)) d();
		});
	// Settles only once the mutations started before this one have settled.
	const before = (riva.slots.get(SEQ) as Promise<unknown>) ?? Promise.resolve();
	let settled!: () => void;
	riva.slots.set(
		SEQ,
		Promise.all([before, new Promise<void>((r) => (settled = r))]),
	);
	try {
		riva.batch(() => {
			const out = o.optimistic?.(vars, {
				set: (q, v, d) =>
					drops.push(
						riva.queries.lay(
							q,
							v,
							typeof d === 'function' ? (d as Lay) : () => d,
						),
					),
			});
			if (out !== undefined && o.cache?.layer)
				drops.push(o.cache.layer(riva, out, vars).drop);
		});
		const data = await withRetry(
			riva.queries.sched,
			{ retry: o.retry ?? 0, retryDelay: o.retryDelay },
			signal,
			() => o.run(vars, { signal, riva }),
		);
		// A throw here rolls back like a failed run.
		const inv =
			typeof o.invalidates === 'function'
				? o.invalidates(data, vars)
				: (o.invalidates ?? []);
		await raceAbort(before, signal);
		if (signal.aborted) throw new RivaAbortError();
		let bad: { e: unknown } | undefined;
		riva.batch(() => {
			o.cache?.commit?.(riva, data, vars);
			drop();
			// The server committed: a throwing helper keeps it and still invalidates.
			try {
				o.updates?.({ set: (q, v, d) => q.setData(riva, v, d) }, data, vars);
			} catch (e) {
				bad = { e };
			}
			for (const t of inv)
				if ('query' in t) t.query.invalidate(riva, t.vars);
				else t.invalidate(riva);
		});
		if (bad) throw bad.e;
		return data;
	} catch (x) {
		drop();
		throw x;
	} finally {
		settled();
	}
}
