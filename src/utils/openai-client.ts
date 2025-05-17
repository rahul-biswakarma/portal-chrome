import type { TreeNode, TailwindClassData } from '../types';
import { getEnvVariable } from '../utils/environment';

// Default API parameters
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS_PROMPT = 3000;
const DEFAULT_MAX_TOKENS_CSS = 4000;
const DEFAULT_MAX_TOKENS_EVAL = 1500;

// Get environment variables or use defaults
const getApiParameters = async () => {
  const model = (await getEnvVariable('OPENAI_MODEL')) || DEFAULT_MODEL;
  const temperatureStr = await getEnvVariable('OPENAI_TEMPERATURE');
  const maxTokensPromptStr = await getEnvVariable('OPENAI_MAX_TOKENS_PROMPT');
  const maxTokensCssStr = await getEnvVariable('OPENAI_MAX_TOKENS_CSS');
  const maxTokensEvalStr = await getEnvVariable('OPENAI_MAX_TOKENS_EVAL');

  // Parse numeric values with fallbacks
  const temperature = temperatureStr
    ? parseFloat(temperatureStr)
    : DEFAULT_TEMPERATURE;
  const maxTokensPrompt = maxTokensPromptStr
    ? parseInt(maxTokensPromptStr, 10)
    : DEFAULT_MAX_TOKENS_PROMPT;
  const maxTokensCss = maxTokensCssStr
    ? parseInt(maxTokensCssStr, 10)
    : DEFAULT_MAX_TOKENS_CSS;
  const maxTokensEval = maxTokensEvalStr
    ? parseInt(maxTokensEvalStr, 10)
    : DEFAULT_MAX_TOKENS_EVAL;

  return {
    model,
    temperature,
    maxTokensPrompt,
    maxTokensCss,
    maxTokensEval,
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
 * Generate a prompt using OpenAI API based on reference image and current screenshot
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param currentScreenshot The current screenshot data URL
 * @returns Promise resolving to the generated prompt
 */
export const generatePromptWithAI = async (
  apiKey: string,
  referenceImage: string,
  currentScreenshot: string,
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';
  const { model, temperature, maxTokensPrompt } = await getApiParameters();

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis. Your task is to analyze two images - a reference design and the current state - and create a detailed prompt for a CSS generator that will help transform the current state to match the reference design.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I need you to analyze these two images and create a detailed prompt that will be used by another AI to generate CSS.

INSTRUCTIONS:
1. The FIRST image is the REFERENCE design (what we want to achieve)
2. The SECOND image is the CURRENT state (what we need to transform)
3. Create a detailed, specific prompt that describes all the visual changes needed to make the current design match the reference.
4. Focus on ALL visual aspects: colors, typography, spacing, alignment, effects, borders, etc.
5. Be precise with colors (suggest hex values when possible), sizes, and specific visual details
6. Remember that the CSS generator will ONLY be able to use class selectors that start with "portal-"
7. The prompt should be clear, specific, and actionable - enabling the CSS generator to create pixel-perfect matching CSS
8. The prompt should acknowledge that the CSS generator will have access to:
   - A tree structure of all portal-* classes
   - Existing Tailwind classes applied to these elements
   - Both images (reference and current)

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

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages,
        temperature,
        max_tokens: maxTokensPrompt,
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
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating prompt:', error);
    throw error;
  }
};

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
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';
  const { model, temperature, maxTokensCss } = await getApiParameters();

  // Debug log to check incoming tailwind data
  console.log('DEBUG: Incoming tailwind data:', tailwindData);

  // Process the tailwind data without additional filtering
  const simplifiedTailwindData: Record<string, string[]> = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach((selector) => {
      // Don't filter out any selector - the filtering was done in the content script
      console.log(
        `DEBUG: Processing classes for ${selector}:`,
        tailwindData[selector],
      );
      simplifiedTailwindData[selector] = Array.isArray(tailwindData[selector])
        ? tailwindData[selector]
        : [];
    });
  }

  console.log('DEBUG: Simplified tailwind data:', simplifiedTailwindData);

  // Create a hierarchical representation of the Tailwind classes
  const enhancedTree = createEnhancedClassTree(
    portalClassTree,
    simplifiedTailwindData,
  );

  console.log(
    'DEBUG: Enhanced tree for prompt:',
    JSON.stringify(enhancedTree, null, 2),
  );

  // Create a more readable hierarchical representation for the prompt
  const hierarchyText = formatHierarchyForPrompt(enhancedTree);

  // Improved prompt for pixel-perfect matching and visual fidelity
  let improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current design visually match the desired outcome. Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

  // Add iteration context if this isn't the first attempt
  if (retryCount > 0) {
    improvedPrompt += `\n\nThis is iteration ${retryCount + 1}. The previous CSS didn't fully match the reference image. Please make additional refinements to achieve better visual matching.`;
  }

  // Build the content array
  const contentArray: MessageContent[] = [
    {
      type: 'text',
      text: `You are an expert CSS generator. Your task is to write CSS to transform a current design to visually match a reference design based on the user's request.

USER REQUEST:
"${improvedPrompt}"

DOM AND CLASS STRUCTURE:
The following is a hierarchical tree of elements with their portal-* classes and associated Tailwind classes. You MUST use these portal-* class names in your CSS selectors.

HIERARCHICAL VIEW:
${hierarchyText}

FULL CLASS DATA (for context on existing Tailwind classes):
${JSON.stringify(enhancedTree, null, 2)}

CURRENT CSS (if any, to be built upon or replaced):
${currentCSS ? currentCSS : 'No pre-existing CSS. Generate all necessary styles.'}

CRITICAL INSTRUCTIONS:
1.  **Output Format:** RESPOND ONLY WITH VALID CSS CODE. Do NOT include any explanations, markdown (like \`\`\`css), or any text other than the CSS itself.
2.  **Selectors:** ONLY use selectors targeting classes that start with "portal-" (e.g., \`.portal-header\`, \`.portal-button--primary\`). Do NOT invent new class names.
3.  **Override Tailwind:** Your primary goal is to override existing Tailwind CSS utility classes. Ensure your CSS rules have enough specificity or use \`!important\` strategically if absolutely necessary to ensure styles are applied correctly over Tailwind.
4.  **Completeness:**
    *   If \`CURRENT CSS\` is provided, your response should be the COMPLETE CSS file, including all existing styles from \`CURRENT CSS\` with your necessary modifications, improvements, and additions.
    *   If \`CURRENT CSS\` is 'No pre-existing CSS', generate all styles required to meet the USER REQUEST.
5.  **Pixel-Perfect:** Aim for a pixel-perfect match to the reference design, paying close attention to:
    *   Colors (backgrounds, text, borders)
    *   Typography (font-family, size, weight, line-height, letter-spacing)
    *   Sizing and Spacing (width, height, padding, margins, alignment)
    *   Layout (Flexbox, Grid, positioning)
    *   Visual Effects (shadows, borders, border-radius, transitions)
6.  **Structure and Comments:** Organize your CSS logically (e.g., by component or section). Include comments to explain complex styles or rationale for changes, especially when overriding.
7.  **Iterative Refinement (if applicable):** ${retryCount > 0 ? `This is iteration ${retryCount + 1}. Review the previous attempt and the user's feedback to make precise adjustments for a better match.` : 'This is the first attempt.'}

Based on all the above, generate the complete CSS code now.`,
    },
  ];

  // Add images if provided
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
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate CSS that will transform a web page to match a target design.',
    },
    {
      role: 'user',
      content: contentArray,
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages,
        temperature,
        max_tokens: maxTokensCss,
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
      let content = data.choices[0].message.content;

      // Clean the response by removing markdown code blocks if present
      content = content
        .replace(/```css\s*/g, '')
        .replace(/```\s*$/g, '')
        .replace(/```/g, '')
        .trim();

      return content;
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating CSS:', error);
    throw error;
  }
};

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
  // Debug logging to inspect the inputs
  console.log('DEBUG: Creating enhanced class tree with node:', node);
  console.log('DEBUG: Tailwind data available:', tailwindData);

  // Create the base node
  const enhancedNode: EnhancedTreeNode = {
    element: node.element,
    portalClasses: [],
  };

  // Add portal classes with associated tailwind classes
  if (node.portalClasses && node.portalClasses.length > 0) {
    enhancedNode.portalClasses = node.portalClasses.map((cls) => {
      const tailwindClasses = tailwindData[cls] || [];
      console.log(
        `DEBUG: Portal class ${cls} has Tailwind classes:`,
        tailwindClasses,
      );
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
 * @returns Formatted hierarchy string
 */
function formatHierarchyForPrompt(
  node: EnhancedTreeNode,
  depth: number = 0,
): string {
  let result = '';
  const indent = '  '.repeat(depth);

  // Add element with its depth
  result += `${indent}${node.element}\n`;

  // Add portal classes
  if (node.portalClasses && node.portalClasses.length > 0) {
    node.portalClasses.forEach((cls) => {
      result += `${indent}  • ${cls.name}`;

      // Show count of tailwind classes
      if (cls.tailwindClasses && cls.tailwindClasses.length > 0) {
        result += ` (${cls.tailwindClasses.length} Tailwind classes: ${cls.tailwindClasses.join(', ')})`;
      }

      result += '\n';
    });
  }

  // Process children with increased depth
  if (node.children && node.children.length > 0) {
    node.children.forEach((child) => {
      result += formatHierarchyForPrompt(child, depth + 1);
    });
  }

  return result;
}

/**
 * Evaluate CSS results using OpenAI API
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param resultScreenshot The screenshot with applied CSS
 * @param currentCSS The current applied CSS
 * @returns Promise resolving to evaluation results {isMatch: boolean, feedback: string}
 */
export const evaluateCSSResultWithAI = async (
  apiKey: string,
  referenceImage: string,
  resultScreenshot: string,
  currentCSS: string,
): Promise<{ isMatch: boolean; feedback: string }> => {
  const url = 'https://api.openai.com/v1/chat/completions';
  const { model, maxTokensEval } = await getApiParameters();

  // Use a lower temperature for evaluation for more consistent results
  const evaluationTemperature = 0.5;

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis and CSS. Your task is to evaluate if the applied CSS has successfully transformed the page to match the reference design. Be thorough in your analysis but constructive in your feedback for what needs improvement.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I've applied CSS to a page to make it match a reference design. I need you to evaluate how well the transformation worked and either return DONE if it's good enough or provide improved CSS.

INSTRUCTIONS:
1. The FIRST image is the REFERENCE design (what we want to achieve)
2. The SECOND image is the CURRENT state (with the applied CSS)
3. Analyze both images and determine if they visually match closely enough
4. Use a high standard for "match" - look for pixel-perfect matching of:
   - Colors (backgrounds, text, borders)
   - Typography (size, weight, family, spacing)
   - Spacing (padding, margins, alignment)
   - Size and position of elements
   - Visual effects (shadows, borders, etc.)
5. If the current state matches the reference design well enough, respond with ONLY the text "DONE" (no JSON, no explanation)
6. If they don't match well enough, respond with COMPLETE, VALID CSS (no explanations, no markdown, just CSS code) that would improve the current state to better match the reference.
7. Here is the CSS that was applied:

\`\`\`css
${currentCSS}
\`\`\`

DO NOT respond with JSON format. If it's a good match, respond ONLY with the word "DONE". If improvements are needed, respond ONLY with the complete CSS.`,
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

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages,
        temperature: evaluationTemperature,
        max_tokens: maxTokensEval,
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
      const result = data.choices[0].message.content.trim();

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
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error evaluating CSS result:', error);
    throw error;
  }
};
