import { expect, test } from 'bun:test';
import { createRivaClient } from './client';
import { computed } from './computed';
import type { RivaError } from './errors';
import { nodeOf, read, subscribe, write } from './graph';
import { signal } from './signal';

test('nodeOf creates one node per definition and client', () => {
	const a = signal(1);
	const c1 = createRivaClient();
	const c2 = createRivaClient();
	expect(nodeOf(c1.graph, a)).toBe(nodeOf(c1.graph, a));
	expect(nodeOf(c1.graph, a)).not.toBe(nodeOf(c2.graph, a));
	expect(nodeOf(c1.graph, a).value).toBe(1);
});

test('versions bump only on a real change and the epoch on each write', () => {
	const a = signal(1);
	const { graph: g } = createRivaClient();
	write(g, a, 1);
	expect(nodeOf(g, a).ver).toBe(0);
	expect(g.epoch).toBe(0);
	write(g, a, 2);
	expect(nodeOf(g, a).ver).toBe(1);
	expect(g.epoch).toBe(1);
});

test('a computed is cached within an epoch and verified by source versions after', () => {
	const a = signal(1);
	const other = signal(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a);
	});
	const { graph: g } = createRivaClient();
	read(g, d);
	read(g, d);
	write(g, other, 2);
	read(g, d);
	expect(calls).toBe(1);
	write(g, a, 2);
	expect(read(g, d)).toBe(2);
	expect(calls).toBe(2);
});

test('links are ref-counted across listeners and chained computeds', () => {
	const a = signal(1);
	const b = computed((get) => get(a));
	const d = computed((get) => get(b));
	const { graph: g } = createRivaClient();
	const off1 = subscribe(g, d, () => {});
	const off2 = subscribe(g, d, () => {});
	expect(nodeOf(g, a).observers.size).toBe(1);
	expect(nodeOf(g, b).refs).toBe(1);
	off1();
	expect(nodeOf(g, a).observers.size).toBe(1);
	off2();
	expect(nodeOf(g, a).observers.size).toBe(0);
	expect(nodeOf(g, b).observers.size).toBe(0);
	expect(nodeOf(g, d).refs).toBe(0);
});

test('a cycle throws RIVA_CYCLE and leaves the node usable', () => {
	const flag = signal(true);
	const box: { d?: ReturnType<typeof computed<number>> } = {};
	const d = computed((get): number => (get(flag) ? get(box.d as never) : 1));
	box.d = d;
	const { graph: g } = createRivaClient();
	try {
		read(g, d);
		throw new Error('expected a cycle');
	} catch (e) {
		expect((e as RivaError).code).toBe('RIVA_CYCLE');
	}
	expect(nodeOf(g, d).busy).toBe(false);
	write(g, flag, false);
	expect(read(g, d)).toBe(1);
});

test('a throwing listener leaves no stuck flush or batch state', () => {
	const a = signal(0);
	const { graph: g } = createRivaClient();
	subscribe(g, a, () => {
		throw new Error('x');
	});
	expect(() => write(g, a, 1)).toThrow('x');
	expect(g.flushing).toBe(false);
	expect(g.depth).toBe(0);
	expect(() => write(g, a, 2)).toThrow('x');
});

test('batch rethrows the body error after flushing, with a flush error as cause', () => {
	const a = signal(0);
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(a, (v) => seen.push(v));
	const body = new Error('body');
	expect(() =>
		c.batch(() => {
			c.set(a, 1);
			throw body;
		}),
	).toThrow(body);
	expect(seen).toEqual([1]);
	const boom = new Error('listener');
	c.subscribe(a, () => {
		throw boom;
	});
	let thrown: unknown;
	try {
		c.batch(() => {
			c.set(a, 2);
			throw body;
		});
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBe(body);
	expect((thrown as Error).cause).toBe(boom);
	expect(c.graph.depth).toBe(0);
});

test('batch keeps a frozen or primitive body error and does not throw from the attach', () => {
	const a = signal(0);
	const c = createRivaClient();
	c.subscribe(a, () => {
		throw new Error('listener');
	});
	const frozen = Object.freeze(new Error('frozen'));
	let thrown: unknown;
	try {
		c.batch(() => {
			c.set(a, 1);
			throw frozen;
		});
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBe(frozen);
	try {
		c.batch(() => {
			c.set(a, 2);
			throw 'text';
		});
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBe('text');
});

test('write asks equals before assigning, so an equals that throws refuses the write', () => {
	const guarded = signal(1, {
		equals: () => {
			throw new Error('refused');
		},
	});
	const c = createRivaClient();
	expect(() => c.set(guarded, 2)).toThrow('refused');
	expect(c.get(guarded)).toBe(1);
	expect(c.graph.epoch).toBe(0);
});
