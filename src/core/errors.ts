export type InteriorErrorCode =
  | "E_BLUEPRINT_INVALID"
  | "E_SHELL_MISMATCH"
  | "E_ASSIGNMENT_INVALID"
  | "E_FLOOR_TOO_SMALL"
  | "E_UNREACHABLE_SPACE"
  | "E_MATERIAL_UNRESOLVED";

export class InteriorError extends Error {
  readonly code: InteriorErrorCode;
  readonly floor?: number;

  constructor(code: InteriorErrorCode, detail: string, floor?: number) {
    super(floor === undefined ? `${code}: ${detail}` : `${code} (floor ${floor}): ${detail}`);
    this.name = "InteriorError";
    this.code = code;
    this.floor = floor;
  }
}
