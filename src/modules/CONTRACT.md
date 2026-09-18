# Modules

Publishes shared room geometry for placement tables.

`buildModules()` returns `{catalog, files}`. Catalog follows
[modules.schema.json](../../schemas/modules.schema.json); files is a map from
relative filename to GLB bytes. `npm run modules -- --out <dir>` writes both.

There are nine fixed room modules and eight stair flight variants. The authored
construction unit is 0.5 m. Stairs use 0.28 m treads and 0.17 m nominal risers;
placement scales their width and rise while preserving tread depth. Origin is the
vector from bounds minimum to authored zero. Size is XYZ bounds extent.

Every primitive is indexed. GLBs use quantization and meshopt compression, canonical
material keys and no texture images. The same source gives identical files and
manifest bytes. Triangle and byte counts describe the published files.

Depends on [GLB](../glb/CONTRACT.md), glTF Transform and meshoptimizer.
The compression pipeline follows the [upstream implementation](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/functions/src/meshopt.ts).
