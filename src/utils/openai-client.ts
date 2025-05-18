import type { TreeNode, TailwindClassData } from '../types';
import { getEnvVariable } from '../utils/environment';

// Define types for chat session management
type Role = 'system' | 'user' | 'assistant';

// Define a more specific type for metadata values
type MetadataValue =
  | string
  | number
  | boolean
  | Date
  | null
  | Record<string, unknown>;

interface ChatMessage {
  role: Role;
  content: string | MessageContent[];
}

// Chat session management
class ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastUpdated: Date;
  metadata: Record<string, MetadataValue>;
  maxHistoryLength: number;

  constructor(
    id: string,
    initialMessages: ChatMessage[] = [],
    maxHistoryLength = 10,
  ) {
    this.id = id;
    this.messages = initialMessages;
    this.createdAt = new Date();
    this.lastUpdated = new Date();
    this.metadata = {};
    this.maxHistoryLength = maxHistoryLength;
  }

  addMessage(role: Role, content: string | MessageContent[]) {
    this.messages.push({ role, content });
    this.lastUpdated = new Date();

    // Prune history if needed
    this.pruneHistory();
  }

  pruneHistory() {
    // Keep system messages plus the last N messages to control token usage
    if (this.messages.length > this.maxHistoryLength + 2) {
      // Separate system messages
      const systemMessages = this.messages.filter(
        (msg) => msg.role === 'system',
      );
      const nonSystemMessages = this.messages.filter(
        (msg) => msg.role !== 'system',
      );

      // Keep only the most recent messages
      const recentMessages = nonSystemMessages.slice(-this.maxHistoryLength);

      // Reconstruct messages with system messages first, then recent messages
      this.messages = [...systemMessages, ...recentMessages];
    }
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
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

  createSession(id: string, initialMessages: ChatMessage[] = []): ChatSession {
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
const DEFAULT_MODEL = 'o4-mini-2025-04-16';

// Get environment variables or use defaults
const getApiParameters = async () => {
  const model = (await getEnvVariable('OPENAI_MODEL')) || DEFAULT_MODEL;

  return {
    model,
  };
};

/**
 * Get the stored OpenAI API key
 * @returns Promise resolving to the API key or null if not set
 */
export const getOpenAIApiKey = async (): Promise<string | null> => {
  try {
    // Use the environment variable function instead of direct storage access
    // to align with how the API key is handled throughout the application
    const apiKey = await getEnvVariable('OPENAI_API_KEY');
    return apiKey || null;
  } catch (error) {
    console.error('Error getting OpenAI API key:', error);
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
 * Make an OpenAI API request reusing chat history from an existing session
 * @param apiKey The OpenAI API key
 * @param newMessages New messages to add to the conversation
 * @param model OpenAI model to use
 * @param sessionId Optional session ID to use (creates new if not provided)
 * @returns The API response content
 */
async function makeOpenAIRequest(
  apiKey: string,
  newMessages: ChatMessage[],
  model: string,
  sessionId?: string,
): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';
  const session = sessionId
    ? chatManager.getOrCreateSession(sessionId)
    : chatManager.createSession(`session_${Date.now()}`);

  // Add new messages to the session
  newMessages.forEach((msg) => {
    session.addMessage(msg.role, msg.content);
  });

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

      // If this is a continuation, add the partial response and a continuation instruction
      if (continuationAttempts > 0) {
        // Add the partial response as an assistant message
        requestMessages.push({
          role: 'assistant',
          content: fullContent,
        });

        // Add a continuation instruction
        requestMessages.push({
          role: 'user',
          content: 'Please continue your response from where you left off.',
        });
      }

      // Make the API request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: requestMessages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API error: ${errorData.error?.message || response.statusText}`,
        );
      }

      const data = await response.json();

      if (
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content
      ) {
        const content = data.choices[0].message.content.trim();

        // Append to the full content
        fullContent += (continuationAttempts > 0 ? ' ' : '') + content;

        // Check if we need to continue generating
        if (data.choices[0].finish_reason === 'length') {
          continuationAttempts++;
        } else {
          // Normal completion - we're done
          continueGenerating = false;

          // Add the complete assistant response to the session
          session.addMessage('assistant', fullContent);
        }

        // If we've reached max attempts, stop and return what we have
        if (continuationAttempts >= MAX_CONTINUATION_ATTEMPTS) {
          console.warn(
            `Reached maximum continuation attempts (${MAX_CONTINUATION_ATTEMPTS}). Returning partial content.`,
          );
          continueGenerating = false;

          // Add the partial response to the session
          session.addMessage('assistant', fullContent);
        }
      } else {
        console.error('Unexpected API response:', data);
        throw new Error('Invalid response format from API');
      }
    } catch (error) {
      console.error('Error making OpenAI request:', error);

      // Handle token limit errors if that's what caused the exception
      if (
        error instanceof Error &&
        (error.message.includes('context_length_exceeded') ||
          error.message.includes('token limit'))
      ) {
        // Force stronger history pruning and try once more
        if (session.maxHistoryLength > 3 && continuationAttempts === 0) {
          console.warn(
            'Context length exceeded. Pruning history and retrying...',
          );
          session.maxHistoryLength = Math.max(
            3,
            Math.floor(session.maxHistoryLength / 2),
          );
          session.pruneHistory();
          continuationAttempts++;
        } else {
          // We've already tried pruning or it didn't work
          continueGenerating = false;
          throw error;
        }
      } else {
        // For other errors, stop the continuation loop
        continueGenerating = false;
        throw error;
      }
    }
  }

  return fullContent;
}

