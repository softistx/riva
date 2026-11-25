---
'@softistx/riva-react-router': minor
---

Add the React Router host: `rivaMiddleware` (from `/server`) makes one `RivaClient` per request and sets it as the ambient scope of the whole request, `rivaOf(context)` and `riva(context)` read it and put its snapshot in loader data under `~riva`, and `RivaRouterProvider` hydrates each match's snapshot (the first render before its children, later ones without touching observed entries during a render) and renders `RivaProvider`. A request with no middleware throws `RIVA_SCOPE`.
