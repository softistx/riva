import type { FetchContext } from '@softistx/riva';
import type { Operation } from './operation';
import { transportOf } from './transport';

/** The core's `fetch` / `run` of an operation: through the transport of the riva in scope. */
export const fetchOf =
	<Data, Vars>(operation: Operation<Data, Vars>) =>
	async (vars: Vars, ctx: FetchContext): Promise<Data> =>
		transportOf(ctx.riva).execute(operation, vars, {
			signal: ctx.signal,
			...(ctx.onPart && { onPart: ctx.onPart as (data: Data) => void }),
		});
