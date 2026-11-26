import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { type Signal, signal } from '../signal';
import type { StoreDef } from './def';
import { instance } from './instance';

const make = (name: string): StoreDef => {
	const n = signal(0, { name: `${name}.n` }) as Signal<unknown>;
	return {
		name,
		sigs: { n },
		members: { n },
		actions: {
			inc(s: { n: number }) {
				s.n += 1;
			},
		},
	};
};

describe('instance', () => {
	test('is made once per riva, with a read-only view and bound actions', () => {
		const def = make('i1');
		const c = createRiva();
		const a = instance(def, c);
		expect(instance(def, c)).toBe(a);
		expect(instance(make('i1b'), c)).not.toBe(a);
		expect(instance(def, createRiva())).not.toBe(a);
		a[1]['inc']?.();
		expect(a[0]['n']).toBe(1);
		expect(() => {
			a[0]['n'] = 5;
		}).toThrow(/read-only here/);
	});

	test('claims the name: a second definition is refused on the server, not in a browser', () => {
		const one = make('i2');
		const two = make('i2');
		const c = createRiva();
		instance(one, c);
		expect(() => instance(two, c)).toThrow(/two stores are named "i2"/);
		const g = globalThis as { document?: unknown };
		g.document = {};
		try {
			const t = instance(two, c);
			expect(instance(two, c)).toBe(t);
			expect(c.slots.get(one)).toBeUndefined();
		} finally {
			delete g.document;
		}
	});
	test('a replaced definition does not take the name back (hot-reload ping-pong)', () => {
		const a = make('i3');
		const b = make('i3');
		const c = createRiva();
		const g = globalThis as { document?: unknown };
		g.document = {};
		try {
			instance(a, c);
			const ib = instance(b, c);
			(ib[1]['inc'] as () => void)();
			expect(ib[0]['n']).toBe(1);
			// A, still held by a component, is seen again: it resolves to B's instance.
			expect(instance(a, c)).toBe(ib);
			expect(c.slots.get('name:i3')).toBe(b);
			expect(instance(b, c)).toBe(ib);
			expect(ib[0]['n']).toBe(1);
			// A third definition takes over; both older ones resolve to it.
			const d = make('i3');
			const id = instance(d, c);
			expect(instance(a, c)).toBe(id);
			expect(instance(b, c)).toBe(id);
			expect(c.slots.get('name:i3')).toBe(d);
		} finally {
			delete g.document;
		}
	});

	test('documented limit: a never-held older definition takes the name back once', () => {
		const a = make('i5');
		const b = make('i5');
		const d = make('i5');
		const c = createRiva();
		const g = globalThis as { document?: unknown };
		g.document = {};
		try {
			instance(b, c);
			instance(d, c);
			// `a` was never the holder: it is taken for a newer module and takes over.
			const ia = instance(a, c);
			expect(c.slots.get('name:i5')).toBe(a);
			// From then on `d` is a former holder and resolves to `a`.
			expect(instance(d, c)).toBe(ia);
			expect(c.slots.get('name:i5')).toBe(a);
		} finally {
			delete g.document;
		}
	});

	test('on the server a definition other than the holder is still refused', () => {
		const a = make('i4');
		const c = createRiva();
		instance(a, c);
		expect(() => instance(make('i4'), c)).toThrow(/two stores are named "i4"/);
		expect(() => instance(make('i4'), c)).toThrow(/two stores are named "i4"/);
	});
});
