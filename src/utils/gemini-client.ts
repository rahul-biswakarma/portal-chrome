import type { TreeNode, TailwindClassData } from '../types';
import { getEnvVariable } from '../utils/environment';

// Define types for chat session management
type Role = 'user' | 'model';

// Define a more specific type for metadata values
type MetadataValue =
  | string
  | number
  | boolean
  | Date
  | null
  | Record<string, unknown>;

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

// Chat session management
class ChatSession {
  id: string;
  messages: GeminiMessage[];
  createdAt: Date;
  lastUpdated: Date;
  metadata: Record<string, MetadataValue>;
  maxHistoryLength: number;

  constructor(
    id: string,
    initialMessages: GeminiMessage[] = [],
    maxHistoryLength = 10,
  ) {
    this.id = id;
    this.messages = initialMessages;
    this.createdAt = new Date();
    this.lastUpdated = new Date();
    this.metadata = {};
    this.maxHistoryLength = maxHistoryLength;
  }

  addMessage(role: Role, parts: MessagePart[]) {
    // Ensure we're creating a deep copy of the parts array to prevent reference issues
    const partsCopy = parts.map((part) => {
      if ('text' in part) {
        return { text: part.text };
      } else if ('inline_data' in part) {
        return {
          inline_data: {
            data: part.inline_data.data,
            mime_type: part.inline_data.mime_type,
          },
        };
      }
      return part;
    });

    this.messages.push({ role, parts: partsCopy });
    this.lastUpdated = new Date();

    // Prune history if needed
    this.pruneHistory();
  }

  pruneHistory() {
    // Keep the last N messages to control token usage
    if (this.messages.length > this.maxHistoryLength) {
      // Keep only the most recent messages
      this.messages = this.messages.slice(-this.maxHistoryLength);
    }
  }

  getMessages(): GeminiMessage[] {
    // Create a deep copy of the messages to prevent reference issues
    return this.messages.map((msg) => ({
      role: msg.role,
      parts: msg.parts.map((part) => {
        if ('text' in part) {
          return { text: part.text };
        } else if ('inline_data' in part) {
          return {
            inline_data: {
              data: part.inline_data.data,
              mime_type: part.inline_data.mime_type,
            },
          };
        }
        return part;
      }),
    }));
  }

  setMetadata(key: string, value: MetadataValue) {
    this.metadata[key] = value;
  }

  getMetadata(key: string): MetadataValue | undefined {
    return this.metadata[key];
  }
}

// Singleton to manage chat sessions
class ChatSessionManager {
  private static instance: ChatSessionManager;
  private sessions: Map<string, ChatSession> = new Map();

  private constructor() {}

  static getInstance(): ChatSessionManager {
    if (!ChatSessionManager.instance) {
      ChatSessionManager.instance = new ChatSessionManager();
    }
    return ChatSessionManager.instance;
  }

  createSession(
    id: string,
    initialMessages: GeminiMessage[] = [],
  ): ChatSession {
    const session = new ChatSession(id, initialMessages);
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  getOrCreateSession(id: string): ChatSession {
    let session = this.getSession(id);
    if (!session) {
      session = this.createSession(id);
    }
    return session;
  }

  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }
}

// Export the chat session manager for use across the application
export const chatManager = ChatSessionManager.getInstance();

// Default API parameters
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Get environment variables or use defaults
const getApiParameters = async () => {
  const model = (await getEnvVariable('GEMINI_MODEL')) || DEFAULT_MODEL;

  return {
    model,
  };
};

/**
 * Get the stored Gemini API key
 * @returns Promise resolving to the API key or null if not set
 */
export const getGeminiApiKey = async (): Promise<string | null> => {
  try {
    const apiKey = await getEnvVariable('GEMINI_API_KEY');
    return apiKey || null;
  } catch (error) {
    console.error('Error getting Gemini API key:', error);
    return null;
  }
};

/**
 * Check if an image data URL is valid
 * @param imageData The image data URL
 * @returns Whether the data URL is valid
 */
export const isValidImageData = (imageData: string): boolean => {
  return (
    typeof imageData === 'string' &&
    imageData.startsWith('data:image/') &&
    imageData.includes('base64,')
  );
};

/**
 * Convert data URL to base64
 * @param dataUrl The data URL
 * @returns Base64 data
 */
const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

/**
 * Make a Gemini API request specifically for CSS generation using structured outputs
 * @param apiKey The Gemini API key
 * @param messages Messages to send to Gemini
 * @param model Gemini model to use
 * @param sessionId Optional session ID
 * @returns The generated CSS content
 */
