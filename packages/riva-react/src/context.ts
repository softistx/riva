import { type RivaClient, RivaScopeError } from '@softistx/riva';
import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
} from 'react';

const RivaContext = createContext<RivaClient | undefined>(undefined);

export interface RivaProviderProps {
	/** The client of this tree: one per request on the server, one in the browser. */
	client: RivaClient;
	children?: ReactNode;
}

/** Puts a `RivaClient` in scope for the hooks below it. Hold one provider (and one client) per server request. */
export const RivaProvider = ({ client, children }: RivaProviderProps) =>
	createElement(RivaContext, { value: client }, children);

/** The client of the nearest `RivaProvider`; throws a `RivaScopeError` when there is none. */
export function useClient(): RivaClient {
	const client = useContext(RivaContext);
	if (!client)
		throw new RivaScopeError(
			'No RivaClient in scope: wrap the tree in <RivaProvider client={client}>. On the server, create one client per request.',
		);
	return client;
}
