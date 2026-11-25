import type { Duration, Riva } from '@softistx/riva';
import type { Resource, ResourceState } from '@softistx/riva/resource';
import { useStableInput } from './use-input';
import { suspenseStaleTime, useResource } from './use-resource';

/** The options an adapter's query hook takes, `suspense` included. */
export interface CallResourceOptions {
	/** Suspends until there is data, and throws an error to the nearest error boundary. The state is then `success`. Default false. */
	suspense?: boolean;
	/** While new variables load, show the previous ones' data (`placeholder: true`). Default true. */
	keepPrevious?: boolean;
	/** Replaces the riva's default `staleTime` for this hook (at least 1000 ms while it suspends). */
	staleTime?: Duration;
	/** A boolean, or a function read in a tracked computed. While false the state is `idle` and nothing is fetched. Default true. */
	enabled?: boolean | (() => boolean);
}

/** What `useCallResource` hands `make`: the call options of the render that last changed the key. */
export interface ResourceCall {
	enabled: boolean | (() => boolean);
	keepPrevious?: boolean;
	staleTime?: Duration;
}

/**
 * The state of an adapter query call (`riva.graphql.query`, `riva.rest.get`)
 * for these variables, fetched while the component is mounted. `id` names the
 * operation; `make` builds the call's resource from the stabilised `input` and
 * the options (`enabled`, `keepPrevious`, and `staleTime` raised for Suspense).
 */
export function useCallResource<D>(
	id: string,
	input: unknown,
	options: CallResourceOptions,
	make: (riva: Riva, input: unknown, call: ResourceCall) => Resource<D>,
): ResourceState<D> {
	const { suspense = false, keepPrevious, staleTime, enabled } = options;
	const stable = useStableInput(id, input, enabled);
	return useResource(
		stable.key,
		(riva) =>
			make(riva, stable.input, {
				enabled: stable.enabled,
				...(keepPrevious === undefined ? {} : { keepPrevious }),
				...(suspense
					? { staleTime: suspenseStaleTime(riva, staleTime) }
					: staleTime === undefined
						? {}
						: { staleTime }),
			}),
		{ suspense, ...(keepPrevious === undefined ? {} : { keepPrevious }) },
	) as ResourceState<D>;
}