async function makeCSSGenerationRequest(
  apiKey: string,
  messages: GeminiMessage[],
  model: string,
  sessionId?: string,
): Promise<string> {
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

  const session = sessionId
    ? chatManager.getOrCreateSession(sessionId)
    : chatManager.createSession(`css_session_${Date.now()}`);

  // Add new messages to the session
  messages.forEach((msg) => {
    session.addMessage(msg.role, msg.parts);
  });

  // Get all messages from the session
  const sessionMessages = session.getMessages();

  try {
    // Make the API request with structured output for CSS
    const requestBody = {
      contents: sessionMessages,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            css: {
              type: 'string',
              description:
                'Pure CSS code without any comments, explanations, or markdown. Only valid CSS selectors and properties.',
            },
          },
          required: ['css'],
        },
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
    ) {
      const jsonResponse = data.candidates[0].content.parts[0].text.trim();

      try {
        // Parse the structured JSON response
        const parsedResponse = JSON.parse(jsonResponse);

        if (parsedResponse.css && typeof parsedResponse.css === 'string') {
          // Add the CSS response to the session
          session.addMessage('model', [{ text: parsedResponse.css }]);
          return parsedResponse.css.trim();
        } else {
          throw new Error('Invalid CSS structure in response');
        }
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        console.error('Raw response:', jsonResponse);
        throw new Error('Failed to parse structured CSS response');
      }
    } else {
      console.error('Unexpected API response structure:', data);
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error making CSS generation request:', error);
    throw error;
  }
}

/**
 * Generate CSS using Gemini API
 * @param apiKey The Gemini API key
 * @param prompt The user prompt
 * @param portalClassTree The portal class tree
 * @param tailwindData The tailwind class data
 * @param currentCSS The current CSS
 * @param retryCount The retry count (default 0)
 * @param referenceImage Optional reference image
 * @param currentScreenshot Optional current screenshot
 * @param computedStyles Optional computed styles
 * @param sessionId Optional session ID for continuous conversation
 * @returns Promise resolving to the generated CSS
 */
export const generateCSSWithGemini = async (
  apiKey: string,
  prompt: string,
  portalClassTree: TreeNode,
  tailwindData: TailwindClassData,
  currentCSS: string = '',
  retryCount: number = 0,
  referenceImage?: string,
  currentScreenshot?: string,
  computedStyles?: Record<string, Record<string, string>>,
  sessionId?: string,
): Promise<string> => {
  const { model } = await getApiParameters();

  // Process the tailwind data without additional filtering
  const simplifiedTailwindData: Record<string, string[]> = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach((selector) => {
      simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
        ? tailwindData[selector]
        : [];
    });
  }

  // Create an enhanced tree that includes Tailwind classes and computed styles
  const enhancedTree = createEnhancedClassTree(
    portalClassTree,
    simplifiedTailwindData || {},
    computedStyles,
  );

  // Create a readable hierarchical representation of the DOM with styles
  const hierarchyData = formatEnhancedTree(enhancedTree);

  // Format computed styles if available
  let computedStylesText = '';
  if (computedStyles && Object.keys(computedStyles).length > 0) {
    computedStylesText = Object.entries(computedStyles)
      .map(([className, styles]) => {
        return `.${className}: ${JSON.stringify(styles, null, 2)}`;
      })
      .join('\n\n');
  }

  // Create the main prompt
  const promptText = `You are an expert CSS developer. Your task is to generate CSS based on a text description and reference images.

USER REQUEST:
"${prompt}"

DOM STRUCTURE:
${hierarchyData || 'No DOM structure available.'}

${computedStylesText ? `COMPUTED STYLES:\n${computedStylesText}\n\n` : ''}

CURRENT CSS:
${currentCSS || 'No existing CSS.'}

CSS GENERATION INSTRUCTIONS:
1. Generate valid CSS code that matches the user's description.
2. Use ONLY selectors targeting classes that start with "portal-" (e.g., .portal-header).
3. Your response should be COMPLETE CSS, including all necessary styles.
4. Do NOT include any comments, markdown, or explanations in your output - just pure CSS.
5. When overriding Tailwind, prefer higher specificity selectors over !important (e.g., .portal-card.portal-card instead of !important).
6. Only use !important when absolutely necessary for critical overrides.
7. If there is existing CSS, incorporate it into your solution with improvements.
8. Focus on creating pixel-perfect styling that matches the provided reference images.
${retryCount > 0 ? `9. This is iteration ${retryCount + 1}. Focus on improving the match to the reference design.` : ''}

RESPOND ONLY WITH VALID CSS CODE. DO NOT INCLUDE COMMENTS OR EXPLANATIONS.`;

  // Build the message parts - start with just the text prompt
  const parts: MessagePart[] = [{ text: promptText }];

  // Add images as separate parts with inline_data (not inside the text)
  if (referenceImage && isValidImageData(referenceImage)) {
    const imgData = dataUrlToBase64(referenceImage);
    const mimeType = referenceImage.split(';')[0].split(':')[1];
    parts.push({
      inline_data: {
        data: imgData,
        mime_type: mimeType,
      },
    });
  }

  if (currentScreenshot && isValidImageData(currentScreenshot)) {
    const imgData = dataUrlToBase64(currentScreenshot);
    const mimeType = currentScreenshot.split(';')[0].split(':')[1];
    parts.push({
      inline_data: {
        data: imgData,
        mime_type: mimeType,
      },
    });
  }

  // Prepare the messages for Gemini
  const messages: GeminiMessage[] = [
    {
      role: 'user',
      parts,
    },
  ];

  // Generate a session ID if not provided or use existing one for continuity
  const chatSessionId = sessionId || `css_gen_${Date.now()}`;

  try {
    // Use the makeCSSGenerationRequest function
    const content = await makeCSSGenerationRequest(
      apiKey,
      messages,
      model,
      chatSessionId,
    );

    // No need to clean response since it's already structured CSS
    return content;
  } catch (error) {
    console.error('Error generating CSS with Gemini:', error);
    throw error;
  }
};

