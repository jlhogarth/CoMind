export class SchemaContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaContractError";
  }
}
