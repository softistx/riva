---
'@softistx/riva-graphql': minor
---

Add the GraphQL transport: `query`, `mutation` and the opt-in `@softistx/riva-graphql/infinite` entry's `infinite`, typed from a `TypedDocumentNode` with ids from the persisted hash or the operation name; `provideGraphQL` and `graphqlClientTransport` over `@softistx/graphql-client`, with its errors mapped to `RivaError`s; and `@softistx/riva-graphql/codegen`, which builds the allowlist manifest a BFF's `/_data` route reads from the client preset's `persisted-documents.json`, keeping its hash keys so ids match `__meta__.hash`.
