import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

const DEFAULT_MODEL = 'claude-opus-5-5';

export class AiUnavailableError extends Error {}

export function isAiConfigured(): boolean {
  return Boolean(Deno.env.get('ANTHROPIC_API_KEY'));
}

type ClaudeRequest<S extends z.ZodType> = {
  system: string;
  // Text, or text with an image or PDF, such as a receipt to read.
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: S;
  effort: 'low' | 'medium' | 'high';
};

// One structured call. Anything other than a complete, schema-valid answer is an error,
// so callers can fall back to their deterministic path rather than show partial text.
export async function askClaude<S extends z.ZodType>({ system, messages, schema, effort }: ClaudeRequest<S>): Promise<z.output<S>> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  let response;
  try {
    response = await client.beta.messages.create({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages,
      output_config: { effort, format: zodOutputFormat(schema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiUnavailableError('The AI service rejected the API key.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiUnavailableError('The AI service is rate limited.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiUnavailableError(`The AI service returned an error (${error.status}).`);
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new AiUnavailableError('The AI service declined this request.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiUnavailableError('The AI response was cut off.');
  }
  for (const block of response.content) {
    if (block.type === 'text') return schema.parse(JSON.parse(block.text));
  }
  throw new AiUnavailableError('The AI service returned no answer.');
}
