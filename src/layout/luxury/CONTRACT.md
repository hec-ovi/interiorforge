# Luxury furnishing

Fits full-size furniture groups inside a room's available space.

Input: [GroupFit](schema.ts), room bounds, seeded candidate order and a clearance predicate. Output: [FittedGroup](schema.ts) or null. Depends on Layout's room and furniture contracts.

[Recipes](recipes.json) define facing seats around tables, kitchens with a working aisle and breakfast stools, and beds with side access. All pieces keep their authored size. Quarter turns and 0.5 m placement steps fit the group; the whole group and its free access space must pass the supplied clearance predicate. Failure places nothing. Results are deterministic.

Layout applies these groups to rich and high-rich rooms, then reserves the accepted group against later furniture. Smaller rooms retain their room program when a group does not fit.
