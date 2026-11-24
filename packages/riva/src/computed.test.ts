import { expect, test } from 'bun:test';
import { atom } from './atom';
import { createRivaClient } from './client';
import { computed } from './computed';
import { RivaError } from './errors';

test('is lazy and cached', () => {
	const a = atom(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a) * 2;
	});
	const c = createRivaClient();
	expect(calls).toBe(0);
	expect(c.get(d)).toBe(2);
	expect(c.get(d)).toBe(2);
	expect(calls).toBe(1);
	c.set(a, 2);
	expect(calls).toBe(1);
	expect(c.get(d)).toBe(4);
	expect(calls).toBe(2);
});

test('is cached per client', () => {
	const a = atom(1);
	const d = computed((get) => get(a) + 1);
	const c1 = createRivaClient();
	const c2 = createRivaClient();
	c1.set(a, 10);
	expect(c1.get(d)).toBe(11);
	expect(c2.get(d)).toBe(2);
});

test('does not re-evaluate when a dependency is set to an equal value', () => {
	const a = atom(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a);
	});
	const c = createRivaClient();
	c.get(d);
	c.set(a, 1);
	c.get(d);
	expect(calls).toBe(1);
});

test('a computed whose value is unchanged does not recompute dependents', () => {
	const a = atom(1);
	const parity = computed((get) => get(a) % 2);
	let calls = 0;
	const label = computed((get) => {
		calls++;
		return get(parity) ? 'odd' : 'even';
	});
	const c = createRivaClient();
	c.get(label);
	c.set(a, 3);
	expect(c.get(label)).toBe('odd');
	expect(calls).toBe(1);
});

test('tracks dependencies dynamically', () => {
	const flag = atom(true);
	const x = atom(1);
	const y = atom(2);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(flag) ? get(x) : get(y);
	});
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(d, (v) => seen.push(v));
	c.set(y, 20);
	expect(calls).toBe(1);
	c.set(flag, false);
	expect(seen).toEqual([20]);
	c.set(x, 100);
	expect(calls).toBe(2);
	c.set(y, 30);
	expect(seen).toEqual([20, 30]);
});

test('implicit tracking through ambient get()', () => {
	const a = atom(1);
	const d = computed(() => a.get() + 1);
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(d, (v) => seen.push(v));
	c.set(a, 5);
	expect(seen).toEqual([6]);
});

test('diamond: evaluates once per change and never sees a mix', () => {
	const a = atom(1);
	const b = computed((get) => get(a) + 1);
	const cc = computed((get) => get(a) * 10);
	const calls: Array<[number, number]> = [];
	const d = computed((get) => {
		const r: [number, number] = [get(b), get(cc)];
		calls.push(r);
		return r[0] + r[1];
	});
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(d, (v) => seen.push(v));
	expect(calls.length).toBe(1);
	c.set(a, 2);
	expect(calls).toEqual([
		[2, 10],
		[3, 20],
	]);
	expect(seen).toEqual([23]);
});

test('unsubscribing the last listener releases links, then re-evaluates lazily', () => {
	const a = atom(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a);
	});
	const c = createRivaClient();
	const off = c.subscribe(d, () => {});
	const an = c.graph.nodes.get(a);
	expect(an?.observers.size).toBe(1);
	off();
	expect(an?.observers.size).toBe(0);
	c.set(a, 2);
	expect(calls).toBe(1);
	expect(c.get(d)).toBe(2);
	expect(calls).toBe(2);
});

test('detects a cycle', () => {
	const self: { d: ReturnType<typeof computed<number>> } = {} as never;
	self.d = computed((get) => get(self.d) + 1);
	const c = createRivaClient();
	try {
		c.get(self.d);
		throw new Error('expected a cycle');
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaError).code).toBe('RIVA_CYCLE');
	}
});

test('a throwing computed can be read again', () => {
	const a = atom(0);
	const d = computed((get) => {
		if (get(a) === 0) throw new Error('zero');
		return get(a);
	});
	const c = createRivaClient();
	expect(() => c.get(d)).toThrow('zero');
	c.set(a, 2);
	expect(c.get(d)).toBe(2);
});
