export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID" | "CONFLICT" = "INVALID",
  ) {
    super(message);
    this.name = "DomainError";
  }
}
