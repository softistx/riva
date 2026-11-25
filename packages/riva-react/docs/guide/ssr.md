# Server rendering

Render each request under its own `RivaProvider` with its own riva; no hook holds module-level state, so nothing leaks between requests.

```tsx
import { createRiva } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';
import { renderToReadableStream } from 'react-dom/server';

export async function handle(school: string): Promise<Response> {
	const riva = createRiva(); // one per request
	await patients.ensure(riva, { school }); // so the first render has data
	const stream = await renderToReadableStream(
		<RivaProvider riva={riva}>
			<PatientList school={school} />
		</RivaProvider>,
	);
	return new Response(stream, { headers: { 'content-type': 'text/html' } });
}
```

- A hook never starts a fetch during a server render, except through `suspense: true`, which waits for it and streams the result (`renderToReadableStream` and `renderToPipeableStream`).
- Effects and subscriptions run in the browser only.
- To hand the server's cache to the browser, use `dehydrate` and `hydrate` from `@softistx/riva/ssr`, or `@softistx/riva-react-router`, which does both. Until the browser has the snapshot, it fetches what it does not have.
- Data hydrated with a `staleTime` of 0 is refetched at once: give queries a `staleTime`.

See the core's [ssr guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/ssr.md).
