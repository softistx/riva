import { createRiva, type Riva } from '@softistx/riva';
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { RivaProvider } from '../src/context';

export const h = createElement;

/** A riva with no retry delay surprises: queries in these tests set `retry: 0` themselves. */
export const newRiva = (): Riva => createRiva();

export interface Mounted {
	container: HTMLElement;
	text: () => string;
	rerender: (ui: ReactElement) => Promise<void>;
	unmount: () => Promise<void>;
}

/** Mounts `ui` in a fresh DOM node under a provider (when a riva is given) and flushes effects. */
export async function mount(ui: ReactElement, riva?: Riva): Promise<Mounted> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	const wrap = (el: ReactElement) =>
		riva ? h(RivaProvider, { riva }, el) : el;
	await act(async () => {
		root.render(wrap(ui));
	});
	return {
		container,
		text: () => container.textContent ?? '',
		rerender: (next) =>
			act(async () => {
				root.render(wrap(next));
			}),
		unmount: async () => {
			await act(async () => root.unmount());
			container.remove();
		},
	};
}

/** Runs `fn` then lets pending promises and React updates settle. */
export const flush = (fn: () => void | Promise<void> = () => {}) =>
	act(async () => {
		await fn();
		await new Promise((r) => setTimeout(r, 0));
	});

/** A promise settled from outside. */
export function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
