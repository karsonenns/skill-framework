export interface SecretResolution {
  ok: boolean;
  /** Human explanation when ok is false — says what's wrong and how to fix it. */
  reason?: string;
}

export interface SecretProvider {
  scheme: string;
  /**
   * Verify the secret is resolvable. sf never reads secret values into
   * compiled output — deploy only checks resolvability and fails loudly.
   */
  verify(reference: string, projectRoot: string): SecretResolution;
}
