import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";

export type LlmProviderName = "gemini" | "openai" | "anthropic" | "deterministic";

export interface LlmToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: "user" | "assistant" | "tool";
  text?: string;
  toolCalls?: LlmToolCall[];
  toolResult?: {
    callId?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export interface LlmGenerateParams {
  systemInstruction: string;
  messages: LlmMessage[];
  tools?: FunctionDeclaration[];
  jsonSchema?: Record<string, unknown>;
}

export interface LlmGenerateResult {
  text: string;
  toolCalls: LlmToolCall[];
  tokensUsed: number;
  costUsd: number;
}

export interface LlmProvider {
  readonly providerName: LlmProviderName;
  readonly modelName: string;
  generate(params: LlmGenerateParams): Promise<LlmGenerateResult>;
}

function estimateCostUsd(provider: LlmProviderName, tokens: number): number {
  const ratePerMillion =
    provider === "anthropic" ? 0.8 : provider === "openai" ? 0.4 : provider === "gemini" ? 0.15 : 0;
  return Number(((tokens / 1_000_000) * ratePerMillion).toFixed(6));
}

class GeminiProvider implements LlmProvider {
  readonly providerName = "gemini" as const;
  readonly modelName: string;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, modelName?: string) {
    this.modelName = modelName || "gemini-3.8-flash";
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }

  async generate(params: LlmGenerateParams): Promise<LlmGenerateResult> {
    const contents: Content[] = params.messages.map((m) => {
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "model",
          parts: m.toolCalls.map((c) => ({
            functionCall: { id: c.id, name: c.name, args: c.args },
          })),
        };
      }
      if (m.role === "tool" && m.toolResult) {
        return {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: m.toolResult.callId,
                name: m.toolResult.name,
                response: m.toolResult.response,
              },
            },
          ],
        };
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text || "" }],
      };
    });

    const resp = await this.client.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: params.systemInstruction,
        ...(params.tools?.length ? { tools: [{ functionDeclarations: params.tools }] } : {}),
        ...(params.jsonSchema ? { responseMimeType: "application/json" } : {}),
      },
    });

    const tokensUsed = resp.usageMetadata?.totalTokenCount ?? 450;
    const toolCalls: LlmToolCall[] = (resp.functionCalls || []).map((fc) => ({
      id: fc.id,
      name: fc.name || "",
      args: (fc.args as Record<string, unknown>) || {},
    }));

    return {
      text: (resp.text || "").trim(),
      toolCalls,
      tokensUsed,
      costUsd: estimateCostUsd("gemini", tokensUsed),
    };
  }
}

class OpenAiCompatibleProvider implements LlmProvider {
  readonly providerName = "openai" as const;
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, modelName?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName || "gpt-4o-mini";
    this.baseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async generate(params: LlmGenerateParams): Promise<LlmGenerateResult> {
    const messages = [
      { role: "system", content: params.systemInstruction },
      ...params.messages.map((m) => {
        if (m.role === "tool" && m.toolResult) {
          return {
            role: "tool",
            tool_call_id: m.toolResult.callId || m.toolResult.name,
            content: JSON.stringify(m.toolResult.response),
          };
        }
        if (m.role === "assistant" && m.toolCalls?.length) {
          return {
            role: "assistant",
            content: m.text || null,
            tool_calls: m.toolCalls.map((tc, i) => ({
              id: tc.id || `call_${i}`,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          };
        }
        return { role: m.role === "assistant" ? "assistant" : "user", content: m.text || "" };
      }),
    ];

    const tools = params.tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelName,
        messages,
        ...(tools?.length ? { tools } : {}),
        ...(params.jsonSchema ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Erreur fournisseur OpenAI (${res.status})`);
    const data = (await res.json()) as {
      usage?: { total_tokens?: number };
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };

    const msg = data.choices?.[0]?.message;
    const tokensUsed = data.usage?.total_tokens ?? 500;
    const toolCalls: LlmToolCall[] = (msg?.tool_calls || []).map((tc) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }
      return { id: tc.id, name: tc.function?.name || "", args: parsedArgs };
    });

    return {
      text: (msg?.content || "").trim(),
      toolCalls,
      tokensUsed,
      costUsd: estimateCostUsd("openai", tokensUsed),
    };
  }
}

class AnthropicProvider implements LlmProvider {
  readonly providerName = "anthropic" as const;
  readonly modelName: string;
  private readonly apiKey: string;

  constructor(apiKey: string, modelName?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName || "claude-3-5-haiku-latest";
  }

  async generate(params: LlmGenerateParams): Promise<LlmGenerateResult> {
    const messages = params.messages.map((m) => {
      if (m.role === "tool" && m.toolResult) {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolResult.callId || m.toolResult.name,
              content: JSON.stringify(m.toolResult.response),
            },
          ],
        };
      }
      return { role: m.role === "assistant" ? "assistant" : "user", content: m.text || "" };
    });

    const tools = params.tools?.map((t) => ({
      name: t.name,
      description: t.description || "",
      input_schema: t.parameters || { type: "object", properties: {} },
    }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 1024,
        system: params.systemInstruction,
        messages,
        ...(tools?.length ? { tools } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Erreur fournisseur Anthropic (${res.status})`);

    const data = (await res.json()) as {
      usage?: { input_tokens?: number; output_tokens?: number };
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
    };

    const tokensUsed = (data.usage?.input_tokens ?? 300) + (data.usage?.output_tokens ?? 150);
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n")
      .trim();
    const toolCalls: LlmToolCall[] = (data.content || [])
      .filter((c) => c.type === "tool_use")
      .map((c) => ({ id: c.id, name: c.name || "", args: c.input || {} }));

    return {
      text,
      toolCalls,
      tokensUsed,
      costUsd: estimateCostUsd("anthropic", tokensUsed),
    };
  }
}

class DeterministicFallbackProvider implements LlmProvider {
  readonly providerName = "deterministic" as const;
  readonly modelName = "rules-fallback-v1";

  async generate(): Promise<LlmGenerateResult> {
    return { text: "", toolCalls: [], tokensUsed: 0, costUsd: 0 };
  }
}

/**
 * Fabrique Multi-LLM : permet de changer de fournisseur (Gemini, OpenAI, Anthropic,
 * ou repli déterministe) par configuration sans modifier la logique de l'agent.
 */
export function createLlmProvider(override?: {
  provider?: LlmProviderName;
  model?: string;
}): LlmProvider {
  const requested = (
    override?.provider ||
    process.env.LLM_PROVIDER ||
    ""
  ).toLowerCase() as LlmProviderName | "";
  const model = override?.model || process.env.LLM_MODEL || undefined;

  if (requested === "deterministic") return new DeterministicFallbackProvider();
  if (requested === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAiCompatibleProvider(
      process.env.OPENAI_API_KEY,
      model,
      process.env.OPENAI_BASE_URL
    );
  }
  if (requested === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, model);
  }
  if (requested === "gemini" && process.env.GEMINI_API_KEY) {
    return new GeminiProvider(process.env.GEMINI_API_KEY, model);
  }

  if (!requested) {
    if (process.env.GEMINI_API_KEY) return new GeminiProvider(process.env.GEMINI_API_KEY, model);
    if (process.env.OPENAI_API_KEY) {
      return new OpenAiCompatibleProvider(
        process.env.OPENAI_API_KEY,
        model,
        process.env.OPENAI_BASE_URL
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, model);
    }
  }

  return new DeterministicFallbackProvider();
}
