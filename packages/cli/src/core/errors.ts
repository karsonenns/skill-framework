/** A user-facing error: message already says what's wrong, where, and how to fix it. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
