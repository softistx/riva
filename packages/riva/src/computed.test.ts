import { expect, test } from 'bun:test';
import { createRiva } from './client';
import { computed } from './computed';
import { RivaError } from './errors';
import { signal } from './signal';

test('is lazy and cached', () => {
	const a = signal(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a) * 2;
	});
	const c = createRiva();
	expect(calls).toBe(0);
	expect(c.get(d)).toBe(2);
	expect(c.get(d)).toBe(2);
	expect(calls).toBe(1);
	c.set(a, 2);
	expect(calls).toBe(1);
	expect(c.get(d)).toBe(4);
	expect(calls).toBe(2);
});

test('is cached per riva', () => {
	const a = signal(1);
	const d = computed((get) => get(a) + 1);
	const c1 = createRiva();
	const c2 = createRiva();
	c1.set(a, 10);
	expect(c1.get(d)).toBe(11);
	expect(c2.get(d)).toBe(2);
});

test('does not re-evaluate when a dependency is set to an equal value', () => {
	const a = signal(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a);
	});
	const c = createRiva();
	c.get(d);
	c.set(a, 1);
	c.get(d);
	expect(calls).toBe(1);
});

test('a computed whose value is unchanged does not recompute dependents', () => {
	const a = signal(1);
	const parity = computed((get) => get(a) % 2);
	let calls = 0;
	const label = computed((get) => {
		calls++;
		return get(parity) ? 'odd' : 'even';
	});
	const c = createRiva();
	c.get(label);
	c.set(a, 3);
	expect(c.get(label)).toBe('odd');
	expect(calls).toBe(1);
});

test('tracks dependencies dynamically', () => {
	const flag = signal(true);
	const x = signal(1);
	const y = signal(2);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(flag) ? get(x) : get(y);
	});
	const c = createRiva();
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
	const a = signal(1);
	const d = computed(() => a.get() + 1);
	const c = createRiva();
	const seen: number[] = [];
	c.subscribe(d, (v) => seen.push(v));
	c.set(a, 5);
	expect(seen).toEqual([6]);
});

test('diamond: evaluates once per change and never sees a mix', () => {
	const a = signal(1);
	const b = computed((get) => get(a) + 1);
	const cc = computed((get) => get(a) * 10);
	const calls: Array<[number, number]> = [];
	const d = computed((get) => {
		const r: [number, number] = [get(b), get(cc)];
		calls.push(r);
		return r[0] + r[1];
	});
	const c = createRiva();
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
	const a = signal(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a);
	});
	const c = createRiva();
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
	const c = createRiva();
	try {
		c.get(self.d);
		throw new Error('expected a cycle');
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaError).code).toBe('RIVA_CYCLE');
	}
});

test('a throwing computed can be read again', () => {
	const a = signal(0);
	const d = computed((get) => {
		if (get(a) === 0) throw new Error('zero');
		return get(a);
	});
	const c = createRiva();
	expect(() => c.get(d)).toThrow('zero');
	c.set(a, 2);
	expect(c.get(d)).toBe(2);
});
