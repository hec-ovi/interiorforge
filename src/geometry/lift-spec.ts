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
} as const;
