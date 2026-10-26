export class IngestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