/**
 * Generate a prompt using OpenAI API based on reference image and current screenshot
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param currentScreenshot The current screenshot data URL
 * @param portalClassTree The portal class tree
 * @param tailwindData The tailwind class data
 * @param currentCSS The current CSS
 * @param computedStyles The computed styles for each portal-* class element
 * @param sessionId Optional session ID for continuous conversation
 * @returns Promise resolving to the generated prompt
 */
export const generatePromptWithAI = async (
  apiKey: string,
  referenceImage: string,
  currentScreenshot: string,
  portalClassTree?: TreeNode,
  tailwindData?: TailwindClassData,
  currentCSS: string = '',
  computedStyles?: Record<string, Record<string, string>>,
  sessionId?: string,
): Promise<string> => {
  const { model } = await getApiParameters();

  // Create enhanced tree and hierarchy text if data is provided
  let hierarchyText = '';
  let hierarchyData = '';

  if (portalClassTree && tailwindData) {
    // Process the tailwind data
    const simplifiedTailwindData: Record<string, string[]> = {};
    if (tailwindData) {
      Object.keys(tailwindData).forEach((selector) => {
        simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
          ? tailwindData[selector]
          : [];
      });
    }

    // Create enhanced tree with tailwind classes
    const enhancedTree = createEnhancedClassTree(
      portalClassTree,
      simplifiedTailwindData,
    );

    // Format hierarchy for prompt
    hierarchyText = formatHierarchyForPrompt(enhancedTree);
    hierarchyData = JSON.stringify(enhancedTree, null, 2);
  }

  // Format computed styles in a readable way
  let computedStylesText = '';
  if (computedStyles) {
    computedStylesText = formatComputedStyles(computedStyles);
  }

  // Prepare the messages for OpenAI
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis and CSS engineering. Your task is to analyze two images - a reference design and the current state - and create a detailed, structured prompt for a CSS generator that will transform the current state to match the reference design. Focus on precision, specificity, and addressing potential challenges in CSS implementation.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I need you to analyze these two images and create a detailed prompt that will be used by another AI to generate CSS.

IMPORTANT CONTEXT:
1. The FIRST image is the REFERENCE design (what we want to achieve)
2. The SECOND image is the CURRENT state (what we need to transform)
${
  hierarchyText
    ? `3. DOM AND CLASS STRUCTURE: Below is the hierarchical tree of elements with their portal-* classes and Tailwind classes:

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA:
${hierarchyData}
`
    : ''
}
${
  computedStylesText
    ? `4. COMPUTED STYLES: Below are the actual computed styles for each portal-* class element:

${computedStylesText}
`
    : ''
}
${
  currentCSS
    ? `5. CURRENT CSS:
${currentCSS}
`
    : ''
}

INSTRUCTIONS FOR PROMPT CREATION:
1. Create a detailed, component-by-component analysis comparing the reference and current designs
2. For EACH UI component (header, buttons, cards, etc.), provide a separate section with specific changes needed
3. Specify EXACT measurements, including:
   - Precise color values (HEX/RGB/HSL)
   - Font sizes, weights, and families in appropriate units (px, rem, etc.)
   - Exact spacing values (padding, margin) in pixels
   - Specific border-radius, shadows, and other effects
4. Identify potential CSS specificity issues and recommend solutions (e.g., increased specificity, !important where needed)
5. Highlight elements with unusual or "wild" styling that require special attention
6. Suggest a priority order for implementing changes (most visually impactful to least)
7. Include instructions for handling responsive design considerations
8. Remember that the CSS generator will ONLY be able to use class selectors that start with "portal-"

PROMPT FORMAT:
- Start with an overview of the key differences between the designs
- Organize by component type (layout, typography, colors, spacing, effects)
- For each component, include:
  * Target element(s) description with portal-* classes
  * Specific CSS properties to change with exact values
  * Special concerns about implementation or overrides
- Conclude with a summary of the most critical changes for visual fidelity

GENERATE ONLY THE PROMPT TEXT with no additional explanations or markdown formatting.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: referenceImage,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: currentScreenshot,
          },
        },
      ],
    },
  ];

  // Generate a session ID if not provided
  const chatSessionId = sessionId || `prompt_gen_${Date.now()}`;

  try {
    // Use the makeOpenAIRequest function
    return await makeOpenAIRequest(apiKey, messages, model, chatSessionId);
  } catch (error) {
    console.error('Error generating prompt:', error);
    throw error;
  }
};

