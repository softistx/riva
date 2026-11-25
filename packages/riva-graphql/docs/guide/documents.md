# Documents

Read this first: every definition is built from a typed document, so the document rules decide what the rest infers.

## What it is for

`query()`, `mutation()` and `infinite()` take a `TypedDocumentNode` written with the client preset's `graphql()` function. Variables and data are inferred from it; you never annotate them.

## Write the documents

Hold each document in a `SCREAMING_SNAKE_CASE` constant (`PATIENTS_QUERY`). Codegen derives the PascalCase types and, with `persistedDocuments`, a hash per operation.

```ts
// app/patients/graphql.ts
import { graphql } from '../generated/gql';

export const PATIENTS_QUERY = graphql(`
	query Patients($school: ID!, $first: Int, $after: String) {
		patients(school: $school, first: $first, after: $after) {
			__typename
			edges { __typename node { __typename id name } cursor }
			pageInfo { __typename hasNextPage endCursor }
		}
	}
`);

export const RENAME_PATIENT_MUTATION = graphql(`
	mutation RenamePatient($id: ID!, $name: String!) {
		renamePatient(id: $id, name: $name) { __typename id name }
	}
`);
```

## The rules

| Rule | Why |
|---|---|
| One named operation per document (`query` or `mutation`) | The definition reads the operation's name and kind. |
| `documentMode: 'documentNode'` (the preset's default) | A `TypedDocumentString` is refused: a definition reads the document's operation. |
| `__typename` selected below the root | Required by `normalized()`; the preset's `addTypenameSelectionDocumentTransform` adds it. |
| Unique operation names | The default definition `id` is the persisted id, else the name. |

## Traps

- A document that is not exactly one named query or mutation is refused when the definition is created, with a `RivaError` (`RIVA_DEFINITION`) that says why: no operation, several operations, no name, a subscription, or the wrong helper (`query()` on a mutation).
- A `TypedDocumentString` (`documentMode: 'string'`) is refused for the same reason.
- Never rewrite a document at runtime: a persisted id is the hash of its text.

See [queries](./queries.md), [mutations](./mutations.md) and [codegen](./codegen.md).
