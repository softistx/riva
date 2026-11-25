import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { signal } from '../signal';
import { lazy } from './lazy';

const g = globalThis as { document?: unknown };
beforeEach(() => {
	g.document = {};
});
afterEach(() => {
	delete g.document;
});

function setup() {
	const riva = createRiva();
	const t = signal<number | undefined>(1);
	const target = computed((get) => get(t));
	const view = computed((get) => get(t) ?? -1);
	const log: string[] = [];
	const w = lazy(riva, view, target, (x) => {
		log.push(`open ${x}`);
		return () => log.push(`close ${x}`);
	});
	return { riva, t, w, log };
}

test('opens at the first subscriber, swaps with the target, closes at the last', () => {
	const { riva, t, w, log } = setup();
	const a = w.subscribe(() => {});
	const b = w.subscribe(() => {});
	expect(log).toEqual(['open 1']);
	riva.set(t, 2);
	expect(log).toEqual(['open 1', 'close 1', 'open 2']);
	riva.set(t, undefined);
	expect(log.at(-1)).toBe('close 2');
	a();
	expect(log.at(-1)).toBe('close 2');
	b();
	b();
	expect(log).toEqual(['open 1', 'close 1', 'open 2', 'close 2']);
});

test('an untracked read opens nothing', async () => {
	const { w, log } = setup();
	w.read();
	await Promise.resolve();
	expect(log).toEqual([]);
});
