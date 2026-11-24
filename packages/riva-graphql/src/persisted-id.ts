/**
 * The persisted id of an operation's text: its SHA-256 in lowercase hex, the
 * scheme `@softistx/graphql-client` uses for `apq` hashes. The codegen plugin
 * computes the allowlist ids with this same function.
 */
export async function persistedIdOf(text: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(text),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0'),
	).join('');
}