/**
 * Evaluate CSS results using Gemini API
 * @param apiKey The Gemini API key
 * @param referenceImage The reference image data URL
 * @param resultScreenshot The screenshot with applied CSS
 * @param currentCSS The current applied CSS
 * @param portalClassTree The portal class tree structure
 * @param tailwindData The tailwind class data
 * @param computedStyles The computed styles for each portal-* class element
 * @param sessionId Optional session ID for continuous conversation
 * @returns Promise resolving to evaluation results {isMatch: boolean, feedback: string}
 */
export const evaluateCSSResultWithGemini = async (
  apiKey: string,
  referenceImage: string,
  resultScreenshot: string,
  currentCSS: string,
  portalClassTree?: TreeNode,
  tailwindData?: TailwindClassData,
  computedStyles?: Record<string, Record<string, string>>,
  sessionId?: string,
): Promise<{ isMatch: boolean; feedback: string }> => {
  const { model } = await getApiParameters();

  // Process the tree and tailwind data if available
  let hierarchyData = '';

  if (portalClassTree) {
    // Process tailwind data if available
    const simplifiedTailwindData: Record<string, string[]> = {};
    if (tailwindData) {
      Object.keys(tailwindData).forEach((selector) => {
        simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
          ? tailwindData[selector]
          : [];
      });
    }

    // Create enhanced tree with Tailwind classes and computed styles
    const enhancedTree = createEnhancedClassTree(
      portalClassTree,
      simplifiedTailwindData || {},
      computedStyles,
    );

    // Create readable hierarchical representation
    hierarchyData = formatEnhancedTree(enhancedTree);
  }

  // Format computed styles if available
  let computedStylesText = '';
  if (computedStyles && Object.keys(computedStyles).length > 0) {
    computedStylesText = Object.entries(computedStyles)
      .map(([className, styles]) => {
        return `.${className}: ${JSON.stringify(styles, null, 2)}`;
      })
      .join('\n\n');
  }

  // Create the evaluation prompt
  const promptText = `I've applied CSS to transform a page to match a reference design. I need you to evaluate the results and provide specific improvements if needed.

CURRENT CSS:
\`\`\`css
${currentCSS}
\`\`\`

${hierarchyData ? `DOM STRUCTURE WITH STYLES:\n${hierarchyData}\n\n` : ''}
${computedStylesText ? `COMPUTED STYLES:\n${computedStylesText}\n\n` : ''}

EVALUATION INSTRUCTIONS:
1. Compare the visual appearance of both images with pixel-perfect precision
2. Focus on these key aspects that may need improvement:
   - Colors (backgrounds, text, borders)
   - Typography (size, weight, family, spacing)
   - Layout & Spacing (padding, margins, positioning)
   - Visual Effects (shadows, borders, border-radius)
   - Overall fidelity to the reference design

RESPONSE FORMAT:
- If the current state matches the reference design well (90%+ accuracy), respond with ONLY the word "DONE"
- If improvements are needed, respond with COMPLETE, VALID CSS that incorporates ALL existing styles plus your changes.
- YOU MUST ALWAYS RETURN THE FULL CSS FILE, not just the changes or additions.
- Do not include any explanations, just the CSS code.

IMPORTANT CSS GUIDELINES:
1. Your CSS must ONLY use selectors targeting classes starting with "portal-"
2. Do NOT include any comments in the CSS.
3. Include precise values (exact colors, measurements) to achieve a pixel-perfect match
4. Use proper CSS specificity (e.g., .portal-card.portal-card) instead of !important when possible
5. Only use !important for critical overrides that cannot be achieved with specificity

NOTE: The FIRST image is the REFERENCE design, the SECOND image is the CURRENT state.

RESPOND ONLY WITH VALID CSS CODE OR THE SINGLE WORD "DONE".`;

  // Build message parts - start with just the text prompt
  const parts: MessagePart[] = [{ text: promptText }];

  // Add the images as separate inline_data parts, not in the text
  if (isValidImageData(referenceImage)) {
    const imgData = dataUrlToBase64(referenceImage);
    const mimeType = referenceImage.split(';')[0].split(':')[1];
    parts.push({
      inline_data: {
        data: imgData,
        mime_type: mimeType,
      },
    });
  }

  if (isValidImageData(resultScreenshot)) {
    const imgData = dataUrlToBase64(resultScreenshot);
    const mimeType = resultScreenshot.split(';')[0].split(':')[1];
    parts.push({
      inline_data: {
        data: imgData,
        mime_type: mimeType,
      },
    });
  }

  // Prepare the messages for Gemini
  const messages: GeminiMessage[] = [
    {
      role: 'user',
      parts,
    },
  ];

  // Use the same chat session ID if provided
  const chatSessionId = sessionId || `css_eval_${Date.now()}`;

  try {
    // Use the makeGeminiRequest function
    const result = await makeGeminiRequest(
      apiKey,
      messages,
      model,
      chatSessionId,
    );

    if (result.trim() === 'DONE') {
      return {
        isMatch: true,
        feedback: 'CSS matches reference design',
      };
    }

    return {
      isMatch: false,
      feedback: result,
    };
  } catch (error) {
    console.error('Error evaluating CSS result with Gemini:', error);
    throw error;
  }
};

