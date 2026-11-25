import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
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
	test('is made once per client, with a read-only view and bound actions', () => {
		const def = make('i1');
		const c = createRivaClient();
		const a = instance(def, c);
		expect(instance(def, c)).toBe(a);
		expect(instance(make('i1b'), c)).not.toBe(a);
		expect(instance(def, createRivaClient())).not.toBe(a);
		a[1]['inc']?.();
		expect(a[0]['n']).toBe(1);
		expect(() => {
			a[0]['n'] = 5;
		}).toThrow(/read-only here/);
	});

	test('claims the name: a second definition is refused on the server, not in a browser', () => {
		const one = make('i2');
		const two = make('i2');
		const c = createRivaClient();
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
});
