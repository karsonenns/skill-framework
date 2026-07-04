/** Token estimation: ~4 characters per token. No LLM, no tokenizer dependency. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
