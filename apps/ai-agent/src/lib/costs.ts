/**
 * LLM cost tracking utility.
 * Prices in USD per 1 million tokens (as of early 2026).
 */

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o':          { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':     { input: 10.00, output: 30.00 },
  'gpt-4':           { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':   { input: 0.50,  output: 1.50  },
};

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_COSTS[model] ?? MODEL_COSTS['gpt-4o']!;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

/**
 * Extracts token usage and calculates cost from a LangChain response.
 * usage_metadata is populated by @langchain/openai automatically.
 */
export function extractUsage(
  response: { usage_metadata?: { input_tokens?: number; output_tokens?: number } | null },
  model: string,
): LlmUsage {
  const inputTokens = response.usage_metadata?.input_tokens ?? 0;
  const outputTokens = response.usage_metadata?.output_tokens ?? 0;
  return { inputTokens, outputTokens, cost: calcCost(model, inputTokens, outputTokens) };
}