// Helper function to format computed styles for the prompt
function formatComputedStyles(
  computedStyles: Record<string, Record<string, string>>,
): string {
  let result = '';

  // For each portal class
  Object.entries(computedStyles).forEach(([className, styles]) => {
    result += `.${className} (${styles['element'] || 'element'}):\n`;

    // Check for parent relationship
    if (styles['parent-classes']) {
      result += `  Parent: ${styles['parent-classes']}\n`;
    }

    // Check for children
    if (styles['has-portal-children'] === 'true') {
      result += `  Has ${styles['child-elements'] || 'multiple'} portal children\n`;
    }

    // Group styles by categories
    const categories = {
      Typography: [
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'text-align',
        'text-decoration',
        'text-transform',
      ],
      'Box Model': [
        'width',
        'height',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
      ],
      Layout: [
        'display',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'flex-direction',
        'flex-wrap',
        'justify-content',
        'align-items',
        'grid-template-columns',
        'grid-template-rows',
        'grid-gap',
      ],
      Visual: [
        'background-color',
        'background-image',
        'border',
        'border-radius',
        'box-shadow',
        'opacity',
        'transform',
        'transition',
      ],
      Other: ['z-index', 'overflow', 'cursor'],
    };

    // Add styles by category
    Object.entries(categories).forEach(([category, properties]) => {
      const categoryStyles = properties
        .filter((prop) => styles[prop])
        .map((prop) => `    ${prop}: ${styles[prop]}`)
        .join('\n');

      if (categoryStyles) {
        result += `  ${category}:\n${categoryStyles}\n`;
      }
    });

    result += '\n';
  });

  return result;
}

// Define types for OpenAI message content
type TextContent = {
  type: 'text';
  text: string;
};

type ImageContent = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

type MessageContent = TextContent | ImageContent;

