# Preview samples

Configures generated room review cameras.

`previewSample(name)` returns a [sample](schema.ts) or undefined.
`showSample(sample, state, viewer, viewIndex?)` selects its floor and room and places
the eye camera at a piece of furniture or in the largest room of a kind. A view its
floor cannot place leaves the floor overview.

The luxury sample is a three-floor fixture (ground, middle, crown). The
[plan samples](plans.json) (hotel, restaurant, residence) name a published kit plan
under the shared resources root and the building it is generated as. JSON supplies
fixture settings, assignments, building, view titles, furniture kinds or room kinds,
offsets and headings.
Depends on [Preview](../CONTRACT.md).
