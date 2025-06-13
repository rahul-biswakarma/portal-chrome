export type Role = 'user' | 'model';

export type MetadataValue = string | number | boolean | Date | null | Record<string, unknown>;

export interface GeminiMessage {
  role: Role;
  parts: MessagePart[];
}

interface TextPart {
  text: string;
}

interface ImagePart {
  inline_data: {
    data: string;
    mime_type: string;
  };
}

export type MessagePart = TextPart | ImagePart;

export interface GeminiRequestOptions {
  apiKey: string;
  messages: GeminiMessage[];
  modelName: string;
  sessionId?: string;
  temperature?: number;
}

export interface ApiParameters {
  model: string;
  temperature: number;
  maxTokens: number;
}
