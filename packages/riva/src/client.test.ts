import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva, Riva, type RivaExtension } from './client';
import { computed } from './computed';
import { RivaError } from './errors';
import { query } from './query';
import { signal } from './signal';

test('createRiva returns a Riva', () => {
	expect(createRiva()).toBeInstanceOf(Riva);
});

test('get, set and subscribe', () => {
	const a = signal(1);
	const d = computed((get) => get(a) + 1);
	const c = createRiva();
	const seen: number[] = [];
	const off = c.subscribe(d, (v) => seen.push(v));
	c.set(a, 2);
	c.set(a, (p) => p * 2);
	off();
	c.set(a, 9);
	expect(seen).toEqual([3, 5]);
	expect(c.get(d)).toBe(10);
});

test('effect re-runs, cleans up and disposes', () => {
	const a = signal(0);
	const c = createRiva();
	const log: string[] = [];
	const stop = c.effect(() => {
		const v = c.get(a);
		log.push(`run ${v}`);
		return () => log.push(`clean ${v}`);
	});
	c.set(a, 1);
	stop();
	expect(log).toEqual(['run 0', 'clean 0', 'run 1', 'clean 1']);
});

test('run, batch and untracked', () => {
	const a = signal(0);
	const b = signal(0);
	const c = createRiva();
	const seen: number[] = [];
	c.subscribe(a, (v) => seen.push(v));
	expect(
		c.run(() => {
			a.set(1);
			return a.get();
		}),
	).toBe(1);
	c.batch(() => {
		c.set(a, 2);
		c.set(a, 3);
		expect(seen).toEqual([1]);
	});
	expect(seen).toEqual([1, 3]);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a) + c.untracked(() => c.get(b));
	});
	c.get(d);
	c.set(b, 5);
	c.get(d);
	expect(calls).toBe(1);
});

