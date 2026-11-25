# Server rendering

Render each request under its own `RivaProvider` with its own riva; no hook holds module-level state, so nothing leaks between requests.

```tsx
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { graphql } from '@softistx/riva-graphql';
import { RivaProvider } from '@softistx/riva-react';
import { renderToReadableStream } from 'react-dom/server';
import { PATIENTS_QUERY } from './graphql'; // a typed document
import { PatientList } from './patient-list'; // reads PATIENTS_QUERY with useGraphQL

export async function handle(school: string): Promise<Response> {
	const riva = createRiva({
		graphql: graphql(createGraphQLClient({ url: 'https://api.example.com/graphql' })),
		defaults: { staleTime: '30s' },
	}); // one per request
	await riva.graphql.query(PATIENTS_QUERY, { school }); // so the first render has data
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
- Data hydrated with a `staleTime` of 0 is refetched at once: give the riva a `defaults: { staleTime }`, or the query its own.
- With a definition, `await patients.ensure(riva, { school })` fills the riva the same way ([shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md)).

See the core's [ssr guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/ssr.md).
