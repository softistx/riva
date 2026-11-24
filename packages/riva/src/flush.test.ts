import { expect, test } from 'bun:test';
import { atom } from './atom';
import { createRivaClient } from './client';
import { computed } from './computed';
import { RivaError } from './errors';
import { collect } from './flush';
import { nodeOf, subscribe } from './graph';

test('listeners run in their own client, not the ambient one', () => {
	const x = atom(0);
	const a = createRivaClient();
	const b = createRivaClient();
	b.set(x, 99);
	const seen: number[] = [];
	a.subscribe(x, () => seen.push(x.get()));
	b.run(() => a.set(x, 1));
	expect(seen).toEqual([1]);
});

test('an effect cleanup disposed under another client runs in its own', () => {
	const x = atom(0);
	const a = createRivaClient();
	const b = createRivaClient();
	b.set(x, 99);
	const seen: number[] = [];
	const stop = a.effect(() => () => {
		seen.push(x.get());
	});
	b.run(stop);
	expect(seen).toEqual([0]);
});

test('a self-incrementing effect converges up to its bound', () => {
	const x = atom(0);
	const c = createRivaClient();
	c.effect(() => {
		const v = c.get(x);
		if (v < 5) c.set(x, v + 1);
	});
	expect(c.get(x)).toBe(5);
});

test('an unbounded effect throws RIVA_LOOP and leaves no stuck state', () => {
	const on = atom(false);
	const x = atom(0);
	const c = createRivaClient();
	c.effect(() => {
		if (c.get(on)) c.set(x, c.get(x) + 1);
	});
	let thrown: unknown;
	try {
		c.set(on, true);
	} catch (e) {
		thrown = e;
	}
	expect((thrown as RivaError).code).toBe('RIVA_LOOP');
	expect(c.graph.flushing).toBe(false);
	expect(c.graph.depth).toBe(0);
	const seen: number[] = [];
	c.subscribe(x, (v) => seen.push(v));
	c.set(on, false);
	c.set(x, -1);
	expect(seen).toEqual([-1]);
});

test('an unbounded effect at creation throws and is disposed', () => {
	const x = atom(0);
	const c = createRivaClient();
	expect(() => c.effect(() => c.set(x, c.get(x) + 1))).toThrow(RivaError);
	expect(nodeOf(c.graph, x).observers.size).toBe(0);
});

test('stacked diamonds notify once and collect each node once', () => {
	const a = atom(0);
	let top = computed((get) => get(a));
	for (let i = 0; i < 30; i++) {
		const prev = top;
		const l = computed((get) => get(prev) + 1);
		const r = computed((get) => get(prev) + 2);
		top = computed((get) => get(l) + get(r));
	}
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(top, (v) => seen.push(v));
	const start = performance.now();
	c.set(a, 1);
	expect(performance.now() - start).toBeLessThan(500);
	expect(seen.length).toBe(1);
	c.graph.pending.clear();
	subscribe(c.graph, top, () => {});
	const an = nodeOf(c.graph, a);
	collect(c.graph, an);
	expect(c.graph.pending.size).toBe(1);
});
