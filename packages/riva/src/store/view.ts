import { RivaError } from '../errors';

/** Throws the error every store refusal uses. */
export const refuse = (message: string): never => {
	throw new RivaError('RIVA_STORE', message);
};

/**
 * The one Proxy behind every store view: an action's `s` (read, guarded
 * write), a computed's `s` (tracked read, no write) and a component's (reads
 * recorded, no write). An unknown key reads `undefined`, so a symbol probe
 * (`then`, a devtools hook) is harmless; writes decide for themselves.
 */
export const view = (
	keys: object,
	read: (key: string) => unknown,
	write: (key: string, value: unknown) => void,
): Record<string, unknown> =>
	new Proxy(
		{},
		{
			get: (_, k) =>
				typeof k === 'string' && Object.hasOwn(keys, k) ? read(k) : undefined,
			set: (_, k, v) => {
				write(k as string, v);
				return true;
			},
		},
	);
