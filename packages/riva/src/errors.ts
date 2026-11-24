/** Base of every error riva throws. Defined once here so `instanceof` holds across packages. */
export class RivaError extends Error {
	readonly code: string;
	constructor(code: string, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RivaError';
		this.code = code;
	}
}

/** A value was read with no `RivaClient` in scope. */
export class RivaScopeError extends RivaError {
	constructor(message: string) {
		super('RIVA_SCOPE', message);
		this.name = 'RivaScopeError';
	}
}
