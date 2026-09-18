# Preview samples

Configures generated room review cameras.

`previewSample(name)` returns a [sample](schema.ts) or undefined.
`showSample(sample, state, viewer, viewIndex?)` selects its floor and room and places
the eye camera. Missing furniture leaves the floor overview.

The luxury sample uses three single storey layouts. JSON supplies fixture settings,
assignments, labels and camera offsets. Depends on [Preview](../CONTRACT.md).
