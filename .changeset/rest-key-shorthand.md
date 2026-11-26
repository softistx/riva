---
'@softistx/riva-rest': minor
---

`restEntities` accepts a key function alone as a type, `restEntities({ Invoice: (o) => o['id'] as string })`: an object is of the type when the function returns an id, and the full `{ is, key }` form is unchanged.