// Define proper types for enhanced tree nodes
interface EnhancedTreeNode {
  element: string;
  portalClasses: string[];
  tailwindClasses: Record<string, string[]>;
  computedStyles: Record<string, string>;
  children: EnhancedTreeNode[];
}

// Create an enhanced tree that includes Tailwind classes and computed styles
function createEnhancedClassTree(
  node: TreeNode,
  tailwindData: Record<string, string[]>,
  computedStyles?: Record<string, Record<string, string>>,
): EnhancedTreeNode {
  // Create the base node
  const enhancedNode: EnhancedTreeNode = {
    element: node.element,
    portalClasses: [],
    tailwindClasses: {},
    computedStyles: {},
    children: [],
  };

  // Add portal classes with associated tailwind classes
  if (node.portalClasses && node.portalClasses.length > 0) {
    enhancedNode.portalClasses = node.portalClasses;

    // Add tailwind classes info
    node.portalClasses.forEach((cls) => {
      if (tailwindData && tailwindData[cls]) {
        enhancedNode.tailwindClasses[cls] = tailwindData[cls];
      }

      // Add computed styles if available
      if (computedStyles && computedStyles[cls]) {
        enhancedNode.computedStyles = {
          ...enhancedNode.computedStyles,
          ...computedStyles[cls],
        };
      }
    });
  }

  // Process child nodes recursively
  if (node.children && node.children.length > 0) {
    enhancedNode.children = node.children.map((child) =>
      createEnhancedClassTree(child, tailwindData, computedStyles),
    );
  }

  return enhancedNode;
}

