import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { RivaError } from '../errors';
import { query } from '../query';
import { signal } from '../signal';
import { resource } from './resource';

const tick = () => new Promise<void>((r) => setImmediate(r));
const g = globalThis as { document?: unknown };

beforeEach(() => {
	g.document = {};
});
afterEach(() => {
	delete g.document;
});

/** A query that records its calls and settles them by hand. */
function setup() {
	const calls: Array<{
		n: number;
		ok: (v: string) => void;
		no: (e: unknown) => void;
	}> = [];
	const q = query<{ n: number }, string>({
		id: 'q',
		retry: 0,
		fetch: ({ n }) =>
			new Promise((ok, no) => {
				calls.push({ n, ok, no });
			}),
	});
	return { q, calls, riva: createRiva() };
}

describe('state', () => {
	test('idle while disabled: the source is not called and nothing is fetched', async () => {
		const { q, calls, riva } = setup();
		const on = signal(false);
		let sourced = 0;
		const r = resource(
			riva,
			() => {
				sourced++;
				return [q, { n: 1 }] as const;
			},
			{ enabled: () => riva.get(on) },
		);
		const seen: string[] = [];
		const off = r.subscribe((s) => seen.push(s.status));
		expect(r.state.status).toBe('idle');
		await tick();
		expect(sourced).toBe(0);
		expect(calls).toHaveLength(0);
		riva.set(on, true);
		expect(calls).toHaveLength(1);
		expect(r.state).toMatchObject({ status: 'loading', isFetching: true });
		calls[0]?.ok('one');
		await tick();
		expect(r.state).toMatchObject({
			status: 'success',
			data: 'one',
			placeholder: false,
		});
		riva.set(on, false);
		expect(r.state.status).toBe('idle');
		expect(seen).toEqual(['loading', 'success', 'idle']);
		off();
	});

	test('a boolean enabled false never fetches', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const, { enabled: false });
		const off = r.subscribe(() => {});
		await tick();
		expect(calls).toHaveLength(0);
		expect(r.state.status).toBe('idle');
		off();
	});

	test('tracked variables: a change refetches under the new key and releases the old', async () => {
		const { q, calls, riva } = setup();
		const n = signal(1);
		const r = resource(riva, () => [q, { n: riva.get(n) }] as const);
		const off = r.subscribe(() => {});
		expect(calls.map((c) => c.n)).toEqual([1]);
		calls[0]?.ok('a');
		await tick();
		riva.set(n, 2);
		expect(calls.map((c) => c.n)).toEqual([1, 2]);
		calls[1]?.ok('b');
		await tick();
		expect(r.state).toMatchObject({ status: 'success', data: 'b' });
		off();
	});

	test('keepPrevious shows the previous data as a placeholder', async () => {
		const { q, calls, riva } = setup();
		const n = signal(1);
		const r = resource(riva, () => [q, { n: riva.get(n) }] as const);
		const off = r.subscribe(() => {});
		calls[0]?.ok('a');
		await tick();
		riva.set(n, 2);
		expect(r.state).toMatchObject({
			status: 'success',
			data: 'a',
			placeholder: true,
			isFetching: true,
		});
		calls[1]?.ok('b');
		await tick();
		expect(r.state).toMatchObject({
			data: 'b',
			placeholder: false,
			isFetching: false,
		});
		off();
	});

	test('keepPrevious false goes back to loading on a new key', async () => {
		const { q, calls, riva } = setup();
		const n = signal(1);
		const r = resource(riva, () => [q, { n: riva.get(n) }] as const, {
			keepPrevious: false,
		});
		const off = r.subscribe(() => {});
		calls[0]?.ok('a');
		await tick();
		riva.set(n, 2);
		expect(r.state).toMatchObject({ status: 'loading', data: undefined });
		off();
	});

	test('a failure is the error state', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const off = r.subscribe(() => {});
		const boom = new Error('boom');
		calls[0]?.no(boom);
		await tick();
		expect(r.state).toMatchObject({
			status: 'error',
			error: boom,
			isFetching: false,
		});
		off();
	});

	test('a fresh cached entry is a success at once', async () => {
		const { q, riva } = setup();
		q.setData(riva, { n: 1 }, 'cached');
		const r = resource(riva, () => [q, { n: 1 }] as const, { staleTime: '1h' });
		expect(r.state).toMatchObject({ status: 'success', data: 'cached' });
	});
});

