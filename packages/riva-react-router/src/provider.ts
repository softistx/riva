import {
	createRivaClient,
	type Invalidation,
	type RivaClient,
} from '@softistx/riva';
import { hydrate, type Snapshot } from '@softistx/riva/ssr';
import { RivaProvider } from '@softistx/riva-react';
import {
	createElement,
	type ReactElement,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { useMatches, useRevalidator } from 'react-router';
import { useInvalidateOnAction } from './invalidate-on-action';
import { REVALIDATOR, revalidate } from './revalidate';

export interface RivaRouterProviderProps {
	/**
	 * The client of this tree. By default one is created per mount. It must stay
	 * the same object for the lifetime of the mount: the provider reads it once
	 * and does not follow a new one.
	 */
	client?: RivaClient;
	/**
	 * Runs on the client of this mount, before any loader snapshot is read
	 * (e.g. `provideGraphQL`). It must be idempotent: React StrictMode runs the
	 * initial state twice in development, so it can be called twice.
	 */
	setup?: (client: RivaClient, env: { server: boolean }) => void;
	/** Invalidated each time a non-GET navigation or fetcher settles. */
	invalidateOnAction?: readonly Invalidation[];
	children?: ReactNode;
}

/** What a loader's data holds under `~riva`; React Router's serialized types do not keep the `Snapshot` brand. */
const snapshotOf = (data: unknown): Snapshot | undefined =>
	(data as { '~riva'?: Snapshot } | null | undefined)?.['~riva'];

/**
 * Puts a client in scope and keeps it in step with the loaders: every match's
 * `~riva` snapshot (see `riva(context)`) is hydrated once. The first render
 * seeds the client before its children read it, so the server markup and the
 * browser's first render agree; on a navigation or a revalidation, what
 * observed entries or entities could reach is held back and applied in a
 * layout effect. Place it in the root route component.
 */
export function RivaRouterProvider({
	client,
	setup,
	invalidateOnAction,
	children,
}: RivaRouterProviderProps): ReactElement {
	const [own] = useState(() => {
		const c = client ?? createRivaClient();
		setup?.(c, { server: typeof document === 'undefined' });
		return c;
	});
	const active = client ?? own;
	const seen = useRef(new WeakSet<object>());
	const started = useRef(false);
	const later = useRef<Snapshot[]>([]);
	const first = !started.current;
	started.current = true;
	for (const m of useMatches()) {
		const snap = snapshotOf(m.loaderData);
		if (!snap || seen.current.has(snap)) continue;
		seen.current.add(snap);
		const rest = hydrate(
			active,
			snap,
			first ? undefined : { deferObserved: true },
		);
		if (rest) later.current.push(rest);
	}
	const router = useRevalidator();
	const run = useRef(router.revalidate);
	run.current = router.revalidate;
	useEffect(() => {
		let runs = 0;
		active.slots.set(REVALIDATOR, async () => {
			await run.current();
			runs += 1;
			return runs;
		});
		revalidate.setData(active, undefined, 0);
		const stop = active.subscribe(revalidate, () => {});
		return () => {
			stop();
			active.slots.delete(REVALIDATOR);
		};
	}, [active]);
	useInvalidateOnAction(active, invalidateOnAction);
	useLayoutEffect(() => {
		for (const rest of later.current.splice(0)) hydrate(active, rest);
	});
	return createElement(RivaProvider, { client: active }, children);
}
