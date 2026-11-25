import { type Riva, RivaError } from '@softistx/riva';

/** The members of `riva.rest` the hooks call, untyped: the hooks' own signatures carry the types. */
export interface RestNamespace {
	get(path: string, input?: unknown, call?: unknown): never;
	mutation(method: string, path: string): never;
}

/** `riva.rest` of the riva in scope, or a `RIVA_DEFINITION` error that says how to install it. */
export function restOf(riva: Riva): RestNamespace {
	const api = (riva as unknown as { rest?: RestNamespace }).rest;
	if (!api)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-rest/react: the riva in scope has no REST: create it with createRiva({ rest: rest(api) }).',
		);
	return api;
}