// Format an enhanced tree node into a human-readable hierarchical string
function formatEnhancedTree(
  node: EnhancedTreeNode,
  depth: number = 0,
  isLast: boolean = true,
): string {
  // Create indentation
  const indent =
    depth > 0 ? '|  '.repeat(depth - 1) + (isLast ? '|_ ' : '|_ ') : '';

  // Format portal classes
  const portalClassesStr =
    node.portalClasses.length > 0 ? `[${node.portalClasses.join(', ')}]` : '[]';

  // Format tailwind classes
  const tailwindStr =
    Object.keys(node.tailwindClasses).length > 0
      ? `[tailwind: ${Object.entries(node.tailwindClasses)
          .map(([cls, values]) => `${cls}: "${values.join(' ')}"`)
          .join(', ')}]`
      : '';

  // Format computed styles
  const stylesStr =
    Object.keys(node.computedStyles).length > 0
      ? `[computed: ${Object.entries(node.computedStyles)
          .filter(
            ([key]) =>
              ![
                'element',
                'parent-classes',
                'has-portal-children',
                'child-elements',
              ].includes(key),
          )
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')}]`
      : '';

  // Build the node representation
  let result = `${indent}${node.element} ${portalClassesStr} ${tailwindStr} ${stylesStr}\n`;

  // Process children
  if (node.children.length > 0) {
    node.children.forEach((child, index) => {
      result += formatEnhancedTree(
        child,
        depth + 1,
        index === node.children.length - 1,
      );
    });
  }

  return result;
}

/**
 * Make a Gemini API request reusing chat history from an existing session
 * @param apiKey The Gemini API key
 * @param newMessages New messages to add to the conversation
 * @param model Gemini model to use
 * @param sessionId Optional session ID to use (creates new if not provided)
 * @returns The API response content
 */
export async function makeGeminiRequest(
  apiKey: string,
  newMessages: GeminiMessage[],
  model: string,
  sessionId?: string,
): Promise<string> {
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

  const session = sessionId
    ? chatManager.getOrCreateSession(sessionId)
    : chatManager.createSession(`session_${Date.now()}`);

  // Add new messages to the session
  newMessages.forEach((msg) => {
    session.addMessage(msg.role, msg.parts);
  });

  // Get all messages from the session
  const messages = session.getMessages();

  // Used for tracking continuation attempts
  let fullContent = '';
  let continuationAttempts = 0;
  const MAX_CONTINUATION_ATTEMPTS = 3;

  // Keep track of whether we're in a continuation
  let continueGenerating = true;

  while (
    continueGenerating &&
    continuationAttempts <= MAX_CONTINUATION_ATTEMPTS
  ) {
    try {
      // Prepare messages for continuation
      const requestMessages = [...messages];

      // If this is a continuation, add a continuation instruction
      if (continuationAttempts > 0) {
        // Add a continuation instruction
        requestMessages.push({
          role: 'user',
          parts: [
            { text: 'Please continue your response from where you left off.' },
          ],
        });
      }

      // Make the API request with properly structured messages
      const requestBody = {
        contents: requestMessages,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API error: ${errorData.error?.message || response.statusText}`,
        );
      }

      const data = await response.json();

      if (
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text
      ) {
        const content = data.candidates[0].content.parts[0].text.trim();

        // Append to the full content
        fullContent += (continuationAttempts > 0 ? ' ' : '') + content;

        // Check if we need to continue generating
        const finishReason = data.candidates[0].finishReason;
        if (finishReason === 'MAX_TOKENS') {
          continuationAttempts++;
        } else {
          // Normal completion - we're done
          continueGenerating = false;

          // Add the complete assistant response to the session
          session.addMessage('model', [{ text: fullContent }]);
        }

        // If we've reached max attempts, stop and return what we have
        if (continuationAttempts >= MAX_CONTINUATION_ATTEMPTS) {
          console.warn(
            `Reached maximum continuation attempts (${MAX_CONTINUATION_ATTEMPTS}). Returning partial content.`,
          );
          continueGenerating = false;

          // Add the partial response to the session
          session.addMessage('model', [{ text: fullContent }]);
        }
      } else {
        // Handle cases where response is incomplete or empty
        const finishReason = data.candidates?.[0]?.finishReason;

        if (finishReason === 'MAX_TOKENS') {
          console.warn(
            'Response hit MAX_TOKENS with no content. Attempting continuation...',
          );
          continuationAttempts++;

          if (continuationAttempts >= MAX_CONTINUATION_ATTEMPTS) {
            console.error(
              'MAX_TOKENS hit with no content after max attempts. Prompt may be too large.',
            );
            throw new Error(
              'Response too large - try reducing the prompt size or number of reference images',
            );
          }
        } else {
          console.error('Unexpected API response:', data);
          throw new Error('Invalid response format from API');
        }
      }
    } catch (error) {
      console.error('Error making Gemini request:', error);
      continueGenerating = false;
      throw error;
    }
  }

  return fullContent;
}