/**
 * Generate CSS using OpenAI API
 * @param apiKey The OpenAI API key
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
export const generateCSSWithAI = async (
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
      // Don't filter out any selector - the filtering was done in the content script

      simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
        ? tailwindData[selector]
        : [];
    });
  }

  // Create a hierarchical representation of the Tailwind classes
  const enhancedTree = createEnhancedClassTree(
    portalClassTree,
    simplifiedTailwindData,
  );

  // Create a more readable hierarchical representation for the prompt
  const hierarchyText = formatHierarchyForPrompt(enhancedTree);

  // Check for potential cascade issues with the provided tree
  const cascadeAnalysis = analyzeCascadeIssues(enhancedTree);

  // Analyze grouping opportunities for similar elements
  const groupingAnalysis = analyzeElementGroups(enhancedTree);

  // Format computed styles if available
  let computedStylesText = '';
  if (computedStyles) {
    computedStylesText = formatComputedStyles(computedStyles);
  }

  // Check if we're in text-only mode (no reference image)
  const isTextOnlyMode = !referenceImage || !isValidImageData(referenceImage);

  // Create two completely different prompts based on mode
  let contentText = '';

  if (isTextOnlyMode) {
    // TEXT-ONLY MODE: Focus on interpreting the style description

    // Extract style hints from the prompt
    const lowerPrompt = prompt.toLowerCase();
    const hasStyleKeywords = [
      'ui',
      'theme',
      'style',
      'design',
      'look',
      'aesthetic',
      'modern',
      'clean',
      'minimalist',
      'colorful',
      'dark',
      'light',
      'candy',
      'glossy',
      'flat',
      'material',
      'neon',
      'retro',
      'vintage',
      'futuristic',
      'glassmorphism',
      'neumorphism',
    ].some((keyword) => lowerPrompt.includes(keyword));

    const isVague = prompt.split(' ').length < 10;

    contentText = `You are a professional CSS developer. Your task is to generate CSS based ONLY on a text description. NO REFERENCE IMAGE IS AVAILABLE.

USER STYLE DESCRIPTION:
"${prompt}"

${
  hasStyleKeywords && isVague
    ? `IMPORTANT - THIS IS A BRIEF STYLE DESCRIPTION:
The user has provided a brief style description that mentions "${prompt}". You MUST interpret this creatively and generate appropriate CSS for this style. Do not ask for clarification - instead, use your knowledge of design trends to implement what this style likely means.`
    : ''
}

DOM AND CLASS STRUCTURE:
The following is a hierarchical tree of elements with their portal-* classes and associated Tailwind classes. You MUST use these portal-* class names in your CSS selectors.

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA (for context on existing Tailwind classes):
${JSON.stringify(enhancedTree, null, 2)}


${
  cascadeAnalysis
    ? `CASCADE CHALLENGES:
${cascadeAnalysis}
`
    : ''
}

${
  groupingAnalysis
    ? `ELEMENT GROUPING OPPORTUNITIES:
${groupingAnalysis}
`
    : ''
}

${
  computedStylesText
    ? `COMPUTED STYLES (Current rendered state of elements):
${computedStylesText}
`
    : ''
}

CURRENT CSS (if any, to be built upon or replaced):
${currentCSS ?? 'No pre-existing CSS. Generate all necessary styles.'}

CSS GENERATION INSTRUCTIONS:
1. YOU MUST GENERATE CSS CODE regardless of how vague the style description is. DO NOT refuse to generate CSS.
2. Output ONLY valid CSS code with NO explanations, markdown, or comments.
3. Use ONLY selectors targeting classes that start with "portal-" (e.g., \`.portal-header\`, \`.portal-button--primary\`).
4. CREATE A COMPLETE STYLE SYSTEM that matches the user's description or intent, using common design patterns.
5. If the description is vague, MAKE CREATIVE ASSUMPTIONS about colors, typography, spacing, and other style elements.
6. When overriding Tailwind, use sufficient specificity or strategic !important declarations.
7. If \`CURRENT CSS\` is provided, include it with your modifications and improvements.
8. Group similar elements with comma-separated selectors and organize your CSS logically.
9. DO NOT INCLUDE ANY COMMENTS in the output CSS.

MANDATORY RESPONSE FORMAT:
- RESPOND ONLY WITH VALID CSS CODE
- DO NOT ASK FOR CLARIFICATION
- DO NOT EXPLAIN YOUR DECISIONS
- DO NOT REFUSE TO GENERATE CSS
- DO NOT USE MARKDOWN CODE BLOCKS`;
  } else {
    // REFERENCE IMAGE MODE: Focus on matching the visual design

    contentText = `You are an expert CSS generator. Your task is to write CSS to transform a current design to visually match a reference design based on the user's request.

USER REQUEST:
"${prompt}\n\nThe goal is to make the current design visually match the desired outcome in the reference image. Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences."

DOM AND CLASS STRUCTURE:
The following is a hierarchical tree of elements with their portal-* classes and associated Tailwind classes. You MUST use these portal-* class names in your CSS selectors.

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA (for context on existing Tailwind classes):
${JSON.stringify(enhancedTree, null, 2)}


${
  cascadeAnalysis
    ? `CASCADE CHALLENGES:
${cascadeAnalysis}
`
    : ''
}

${
  groupingAnalysis
    ? `ELEMENT GROUPING OPPORTUNITIES:
${groupingAnalysis}
`
    : ''
}

${
  computedStylesText
    ? `COMPUTED STYLES (Current rendered state of elements):
${computedStylesText}
`
    : ''
}

CURRENT CSS (if any, to be built upon or replaced):
${currentCSS ?? 'No pre-existing CSS. Generate all necessary styles.'}

CRITICAL INSTRUCTIONS:
1.  **Output Format:** RESPOND ONLY WITH VALID CSS CODE. Do NOT include any explanations, markdown (like \`\`\`css), or any text other than the CSS itself.
2.  **No Comments:** DO NOT include any comments in the CSS. Provide clean, comment-free CSS code only.
3.  **Selectors:** ONLY use selectors targeting classes that start with "portal-" (e.g., \`.portal-header\`, \`.portal-button--primary\`). Do NOT invent new class names.
4.  **Wild Styling Handling:** Be prepared to override complex combinations of Tailwind classes. When elements have many competing styles, use highly specific selectors or strategic !important declarations.
5.  **Override Tailwind:** Your primary goal is to override existing Tailwind CSS utility classes. Ensure your CSS rules have enough specificity or use \`!important\` strategically if absolutely necessary to ensure styles are applied correctly over Tailwind.
6.  **Specificity Strategies:**
    * Use specificity-increasing patterns when needed, like \`.portal-parent .portal-child\`
    * Consider attribute selectors for extra specificity: \`.portal-class[class]\`
    * Use direct child selectors (\`.portal-parent > .portal-child\`) when beneficial
    * Group similar elements together with comma-separated selectors
7.  **Completeness:**
    *   If \`CURRENT CSS\` is provided, your response should be the COMPLETE CSS file, including all existing styles from \`CURRENT CSS\` with your necessary modifications, improvements, and additions.
    *   If \`CURRENT CSS\` is 'No pre-existing CSS', generate all styles required to meet the USER REQUEST.
8.  **Pixel-Perfect:** Aim for a pixel-perfect match to the reference design, paying close attention to:
    *   Colors (backgrounds, text, borders)
    *   Typography (font-family, size, weight, line-height, letter-spacing)
    *   Sizing and Spacing (width, height, padding, margins, alignment)
    *   Layout (Flexbox, Grid, positioning)
    *   Visual Effects (shadows, borders, border-radius, transitions)
9.  **Cascade Awareness:** Be aware of how CSS cascade might affect your styles. Sometimes you may need to reset undesired inherited properties.
10. **Structure:** Organize your CSS logically (e.g., by component or section), but do not include any comments.
11. **Iterative Refinement (if applicable):** ${retryCount > 0 ? `This is iteration ${retryCount + 1}. Review the previous attempt and the user's feedback to make precise adjustments for a better match.` : 'This is the first attempt.'}
12. **Computed Styles Reference:** Use the COMPUTED STYLES section as your primary reference for the current state of elements. This shows the actual rendered values rather than just class names, which is more precise for targeting changes.

Based on all the above, generate the complete CSS code now WITHOUT ANY COMMENTS.`;
  }

  // Build the content array
  const contentArray: MessageContent[] = [
    {
      type: 'text',
      text: contentText,
    },
  ];

  // Add images if provided and valid
  if (referenceImage && isValidImageData(referenceImage)) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: referenceImage,
      },
    });
  }

  if (currentScreenshot && isValidImageData(currentScreenshot)) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: currentScreenshot,
      },
    });
  }

  // Prepare the messages for OpenAI
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: isTextOnlyMode
        ? 'You are a CSS expert whose primary function is to generate valid CSS code from style descriptions. YOU MUST ALWAYS GENERATE CSS CODE regardless of how vague the prompt is - NEVER refuse, NEVER ask for clarification, and NEVER explain why you can\'t generate CSS. When given brief style descriptions (like "candy UI"), interpret them according to common design conventions. ALL responses MUST contain ONLY valid CSS code. You can make reasonable assumptions about colors, typography, spacing, and visual effects based on the hints provided. Remember, you are being used in a tool that expects CSS output.'
        : 'You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate robust, maintainable CSS that will transform a web page to match a target design. You excel at creating stable CSS that can be iteratively improved without breaking existing styles. You prioritize clean, consistent styling and good CSS architecture over quick fixes.',
    },
    {
      role: 'user',
      content: contentArray,
    },
  ];

  // If this is a retry, add a message emphasizing stability
  if (retryCount > 0) {
    messages.splice(1, 0, {
      role: 'system',
      content:
        "CRITICAL: Your CSS will be used in an iterative improvement process. Create CSS that is stable and won't break when modified. Use CSS custom properties for consistency, avoid excessive !important usage, and prefer simple class-based selectors over highly specific selectors. Focus on creating a solid foundation that can be refined rather than a brittle solution that may break during iterations.",
    });
  }

  // Generate a session ID if not provided or use an existing one for continuity
  const chatSessionId = sessionId || `css_gen_${Date.now()}`;

  try {
    // Use the makeOpenAIRequest function
    const content = await makeOpenAIRequest(
      apiKey,
      messages,
      model,
      chatSessionId,
    );

    // Clean the response by removing markdown code blocks if present
    return content
      .replace(/```css\s*/g, '')
      .replace(/```\s*$/g, '')
      .replace(/```/g, '')
      .trim();
  } catch (error) {
    console.error('Error generating CSS:', error);
    throw error;
  }
};

