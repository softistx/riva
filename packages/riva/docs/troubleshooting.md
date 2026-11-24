# Troubleshooting

Each entry is headed by the message you will see.

## No RivaClient in scope

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `atom.get()`, `.set()`, `.subscribe()` or `computed.get()` ran outside any client, on the server or in a browser with no default client.

**Why:** definitions are stateless and hold no value; values live in a `RivaClient`. A module-level client on the server would leak between requests, so none is assumed.

**Fix:** read through the client, or run the code inside it.

```ts
const client = createRivaClient(); // one per request on the server
client.get(count);
client.run(() => count.get());
```

## setDefaultClient is browser-only

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `setDefaultClient(client)` ran where there is no `document`, that is on the server.

**Why:** a default client is module-level state; shared between requests it would mix one user's values into another's.

**Fix:** call it only in browser code. On the server, use the per-request client with `client.run(() => …)`. `setDefaultClient(undefined)` clears the default in a browser.

```ts
if (typeof document !== 'undefined') setDefaultClient(createRivaClient());
```

## Cycle detected

Code: `RIVA_CYCLE`.

**When:** a computed reads itself, directly or through other computeds.

**Why:** its value would depend on itself and can never settle.

**Fix:** break the loop: derive from atoms, or move one side to an atom you set explicitly. Name computeds (`computed(fn, { name })`) so the message names the culprit.

```ts
const total = computed((get) => get(price) * get(quantity)); // not get(total)
```

## Loop detected

Code: `RIVA_LOOP`.

**When:** a node re-ran more than 100 times in one flush, typically an effect or subscriber that writes a source it reads.

**Why:** each write re-triggers the node, so the flush never ends. The loop is cut and the error is thrown after the other notifications ran.

**Fix:** make the write converge (guard it with a condition), write to a different atom, or read the source with `untracked`. Name the node with `{ name }` to find it.

```ts
client.effect(() => {
	const n = client.get(count);
	if (n < 5) client.set(count, n + 1); // converges
});
```
