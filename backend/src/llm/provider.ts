import { GoogleGenAI, Type, type Content, type FunctionDeclaration, type Schema } from "@google/genai";

export type LlmProviderName = "gemini" | "openai" | "anthropic" | "mock" | "deterministic";

export interface LlmToolParameterProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: LlmToolParameterProperty;
  properties?: Record<string, LlmToolParameterProperty>;
  required?: string[];
}

export interface LlmToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, LlmToolParameterProperty>;
    required?: string[];
  };
}

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

export interface LlmChatParams {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDeclaration[];
  schema?: Record<string, unknown>;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface LlmChatResult {
  text: string;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
}

/**
 * Interface unique d'abstraction LLM : aucun état métier, aucune pseudonymisation,
 * aucun garde-fou ni journalisation dans les adaptateurs.
 */
export interface LlmProvider {
  readonly providerName: LlmProviderName;
  readonly modelName: string;
  chat(params: LlmChatParams): Promise<LlmChatResult>;
}

export type LLMProvider = LlmProvider;

function estimateCostUsd(provider: LlmProviderName, totalTokens: number): number {
  const ratePerMillion =
    provider === "anthropic" ? 0.8 : provider === "openai" ? 0.4 : provider === "gemini" ? 0.15 : 0;
  return Number(((totalTokens / 1_000_000) * ratePerMillion).toFixed(6));
}

function toGeminiSchema(prop: LlmToolParameterProperty): Schema {
  const typeMap: Record<LlmToolParameterProperty["type"], Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };
  return {
    type: typeMap[prop.type],
    ...(prop.description ? { description: prop.description } : {}),
    ...(prop.enum ? { enum: prop.enum } : {}),
    ...(prop.items ? { items: toGeminiSchema(prop.items) } : {}),
    ...(prop.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(prop.properties).map(([k, v]) => [k, toGeminiSchema(v)])
          ),
        }
      : {}),
    ...(prop.required ? { required: prop.required } : {}),
  };
}

function toGeminiFunctionDeclarations(tools?: LlmToolDeclaration[]): FunctionDeclaration[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([k, v]) => [k, toGeminiSchema(v)])
      ),
      ...(t.parameters.required ? { required: t.parameters.required } : {}),
    },
  }));
}

export class GeminiProvider implements LlmProvider {
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

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const startedMs = Date.now();
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

    const functionDeclarations = toGeminiFunctionDeclarations(params.tools);
    const resp = await this.client.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: params.system,
        ...(functionDeclarations ? { tools: [{ functionDeclarations }] } : {}),
        ...(params.schema ? { responseMimeType: "application/json" } : {}),
      },
    });

    const inputTokens = resp.usageMetadata?.promptTokenCount ?? 300;
    const outputTokens = resp.usageMetadata?.candidatesTokenCount ?? 150;
    const totalTokens = resp.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;
    const toolCalls: LlmToolCall[] = (resp.functionCalls || []).map((fc) => ({
      id: fc.id,
      name: fc.name || "",
      args: (fc.args as Record<string, unknown>) || {},
    }));

    return {
      text: (resp.text || "").trim(),
      toolCalls,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: estimateCostUsd("gemini", totalTokens),
        durationMs: Math.max(0, Date.now() - startedMs),
      },
    };
  }
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly providerName = "openai" as const;
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, modelName?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName || "gpt-4o-mini";
    this.baseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const startedMs = Date.now();
    const messages = [
      { role: "system", content: params.system },
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
        description: t.description,
        parameters: t.parameters,
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
        ...(params.schema ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Erreur fournisseur OpenAI (${res.status})`);
    const data = (await res.json()) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };

    const msg = data.choices?.[0]?.message;
    const inputTokens = data.usage?.prompt_tokens ?? 320;
    const outputTokens = data.usage?.completion_tokens ?? 180;
    const totalTokens = data.usage?.total_tokens ?? inputTokens + outputTokens;
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
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: estimateCostUsd("openai", totalTokens),
        durationMs: Math.max(0, Date.now() - startedMs),
      },
    };
  }
}

export class AnthropicProvider implements LlmProvider {
  readonly providerName = "anthropic" as const;
  readonly modelName: string;
  private readonly apiKey: string;

  constructor(apiKey: string, modelName?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName || "claude-3-5-haiku-latest";
  }

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const startedMs = Date.now();
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
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: [
            ...(m.text ? [{ type: "text", text: m.text }] : []),
            ...m.toolCalls.map((tc, i) => ({
              type: "tool_use",
              id: tc.id || `toolu_${i}`,
              name: tc.name,
              input: tc.args,
            })),
          ],
        };
      }
      return { role: m.role === "assistant" ? "assistant" : "user", content: m.text || "" };
    });

    const tools = params.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
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
        system: params.system,
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

    const inputTokens = data.usage?.input_tokens ?? 300;
    const outputTokens = data.usage?.output_tokens ?? 150;
    const totalTokens = inputTokens + outputTokens;
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
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: estimateCostUsd("anthropic", totalTokens),
        durationMs: Math.max(0, Date.now() - startedMs),
      },
    };
  }
}

export type MockChatHandler = (
  params: LlmChatParams,
  callIndex: number
) => Promise<Partial<LlmChatResult>> | Partial<LlmChatResult>;

let globalMockChatHandler: MockChatHandler | null = null;

export function setMockLlmHandler(handler: MockChatHandler | null): void {
  globalMockChatHandler = handler;
}

export class MockProvider implements LlmProvider {
  readonly providerName = "mock" as const;
  readonly modelName: string;
  private readonly handler?: MockChatHandler;
  private callIndex = 0;

  constructor(handler?: MockChatHandler, modelName = "mock-llm-v1") {
    this.handler = handler;
    this.modelName = modelName;
  }

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const startedMs = Date.now();
    const idx = this.callIndex++;
    const activeHandler = this.handler || globalMockChatHandler;
    const raw = activeHandler ? await activeHandler(params, idx) : {};
    const inputTokens = raw.usage?.inputTokens ?? 120;
    const outputTokens = raw.usage?.outputTokens ?? 60;
    const totalTokens = raw.usage?.totalTokens ?? inputTokens + outputTokens;

    return {
      text: raw.text ?? "",
      toolCalls: raw.toolCalls ?? [],
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: raw.usage?.costUsd ?? 0,
        durationMs: raw.usage?.durationMs ?? Math.max(1, Date.now() - startedMs),
      },
    };
  }
}

export class DeterministicFallbackProvider implements LlmProvider {
  readonly providerName = "deterministic" as const;
  readonly modelName = "rules-fallback-v1";

  async chat(): Promise<LlmChatResult> {
    return {
      text: "",
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationMs: 0 },
    };
  }
}

/**
 * Fabrique Multi-LLM : sélection par LLM_PROVIDER (gemini par défaut), LLM_MODEL,
 * MockProvider pour les tests, ou repli automatique sur le moteur déterministe si la clé manque.
 */
export function createLlmProvider(override?: {
  provider?: LlmProviderName;
  model?: string;
  mockHandler?: MockChatHandler;
}): LlmProvider {
  const requested = (
    override?.provider ||
    process.env.LLM_PROVIDER ||
    ""
  ).toLowerCase() as LlmProviderName | "";
  const model = override?.model || process.env.LLM_MODEL || undefined;

  if (requested === "mock") {
    return new MockProvider(override?.mockHandler, model || "mock-llm-v1");
  }
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