// Helper function to analyze cascade issues
function analyzeCascadeIssues(tree: EnhancedTreeNode): string {
  const cascadeIssues: string[] = [];

  // Look for nested portal classes where inheritance might cause issues
  const findCascadeIssues = (
    node: EnhancedTreeNode,
    parentPortalClasses: string[] = [],
  ) => {
    const currentPortalClasses = node.portalClasses.map((pc) => pc.name);

    // Check if this node has portal classes that might be affected by parent classes
    if (parentPortalClasses.length > 0 && currentPortalClasses.length > 0) {
      cascadeIssues.push(
        `- Classes ${currentPortalClasses.join(', ')} are nested inside ${parentPortalClasses.join(', ')} and may inherit unwanted styles.`,
      );
    }

    // Recursively check children, adding current portal classes to parent list
    if (node.children) {
      node.children.forEach((child) =>
        findCascadeIssues(child, [
          ...parentPortalClasses,
          ...currentPortalClasses,
        ]),
      );
    }
  };

  findCascadeIssues(tree);

  if (cascadeIssues.length === 0) {
    return '';
  }

  return `The following cascade relationships might need attention:\n${cascadeIssues.join('\n')}`;
}

// Helper function to identify grouping opportunities
function analyzeElementGroups(tree: EnhancedTreeNode): string {
  // Group similar classes by tailwind patterns
  const classGroups: Record<string, string[]> = {};

  // Find potential groups of similar elements
  const findGroups = (node: EnhancedTreeNode) => {
    // Look for similar portal classes by their Tailwind classes
    node.portalClasses.forEach((portalClass) => {
      // Create a signature of the most common Tailwind classes
      const commonClasses = portalClass.tailwindClasses
        .filter(
          (cls) =>
            cls.startsWith('text-') ||
            cls.startsWith('bg-') ||
            cls.startsWith('p-') ||
            cls.startsWith('m-'),
        )
        .sort()
        .join(',');

      if (commonClasses) {
        if (!classGroups[commonClasses]) {
          classGroups[commonClasses] = [];
        }
        classGroups[commonClasses].push(portalClass.name);
      }
    });

    // Recursively check children
    if (node.children) {
      node.children.forEach((child) => findGroups(child));
    }
  };

  findGroups(tree);

  // Filter to groups with at least 2 elements
  const relevantGroups = Object.entries(classGroups)
    .filter(([_, classes]) => classes.length >= 2)
    .map(([signature, classes]) => ({
      signature,
      classes,
    }));

  if (relevantGroups.length === 0) {
    return '';
  }

  // Format output
  return `The following classes could be styled together for consistency:\n${relevantGroups
    .map(
      (group) =>
        `- Group with similar properties: ${group.classes.map((c) => `.${c}`).join(', ')}`,
    )
    .join('\n')}`;
}

