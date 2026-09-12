# CONTRACT: preview samples

Purpose: configures a generated room review and its initial camera.

- `previewSample(name) -> PreviewSample | undefined`: resolves `luxury`; unknown names use the ordinary preview. [Schema](schema.ts) links fixture and assignment inputs to the root types.
- `showSample(sample, state, viewer, viewIndex = 0) -> void`: selects the configured floor and furniture's room, then places the camera at its published offset and 1.65 m eye height. Missing furniture leaves the floor overview; an absent view index changes nothing.
- `luxury.json` uses full-size procedural furniture and a double-height residence above a lobby, with kitchen, living and salon views.

Depends on [root](../../../CONTRACT.md), [UI](../CONTRACT.md).
