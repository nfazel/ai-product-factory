import { DomainError } from "@/modules/shared/errors";

export type SourceControlKind =
  | "AUTH"
  | "PERMISSION"
  | "UNAVAILABLE"
  | "RATE_LIMIT"
  | "DIVERGENCE"
  | "REJECTED"
  | "NOT_FOUND";

export class SourceControlFailure extends DomainError {
  readonly kind: SourceControlKind;

  constructor(message: string, kind: SourceControlKind = "UNAVAILABLE") {
    super(message, kind === "NOT_FOUND" ? "NOT_FOUND" : "INVALID");
    this.name = "SourceControlFailure";
    this.kind = kind;
  }
}