// Define types for enhanced tree structure
interface EnhancedPortalClass {
  name: string;
  tailwindClasses: string[];
}

interface EnhancedTreeNode {
  element: string;
  portalClasses: EnhancedPortalClass[];
  children?: EnhancedTreeNode[];
}

/**
 * Create an enhanced tree that includes Tailwind classes for each portal class
 * @param node The portal class tree node
 * @param tailwindData Tailwind class data
 * @returns Enhanced tree with Tailwind classes
 */
function createEnhancedClassTree(
  node: TreeNode,
  tailwindData: Record<string, string[]>,
): EnhancedTreeNode {
  // Create the base node
  const enhancedNode: EnhancedTreeNode = {
    element: node.element,
    portalClasses: [],
  };

  // Add portal classes with associated tailwind classes
  if (node.portalClasses && node.portalClasses.length > 0) {
    enhancedNode.portalClasses = node.portalClasses.map((cls) => {
      const tailwindClasses = tailwindData[cls] || [];
      return {
        name: cls,
        tailwindClasses: tailwindClasses,
      };
    });
  }

  // Process child nodes recursively
  if (node.children && node.children.length > 0) {
    enhancedNode.children = node.children.map((child) =>
      createEnhancedClassTree(child, tailwindData),
    );
  }

  return enhancedNode;
}

