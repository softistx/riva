# The normalized cache: `@softistx/riva/entities`

> Most call sites use the simple API (`riva.graphql`, `riva.rest`, the hooks over them). This page covers the definition, for settings several call sites share: see [Advanced: shared definitions](./shared-definitions.md).

By default a query keeps its data as is, keyed by id and variables. Pass `cache: entities()` to store each entity (an object with a string `__typename` and an `id` or `_id`) once, shared by every query that returns it. A refetch of one query then updates the others, and a `riva.get` inside a computed re-evaluates only when an entity it read changed.

```ts
import { createRiva, query } from '@softistx/riva';
import { entities, evict, invalidateEntity, readEntity, writeEntity } from '@softistx/riva/entities';

type Patient = { __typename: 'Patient'; id: string; name: string };

const cache = entities({
	keys: { Book: (b) => b['isbn'] as string }, // identity of a type (default: id, then _id)
	// identify: (obj) => 'Type:id' | undefined,    // or replace the identity rule
});

const patients = query({
	id: 'patients',
	cache,
	fetch: async () => (await fetch('/api/patients')).json() as Promise<{ items: Patient[] }>,
});
const patient = query({
	id: 'patient',
	cache,
	fetch: async (v: { id: string }) => (await fetch(`/api/patients/${v.id}`)).json() as Promise<Patient>,
});

const riva = createRiva();
await patients.ensure(riva);
await patient.ensure(riva, { id: '1' });

writeEntity(riva, 'Patient:1', { name: 'Ann' }); // merged; both queries see it
writeEntity(riva, 'Patient:1', (prev) => ({ visits: (prev?.['visits'] as number) + 1 }));
readEntity(riva, 'Patient:1'); // tracked inside a computed; undefined when missing
invalidateEntity(riva, 'Patient:1'); // marks stale every query reaching it, refetches observed ones
evict(riva, 'Patient:1'); // removes it: queries see the field as missing
```

## Options of `entities(opts?, codec?)`

| Option | Default | Effect |
| --- | --- | --- |
| `keys` | `id`, then `_id` | `{ Type: (obj) => string }`: the identity of a type. |
| `identify` | the rule above | `(obj) => 'Type:id' \| undefined`: replaces the identity rule altogether. |
| `codec` (2nd argument) | the plain walker | An `EntityCodec` (see below). |

## What is stored

- Entities are merged field by field into one store per riva (two riva instances never share). Nested entities, and entities inside arrays, are normalized too; other objects stay inline. An entity unchanged since the last read keeps its identity.
- A query entry holds the entities it reaches. When the entry is replaced or collected (`gcTime`) they are released, and an entity nobody holds is removed. Entities that reference each other are collected too; a cycle is cut where it loops back when read.
- A ref to a missing entity reads as `undefined`, never throws.
- Data that is not JSON (a function, a class instance other than `Date`, a bigint, a cycle) throws `RIVA_CACHE`; nothing is written.
- A plain read skips fields stored under a key holding `(`, the argument fields a selection-aware codec writes.
- The plain walker stores every field of an object. A GraphQL selection-aware one (arguments, aliases, fragments) is `normalized()` from `@softistx/riva-graphql/cache`, built on the codec below.

## A miss is refetched, or an error

When an observed entry's stored data stops reading (`read` returns `undefined`, for example an evicted entity), the engine refetches it, and `ensure` fetches too rather than resolve nothing. When a fetch's own result cannot be read back, the entry ends in the error status with code `RIVA_CACHE` and `ensure` rejects with it; nothing loops, and the error clears once the data reads again. Optimistic layers and `derive` never trigger it. A refused `setData` throws `RIVA_CACHE` and leaves the entry untouched.

## A codec of your own

`entities(opts, codec)` takes an `EntityCodec` that decides how data becomes entities and back, for data whose shape a plain walk cannot know:

```ts
import { entities, type EntityCodec } from '@softistx/riva/entities';

const codec: EntityCodec = {
	// `reader.identify(obj)` gives `Type:id`; nothing is merged until `pending` is returned whole.
	normalize: (reader, data, vars) => ({
		root: { vars, data }, // what the entry keeps
		pending: new Map([['Patient:1', { name: 'Ada' }]]), // fields to merge, by entity
	}),
	// Runs in a computed: read entities through `reader.fields`, so the read is tracked.
	denormalize: (reader, root) => ({ name: reader.fields('Patient:1')?.['name'] }),
};

const cache = entities(undefined, codec);
```

`EntityReader` is what a codec sees of the store: `identify`, `peek` (committed, untracked) and `fields` (tracked, layers applied). Return `undefined` from `denormalize` for a miss: the engine then refetches.

## The `CachePolicy` hook

`CachePolicy`, exported from the main entry, is the hook behind it: `write(riva, data, prev, vars)`, `read(riva, stored, committed)`, `release(riva, stored)`, and for mutations the optional `layer(riva, data, vars)` (an optimistic layer, `{ drop() }`) and `commit(riva, data, vars)`. `vars` are the variables of the query or mutation that gave `data`.

## Traps

- A riva has one entity store, shared by every policy on it (GraphQL, REST, plain). Their `keys` merge per type: a type keyed by the same function in two policies is fine, by two different functions throws `RIVA_CACHE`, and so does a `keys` entry for a type the store already holds (create policies before `readEntity`/`writeEntity`). A custom `identify` is exclusive: no other `identify` or `keys` can join it. A policy with no rules joins any store.
- Entity refs are `Type:id` strings: `Patient:1`.

`identifyOf(policy, obj)` applies that policy's own rules only; `identifyOf(riva, obj)` gives the ref the riva's store uses (every policy's keys merged).

Exports: `entities`, `readEntity`, `writeEntity`, `invalidateEntity`, `evict`, `identifyOf`, `isPlain`, `isRef`; types `EntityPolicy`, `EntitiesOptions`, `Identify`, `Fields`, `EntityCodec`, `EntityReader`, `Normalized`, `Ref`.
