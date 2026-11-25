/** What a resource shows. Narrow on `status`: `success` always has data. */
export type ResourceState<D> =
	| {
			readonly status: 'idle';
			readonly data: undefined;
			readonly error: undefined;
			readonly isFetching: false;
			readonly placeholder: false;
	  }
	| {
			readonly status: 'loading';
			/** The last data of the entry while it retries after a failure; undefined on a first load. */
			readonly data: D | undefined;
			readonly error: undefined;
			readonly isFetching: boolean;
			readonly placeholder: false;
	  }
	| {
			readonly status: 'success';
			readonly data: D;
			readonly error: undefined;
			readonly isFetching: boolean;
			/** True while the data is the previous key's, kept until the new one lands. */
			readonly placeholder: boolean;
	  }
	| {
			readonly status: 'error';
			readonly data: D | undefined;
			readonly error: unknown;
			readonly isFetching: boolean;
			readonly placeholder: false;
	  };

/** What a mutation handle shows. The last call wins. */
export type MutationState<D> =
	| {
			readonly status: 'idle' | 'loading';
			readonly data: undefined;
			readonly error: undefined;
	  }
	| {
			readonly status: 'success';
			readonly data: D;
			readonly error: undefined;
	  }
	| {
			readonly status: 'error';
			readonly data: undefined;
			readonly error: unknown;
	  };

export const IDLE: ResourceState<never> = Object.freeze({
	status: 'idle',
	data: undefined,
	error: undefined,
	isFetching: false,
	placeholder: false,
});

/** Shallow equality of two states, so a re-derived but identical state does not notify. */
export const sameState = (a: object, b: object): boolean => {
	const k = Object.keys(a) as Array<keyof typeof a>;
	return k.length === Object.keys(b).length && k.every((x) => a[x] === b[x]);
};
