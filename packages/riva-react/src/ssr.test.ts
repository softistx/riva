import { expect, test } from 'bun:test';
import { query } from '@softistx/riva';
import { type ReactNode, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { h, newClient } from '../test/render';
import { RivaProvider } from './context';
import { useQuery } from './use-query';

const users = (
	id: string,
	fetch: (vars: { school: string }) => Promise<string>,
) => query<{ school: string }, string>({ id, retry: 0, fetch });

async function html(client: ReturnType<typeof newClient>, ui: ReactNode) {
	const stream = await renderToReadableStream(h(RivaProvider, { client }, ui));
	await stream.allReady;
	const text = await new Response(stream).text();
	// Test-only workaround: react-dom/server leaves its renderer marker on the
	// shared context, and the DOM specs that follow in this Bun process would
	// warn about "multiple renderers". Clearing it changes nothing in the code
	// under test.
	const context = RivaProvider({ client }).type as unknown as Record<
		string,
		unknown
	>;
	context['_currentRenderer'] = null;
	context['_currentRenderer2'] = null;
	return text;
}

test('streaming SSR keeps two requests apart', async () => {
	const def = users('uq/ssr', async ({ school }) => {
		await new Promise((r) => setTimeout(r, school === 'a' ? 15 : 5));
		return `data-${school}`;
	});
	function Page({ school }: { school: string }) {
		const q = useQuery(def, { school }, { suspense: true });
		return h('p', null, q.data);
	}
	const page = (school: string) =>
		h(Suspense, { fallback: h('p', null, 'loading') }, h(Page, { school }));
	const ca = newClient();
	const cb = newClient();
	const [a, b] = await Promise.all([html(ca, page('a')), html(cb, page('b'))]);
	expect(a).toContain('data-a');
	expect(a).not.toContain('data-b');
	expect(b).toContain('data-b');
	expect(b).not.toContain('data-a');
	expect(ca.queries.state(def, { school: 'b' }).status).toBe('idle');
});

test('a server render without suspense starts no fetch', async () => {
	let calls = 0;
	const def = users('uq/ssr-idle', async () => {
		calls++;
		return 'x';
	});
	function Page() {
		return h('p', null, useQuery(def, { school: 's' }).status);
	}
	expect(await html(newClient(), h(Page))).toContain('idle');
	expect(calls).toBe(0);
});
