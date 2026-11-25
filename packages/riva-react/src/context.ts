import { type Riva, RivaScopeError } from '@softistx/riva';
import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
} from 'react';

const RivaContext = createContext<Riva | undefined>(undefined);

interface ProviderBase {
	children?: ReactNode;
}

export interface RivaProviderProps extends ProviderBase {
	/** The riva of this tree: one per request on the server, one in the browser. */
	riva: Riva;
}

/** Puts a `Riva` in scope for the hooks below it. Hold one provider (and one riva) per server request. */
export const RivaProvider = ({ riva, children }: RivaProviderProps) =>
	createElement(RivaContext, { value: riva }, children);

/** The riva of the nearest `RivaProvider`; throws a `RivaScopeError` when there is none. */
export function useRiva(): Riva {
	const riva = useContext(RivaContext);
	if (!riva)
		throw new RivaScopeError(
			'No Riva in scope: wrap the tree in <RivaProvider riva={riva}>. On the server, create one per request.',
		);
	return riva;
}