describe('lazy', () => {
	test('nothing is fetched before a reader, and the last unsubscribe stops observing', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		expect(r.state.status).toBe('loading'); // an untracked read never starts a fetch
		await tick();
		expect(calls).toHaveLength(0);
		const a = r.subscribe(() => {});
		const b = r.subscribe(() => {});
		expect(calls).toHaveLength(1);
		a();
		b();
		// observers are gone: the in-flight fetch was abandoned
		riva.queries.invalidate(q, { n: 1 });
		expect(calls).toHaveLength(1);
	});

	test('an observed computed reader starts the fetch', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const label = computed(() => r.state.status);
		const seen: string[] = [];
		const off = riva.subscribe(label, (s) => seen.push(s));
		await tick();
		expect(calls).toHaveLength(1);
		calls[0]?.ok('x');
		await tick();
		expect(seen).toEqual(['success']);
		off();
	});

	test('an effect reads the state and re-runs', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const seen: string[] = [];
		const stop = riva.effect(() => {
			seen.push(r.state.status);
		});
		await tick();
		calls[0]?.ok('x');
		await tick();
		expect(seen).toEqual(['loading', 'loading', 'success']);
		stop();
	});

	test('a dropped computed reader stops the observation at the next change', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const label = computed(() => r.state.status);
		const off = riva.subscribe(label, () => {});
		await tick();
		off();
		calls[0]?.ok('x');
		await tick();
		riva.queries.invalidate(q, { n: 1 });
		expect(calls).toHaveLength(1); // not observed any more: no refetch
	});

	test('on the server nothing is observed', async () => {
		delete g.document;
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const off = r.subscribe(() => {});
		await tick();
		expect(calls).toHaveLength(0);
		off();
	});
});

describe('await', () => {
	test('resolves with the data, one load shared with the cache', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 3 }] as const);
		const p = Promise.resolve(r);
		await tick();
		calls[0]?.ok('three');
		expect(await p).toBe('three');
		expect(calls).toHaveLength(1);
	});

	test('rejects with the error', async () => {
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const p = Promise.resolve(r);
		await tick();
		calls[0]?.no(new Error('nope'));
		await expect(p).rejects.toThrow('nope');
	});

	test('rejects with a RivaError while disabled', async () => {
		const { q, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const, { enabled: false });
		const err = await Promise.resolve(r).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(RivaError);
		expect((err as RivaError).code).toBe('RIVA_DEFINITION');
	});

	test('works on the server, one-shot, and the state then reads the cache', async () => {
		delete g.document;
		const { q, calls, riva } = setup();
		const r = resource(riva, () => [q, { n: 1 }] as const);
		const p = Promise.resolve(r);
		await tick();
		calls[0]?.ok('s');
		expect(await p).toBe('s');
		expect(r.state).toMatchObject({ status: 'success', data: 's' });
	});
});

test('two rivas keep their own states', async () => {
	const { q, calls, riva } = setup();
	const other = createRiva();
	const a = resource(riva, () => [q, { n: 1 }] as const);
	const b = resource(other, () => [q, { n: 1 }] as const);
	const offA = a.subscribe(() => {});
	const offB = b.subscribe(() => {});
	expect(calls).toHaveLength(2);
	calls[0]?.ok('A');
	await tick();
	expect(a.state).toMatchObject({ status: 'success', data: 'A' });
	expect(b.state.status).toBe('loading');
	offA();
	offB();
});
