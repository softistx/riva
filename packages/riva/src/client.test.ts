import { expect, test } from 'bun:test';
import { createRiva, Riva } from './client';
import { computed } from './computed';
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
