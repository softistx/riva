import type { RivaClient } from './client';
import { RivaAbortError } from './errors';
import type { MutationOptions, RunOptions } from './mutation';
import type { Lay } from './query-entry';
import { raceAbort, retryDelay, shouldRetry, sleep } from './retry';

const SEQ = {};

/** The optimistic data and the server result, in the order mutations started. */
export async function execute<Vars, Data>(
	client: RivaClient,
	o: MutationOptions<Vars, Data>,
	vars: Vars,
	opts?: RunOptions,
): Promise<Data> {
	const signal = opts?.signal ?? new AbortController().signal;
	if (signal.aborted) throw new RivaAbortError();
	const drops: Array<() => void> = [];
	const drop = () =>
		client.batch(() => {
			for (const d of drops.splice(0)) d();
		});
	// Settles only once the mutations started before this one have settled.
	const before =
		(client.slots.get(SEQ) as Promise<unknown>) ?? Promise.resolve();
	let settled!: () => void;
	client.slots.set(
		SEQ,
		Promise.all([before, new Promise<void>((r) => (settled = r))]),
	);
	try {
		client.batch(() => {
			const out = o.optimistic?.(vars, {
				set: (q, v, d) =>
					drops.push(
						client.queries.lay(
							q,
							v,
							typeof d === 'function' ? (d as Lay) : () => d,
						),
					),
			});
			if (out !== undefined && o.cache?.layer)
				drops.push(o.cache.layer(client, out).drop);
		});
		let data: Data;
		for (let failures = 0; ; ) {
			try {
				data = await raceAbort(o.run(vars, { signal, client }), signal);
				break;
			} catch (x) {
				if (!shouldRetry(o.retry ?? 0, failures, x)) throw x;
				const ms = retryDelay(o.retryDelay, failures++);
				await sleep(client.queries.sched, ms, signal);
				if (signal.aborted) throw new RivaAbortError();
			}
		}
		// A throw here rolls back like a failed run.
		const inv =
			typeof o.invalidates === 'function'
				? o.invalidates(data, vars)
				: (o.invalidates ?? []);
		await raceAbort(before, signal);
		if (signal.aborted) throw new RivaAbortError();
		let bad: { e: unknown } | undefined;
		client.batch(() => {
			o.cache?.commit?.(client, data);
			drop();
			// The server committed: a throwing helper keeps it and still invalidates.
			try {
				o.updates?.({ set: (q, v, d) => q.setData(client, v, d) }, data, vars);
			} catch (e) {
				bad = { e };
			}
			for (const t of inv)
				if ('query' in t) t.query.invalidate(client, t.vars);
				else t.invalidate(client);
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
