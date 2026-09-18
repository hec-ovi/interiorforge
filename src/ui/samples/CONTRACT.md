# Preview samples

Configures generated room review cameras.

`previewSample(name)` returns a [sample](schema.ts) or undefined.
`showSample(sample, state, viewer, viewIndex?)` selects its floor and room and places
the eye camera. Missing furniture leaves the floor overview.

The luxury sample is a three-floor fixture (ground, middle, crown). JSON supplies
fixture settings, assignments, view titles, furniture kinds, offsets and headings.
Depends on [Preview](../CONTRACT.md).