test('a throwing listener does not drop the others; the single error is rethrown as is', () => {
	const a = signal(0);
	const c = createRiva();
	const boom = new Error('boom');
	const seen: number[] = [];
	c.subscribe(a, () => {
		throw boom;
	});
	c.subscribe(a, (v) => seen.push(v));
	const other = signal(0);
	c.subscribe(other, (v) => seen.push(v + 100));
	let thrown: unknown;
	try {
		c.batch(() => {
			c.set(a, 1);
			c.set(other, 1);
		});
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBe(boom);
	expect(seen).toEqual([1, 101]);
	c.set(other, 2);
	expect(seen).toEqual([1, 101, 102]);
});

test('several errors become an AggregateError, and a throwing effect is isolated', () => {
	const a = signal(0);
	const c = createRiva();
	const seen: number[] = [];
	c.subscribe(a, () => {
		throw new Error('one');
	});
	c.subscribe(a, () => {
		throw new Error('two');
	});
	c.subscribe(a, (v) => seen.push(v));
	let thrown: unknown;
	try {
		c.set(a, 1);
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBeInstanceOf(AggregateError);
	expect((thrown as Error).message).toBe(
		'Several listeners or computeds threw.',
	);
	expect(
		(thrown as AggregateError).errors.map((e: Error) => e.message),
	).toEqual(['one', 'two']);
	expect(seen).toEqual([1]);

	const b = signal(0);
	const runs: number[] = [];
	c.effect(() => {
		if (c.get(b) === 1) throw new Error('fx');
		runs.push(c.get(b));
	});
	c.subscribe(b, (v) => seen.push(v));
	expect(() => c.set(b, 1)).toThrow('fx');
	expect(seen).toEqual([1, 1]);
	c.set(b, 2);
	expect(runs).toEqual([0, 2]);
});

const clock = () => {
	let t = 0;
	return {
		now: () => t,
		advance(ms: number) {
			t += ms;
		},
		setTimeout: () => 0,
		clearTimeout: () => {},
	};
};

test('an extension is installed once, with the riva, under its key', () => {
	const installs: Riva[] = [];
	const ext: RivaExtension<{ hello: string }> = {
		install(r) {
			installs.push(r);
			return { hello: 'hi' };
		},
	};
	const riva = createRiva({ greet: ext, other: ext });
	expect(riva.greet).toEqual({ hello: 'hi' });
	expect(riva.other.hello).toBe('hi');
	expect(installs).toEqual([riva, riva]);
	expect(riva).toBeInstanceOf(Riva);
});

test('a value without install is ignored, not installed', () => {
	const riva = createRiva({ plain: { a: 1 }, nothing: undefined } as never);
	expect('plain' in riva).toBe(false);
	expect('nothing' in riva).toBe(false);
});

test('a Riva member name cannot be an extension', () => {
	const ext = { install: () => 1 };
	for (const key of ['get', 'set', 'subscribe', 'run', 'queries', 'graph'])
		expect(() => createRiva({ [key]: ext } as never)).toThrow(RivaError);
	try {
		createRiva({ get: ext } as never);
	} catch (e) {
		expect((e as RivaError).code).toBe('RIVA_DEFINITION');
	}
});

test('defaults.staleTime applies when the definition sets none', async () => {
	const sched = clock();
	const riva = createRiva({
		scheduler: sched,
		events: { onFocus: () => () => {}, onReconnect: () => () => {} },
		defaults: { staleTime: '10s' },
	});
	let n = 0;
	const q = query({ id: 'q', fetch: async () => ++n });
	await q.ensure(riva);
	sched.advance(9_999);
	expect(await q.ensure(riva)).toBe(1);
	sched.advance(1);
	expect(await q.ensure(riva)).toBe(2);
});

test("a definition's own staleTime wins over defaults, even 0", async () => {
	const sched = clock();
	const riva = createRiva({
		scheduler: sched,
		defaults: { staleTime: Infinity },
	});
	let n = 0;
	const own = query({ id: 'own', staleTime: 0, fetch: async () => ++n });
	await own.ensure(riva);
	await own.ensure(riva);
	expect(n).toBe(2);
	const inherits = query({ id: 'inh', fetch: async () => ++n });
	await inherits.ensure(riva);
	sched.advance(10 ** 12);
	await inherits.ensure(riva);
	expect(n).toBe(3);
});

test('a subscribe staleTime still beats the default', async () => {
	const sched = clock();
	const riva = createRiva({
		scheduler: sched,
		defaults: { staleTime: Infinity },
	});
	let n = 0;
	const q = query({ id: 'q', fetch: async () => ++n });
	await q.ensure(riva);
	const off = riva.subscribe(q, undefined as never, () => {}, { staleTime: 0 });
	await new Promise((r) => setTimeout(r, 0));
	off();
	expect(n).toBe(2);
});

test('with no defaults a query is stale at once (built-in 0)', async () => {
	const riva = createRiva({ scheduler: clock() });
	let n = 0;
	const q = query({ id: 'q', fetch: async () => ++n });
	await q.ensure(riva);
	await q.ensure(riva);
	expect(n).toBe(2);
});

test('null and string option values are skipped', () => {
	const riva = createRiva({ a: null, b: 'text' } as never);
	expect('a' in riva).toBe(false);
	expect('b' in riva).toBe(false);
});

test('an install that throws propagates out of createRiva', () => {
	const boom = new Error('boom');
	expect(() =>
		createRiva({
			x: {
				install: () => {
					throw boom;
				},
			},
		}),
	).toThrow(boom);
});

test('a prototype name is reserved too', () => {
	expect(() => createRiva({ toString: { install: () => 1 } } as never)).toThrow(
		RivaError,
	);
});

test('extensions install in key order and see the earlier ones', () => {
	const riva = createRiva({
		a: { install: () => 1 },
		b: { install: (r: Riva) => (r as unknown as { a: number }).a + 1 },
	});
	expect(riva.b).toBe(2);
});

test('an ensure staleTime overrides the definition and the defaults for that call', async () => {
	const sched = clock();
	const riva = createRiva({ scheduler: sched, defaults: { staleTime: 0 } });
	let n = 0;
	const q = query({ id: 'q', staleTime: '1m', fetch: async () => ++n });
	await q.ensure(riva);
	sched.advance(5_000);
	expect(await q.ensure(riva)).toBe(1);
	expect(await q.ensure(riva, undefined, { staleTime: '5s' })).toBe(2);
	expect(await q.ensure(riva, undefined, { staleTime: 0 })).toBe(3);
	expect(await q.ensure(riva, undefined, { staleTime: Infinity })).toBe(3);
	expect(() => q.ensure(riva, undefined, { staleTime: 'x' as never })).toThrow(
		/Invalid duration/,
	);
});

test('a misspelt option is a type error, an extension is not', () => {
	// @ts-expect-error `default` is not an option (`defaults`): it would be an extension
	createRiva({ default: { staleTime: '30s' } });
	// @ts-expect-error a plain value under an unknown key is not an extension
	createRiva({ plain: { a: 1 } });
	const ext: RivaExtension<number> = { install: () => 1 };
	expectTypeOf(createRiva({ n: ext }).n).toEqualTypeOf<number>();
	expectTypeOf(
		createRiva({ defaults: { staleTime: '30s' } }),
	).toEqualTypeOf<Riva>();
});
