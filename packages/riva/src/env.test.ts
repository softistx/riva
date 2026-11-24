import { afterEach, expect, test } from 'bun:test';
import { defaultEvents, defaultScheduler } from './env';

const g = globalThis as unknown as {
	document?: unknown;
	addEventListener?: unknown;
	removeEventListener?: unknown;
	[k: string]: unknown;
};
const saved = {
	document: g.document,
	addEventListener: g.addEventListener,
	removeEventListener: g.removeEventListener,
};
afterEach(() => {
	for (const [k, v] of Object.entries(saved))
		if (v === undefined) delete g[k];
		else g[k] = v;
});

interface Fake {
	on: Map<string, Set<() => void>>;
	addEventListener(t: string, cb: () => void): void;
	removeEventListener(t: string, cb: () => void): void;
	fire(t: string): void;
}
const fake = (): Fake => {
	const on = new Map<string, Set<() => void>>();
	return {
		on,
		addEventListener: (t, cb) => on.set(t, (on.get(t) ?? new Set()).add(cb)),
		removeEventListener: (t, cb) => on.get(t)?.delete(cb),
		fire: (t) => {
			for (const cb of [...(on.get(t) ?? [])]) cb();
		},
	};
};
const count = (f: Fake) => [...f.on.values()].reduce((n, s) => n + s.size, 0);

test('no listener on the server', () => {
	delete g.document;
	const win = fake();
	g.addEventListener = win.addEventListener;
	const off = defaultEvents.onFocus(() => {});
	defaultEvents.onReconnect(() => {})();
	off();
	expect(count(win)).toBe(0);
});

test('browser: focus and visible visibilitychange, online', () => {
	const win = fake();
	const doc = Object.assign(fake(), { visibilityState: 'hidden' });
	g.document = doc;
	g.addEventListener = win.addEventListener;
	g.removeEventListener = win.removeEventListener;
	let focus = 0;
	let online = 0;
	const offFocus = defaultEvents.onFocus(() => focus++);
	const offOnline = defaultEvents.onReconnect(() => online++);
	win.fire('focus');
	doc.fire('visibilitychange'); // hidden: ignored
	expect(focus).toBe(1);
	doc.visibilityState = 'visible';
	doc.fire('visibilitychange');
	expect(focus).toBe(2);
	win.fire('online');
	expect(online).toBe(1);
	offFocus();
	offOnline();
	expect(count(win) + count(doc)).toBe(0);
});

test('the default scheduler is the host clock and timers', async () => {
	const t0 = defaultScheduler.now();
	expect(Math.abs(t0 - Date.now())).toBeLessThan(50);
	let ran = 0;
	defaultScheduler.setTimeout(() => ran++, 1);
	const h = defaultScheduler.setTimeout(() => ran++, 1);
	defaultScheduler.clearTimeout(h);
	await new Promise((r) => setTimeout(r, 10));
	expect(ran).toBe(1);
});
