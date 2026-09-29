/** Authored lift-car coordinates, shared by the module and its interactive consumer.
 * They are scaled with the published car placement; no world-sized panel guesses. */
export const LIFT_CAR = {
    width: 2.30, depth: 2.30, wall: 0.08, floor: 0.10,
    ceiling: 2.50, roof: 0.10, doorWidth: 1.10,
    panel: { center: [0.80, 1.20, -1.025] as const,
        screen: [0.80, 1.475, -1.026] as const,
        buttons: [
            { action: 'up', position: [0.7425, 1.3225, -1.024] },
            { action: 'down', position: [0.8625, 1.3225, -1.024] },
            { action: 'open', position: [0.7425, 1.1825, -1.024] },
            { action: 'close', position: [0.8625, 1.1825, -1.024] },
            { action: 'go', position: [0.7425, 1.0425, -1.024] },
            { action: 'cancel', position: [0.8625, 1.0425, -1.024] },
        ] as const },
    lens: { center: [0, 2.445, 0] as const, width: 1.50, depth: 1.65, lumens: 1600 },
    /** The car's own front, placed at the car front plane (local z = 0, -z towards the
     *  landing) and scaled across the car only, so its depths and heights stay metres. Two
     *  leaves `leaf` wide meet at x = 0 and tuck behind the car's cheeks, standing from
     *  `bottom` to `height` in `plane`, the clearance between the landing leaves and the car.
     *  The fixed head closes the front from `head` up, and the sill the leaves run on reaches
     *  `sill` ahead of the car floor, where the landing's threshold stops. */
    door: { leaf: 0.575, bottom: 0.004, height: 2.21, head: 2.205, plane: [-0.042, -0.004] as const, sill: 0.049 },
} as const;

/** A landing's leaves: `leaf` wide each and meeting at the module's zero, so a shut pair is
 *  wider than the doorway and each tucks behind its jamb; `plane` is their depth about the
 *  wall line and `height` the doorway head they close. */
export const LIFT_LANDING = { leaf: 0.56, height: 2.20, plane: [-0.03, 0.03] as const } as const;

/** The shaft side of a landing's wall line: the cheeks beside the doorway and the face above
 *  the landing head stand `depth` into the shaft from the wall line, short of the car's
 *  leaves, and the face rises from `faceFrom`, inside the landing head, to the next floor. */
export const LIFT_SHAFT_FRONT = { depth: 0.05, faceFrom: 2.25 } as const;