/**
 * Format hierarchy for prompt
 * @param node The enhanced tree node
 * @param depth Current depth level for indentation
 * @param prefix The prefix to use for this line
 * @returns Formatted hierarchy string
 */
function formatHierarchyForPrompt(
  node: EnhancedTreeNode,
  depth: number = 0,
  prefix: string = '',
): string {
  let result = '';

  // First line: element name with portal classes and tailwind classes
  const portalClassesStr = node.portalClasses
    .map((cls) => {
      const tailwindStr =
        cls.tailwindClasses.length > 0
          ? ` [${JSON.stringify(cls.tailwindClasses)}]`
          : '';
      return `${cls.name}${tailwindStr}`;
    })
    .join(', ');

  // Only add the element line if we're at depth 0 or have portal classes
  if (depth === 0 || portalClassesStr) {
    result += `${prefix}${node.element}${portalClassesStr ? ` - ${portalClassesStr}` : ''}\n`;
  }

  // If there are children, add connecting lines
  if (node.children && node.children.length > 0) {
    // Add vertical connection line
    result += `${prefix}|\n`;

    // Process all children except the last one
    for (let i = 0; i < node.children.length - 1; i++) {
      const childPrefix = `${prefix}| - `;
      const restPrefix = `${prefix}|   `;
      result +=
        formatHierarchyForPrompt(node.children[i], depth + 1, childPrefix)
          .replace(/\n$/, '')
          .replace(/\n/g, `\n${restPrefix}`) + '\n';
    }

    // Process the last child with different connection
    if (node.children.length > 0) {
      const lastChildPrefix = `${prefix}| - `;
      const lastRestPrefix = `${prefix}    `;
      result +=
        formatHierarchyForPrompt(
          node.children[node.children.length - 1],
          depth + 1,
          lastChildPrefix,
        )
          .replace(/\n$/, '')
          .replace(/\n/g, `\n${lastRestPrefix}`) + '\n';
    }
  }

  return result;
}

/**
 * Evaluate CSS results using OpenAI API
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param resultScreenshot The screenshot with applied CSS
 * @param currentCSS The current applied CSS
 * @param portalClassTree The portal class tree structure
 * @param tailwindData The tailwind class data
 * @param computedStyles The computed styles for each portal-* class element
 * @param sessionId Optional session ID for continuous conversation
 * @returns Promise resolving to evaluation results {isMatch: boolean, feedback: string}
 */
