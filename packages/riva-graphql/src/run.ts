import type { FetchContext } from '@softistx/riva';
import type { Operation } from './operation';
import { transportOf } from './transport';

/** The core's `fetch` / `run` of an operation: through the transport of the client in scope. */
export const fetchOf =
	<Data, Vars>(operation: Operation<Data, Vars>) =>
	async (vars: Vars, ctx: FetchContext): Promise<Data> =>
		transportOf(ctx.client).execute(operation, vars, { signal: ctx.signal });
