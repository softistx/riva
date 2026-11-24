import { afterEach, expect, test } from 'bun:test';
import { atom } from './atom';
import { createRivaClient } from './client';
import { effect } from './effect';
import { setDefaultClient } from './scope';

const g = globalThis as { document?: unknown };
afterEach(() => {
	delete g.document;
});

test('re-runs when what it read changes, with cleanup and dispose', () => {
	const a = atom(0);
	const c = createRivaClient();
	const log: string[] = [];
	const stop = c.effect(() => {
		const v = c.get(a);
		log.push(`run ${v}`);
		return () => log.push(`clean ${v}`);
	});
	c.set(a, 1);
	expect(log).toEqual(['run 0', 'clean 0', 'run 1']);
	stop();
	expect(log).toEqual(['run 0', 'clean 0', 'run 1', 'clean 1']);
	c.set(a, 2);
	expect(log.length).toBe(4);
});

test('an effect does not track what its cleanup reads', () => {
	const a = atom(0);
	const b = atom(0);
	const c = createRivaClient();
	let runs = 0;
	c.effect(() => {
		runs++;
		c.get(a);
		return () => c.get(b);
	});
	c.set(b, 1);
	expect(runs).toBe(1);
});

test('free effect is a no-op on the server', () => {
	let runs = 0;
	const stop = effect(() => {
		runs++;
	});
	expect(runs).toBe(0);
	expect(stop()).toBeUndefined();
});

test('free effect runs through the default client in a browser', () => {
	g.document = {};
	const c = createRivaClient();
	setDefaultClient(c);
	const a = atom(0);
	const seen: number[] = [];
	const stop = effect(() => {
		seen.push(a.get());
	});
	a.set(1);
	stop();
	a.set(2);
	expect(seen).toEqual([0, 1]);
	setDefaultClient(undefined);
});