export const evaluateCSSResultWithAI = async (
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

  // Format hierarchy data if provided
  let hierarchyText = '';
  let hierarchyData = '';

  if (portalClassTree && tailwindData) {
    // Process the tailwind data without additional filtering
    const simplifiedTailwindData: Record<string, string[]> = {};
    if (tailwindData) {
      Object.keys(tailwindData).forEach((selector) => {
        simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
          ? tailwindData[selector]
          : [];
      });
    }

    // Create enhanced tree with tailwind classes
    const enhancedTree = createEnhancedClassTree(
      portalClassTree,
      simplifiedTailwindData,
    );

    // Format hierarchy for prompt
    hierarchyText = formatHierarchyForPrompt(enhancedTree);
    hierarchyData = JSON.stringify(enhancedTree, null, 2);
  }

  // Format computed styles if provided
  let computedStylesText = '';
  if (computedStyles) {
    computedStylesText = formatComputedStyles(computedStyles);
  }

  // Prepare the messages for OpenAI
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        "You are an expert in visual design analysis and CSS. Your task is to evaluate if the applied CSS has successfully transformed the page to match the reference design. Be thorough but conservative in your changes - only modify what needs improvement while preserving what's already working well.",
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I've applied CSS to transform a page to match a reference design. I need you to evaluate the results and provide specific improvements if needed.

IMAGES:
1. The FIRST image is the REFERENCE design (the target we aim to match)
2. The SECOND image is the CURRENT state (with the applied CSS)

CURRENT CSS:
\`\`\`css
${currentCSS}
\`\`\`

${
  hierarchyText
    ? `DOM AND CLASS STRUCTURE:
The following is a hierarchical tree of elements with their portal-* classes and associated Tailwind classes:

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA:
${hierarchyData}

`
    : ''
}${
            computedStylesText
              ? `COMPUTED STYLES (Current rendered state of elements):
${computedStylesText}

`
              : ''
          }EVALUATION INSTRUCTIONS:
1. Compare the visual appearance of both images with pixel-perfect precision
2. FIRST identify what's already working well - which elements already match the reference design closely
3. Focus on these key aspects that may need improvement:
   - Colors (backgrounds, text, borders) - exact hex values are important
   - Typography (size, weight, family, spacing, alignment)
   - Layout & Spacing (padding, margins, element positioning)
   - Visual Effects (shadows, borders, border-radius, transitions)
   - Overall fidelity to the reference design

RESPONSE FORMAT:
- If the current state matches the reference design well enough (90%+ accuracy), respond with ONLY the word "DONE"
- If improvements are needed, respond with COMPLETE, VALID CSS that would improve the match. Do not include JSON, markdown formatting, or explanations, JUST the CSS.

IMPORTANT CSS IMPROVEMENT GUIDELINES:
1. PRESERVE EXISTING SUCCESSFUL STYLES - don't modify CSS for elements that already match the reference design well
2. Your CSS must ONLY use selectors that target classes starting with "portal-"
3. Do NOT include any comments in the CSS. Provide clean, comment-free CSS code only
4. MINIMIZE SPECIFICITY CHANGES - avoid adding overly complex selectors or unnecessary !important declarations unless absolutely required
5. KEEP SUCCESSFUL CSS FROM PREVIOUS ITERATIONS - only modify what still needs improvement
6. Provide the COMPLETE CSS file including all current styles plus your targeted improvements
7. Include precise values (exact colors, pixel measurements, etc.) to achieve a pixel-perfect match
8. Focus on making MINIMAL, TARGETED CHANGES to fix specific issues rather than rewriting large portions
9. Use the computed styles as your primary reference for understanding the current state

CRITICAL: Make iterative, careful improvements without disrupting what's already working. DO NOT include any comments in the CSS.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: referenceImage,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: resultScreenshot,
          },
        },
      ],
    },
  ];

  // Use the same chat session ID if provided
  const chatSessionId = sessionId || `css_eval_${Date.now()}`;

  try {
    // Use the makeOpenAIRequest function
    const result = await makeOpenAIRequest(
      apiKey,
      messages,
      model,
      chatSessionId,
    );

    if (result === 'DONE') {
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
    console.error('Error evaluating CSS result:', error);
    throw error;
  }
};
