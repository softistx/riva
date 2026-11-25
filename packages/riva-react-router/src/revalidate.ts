import { query, RivaAbortError, RivaScopeError } from '@softistx/riva';

/** Where `RivaRouterProvider` leaves the router's revalidator on its client: it resolves to the count of runs. */
export const REVALIDATOR = {};

/**
 * Re-runs the route loaders. `RivaRouterProvider` observes it, so invalidating
 * it (`invalidates: [revalidate]` on a mutation, or `revalidate.invalidate(client)`)
 * calls the router's `revalidate()`; several invalidations in one tick make one
 * run. The data is a count of the runs.
 */
export const revalidate = query<void, number>({
	id: '~riva/revalidate',
	staleTime: Number.POSITIVE_INFINITY,
	retry: 0,
	fetch: async (_vars, { client, signal }) => {
		// An invalidation restarts the fetch and aborts the one before it: let a
		// burst in one tick settle, so only its last fetch runs the loaders.
		await null;
		if (signal.aborted) throw new RivaAbortError();
		const run = client.slots.get(REVALIDATOR) as
			| (() => Promise<number>)
			| undefined;
		if (!run)
			throw new RivaScopeError(
				'revalidate is observed by RivaRouterProvider: render it above the component that invalidates it.',
			);
		return run();
	},
});
