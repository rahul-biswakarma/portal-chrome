import type { TreeNode, TailwindClassData } from '../types';
import { getFromStorage } from '../utils/storage';

const API_KEY_STORAGE_KEY = 'openAIApiKey';

/**
 * Get the stored OpenAI API key
 * @returns Promise resolving to the API key or null if not set
 */
export const getOpenAIApiKey = async (): Promise<string | null> => {
  try {
    return await getFromStorage<string | null>(API_KEY_STORAGE_KEY, null);
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
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';

  // Create a simplified version of the tree for the LLM
  const simplifiedTree = simplifyTree(portalClassTree);

  // Simplify the tailwind data to only show essential information
  const simplifiedTailwindData: Record<string, string[]> = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach((selector) => {
      if (/^portal-.*$/.test(selector)) {
        simplifiedTailwindData[selector] = tailwindData[selector];
      }
    });
  }

  // Improved prompt for pixel-perfect matching and visual fidelity
  const improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current design visually match the desired outcome. Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate CSS that will transform a web page to match a target design.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `USER REQUEST: "${improvedPrompt}"

DOM STRUCTURE:
The following is a tree of elements with their portal-* classes. Use these class names in your CSS selectors.
${retryCount === 0 ? JSON.stringify(simplifiedTree, null, 2) : JSON.stringify(simplifiedTree)}

TAILWIND DATA:
Some elements already have Tailwind classes applied. Your CSS needs to override these when necessary.
${Object.keys(simplifiedTailwindData).length > 0 ? JSON.stringify(simplifiedTailwindData, null, 2) : 'No Tailwind data available.'}

CURRENT CSS FILE:
${currentCSS}

INSTRUCTIONS:
1. Write CSS that will transform the current design to match the target design.
2. ONLY create selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Ensure your CSS is pixel-perfect and precisely matches the visual design.
4. Do not use element selectors, IDs, or non-portal- classes.
5. Include !important where necessary to override existing styles.
6. Your output must be a COMPLETE CSS file including:
   - All existing styles with your necessary modifications
   - New styles organized in logical sections
   - Comments explaining your styling approach and changes
7. Focus on ALL visual aspects:
   - Colors (backgrounds, text, borders, etc.)
   - Typography (size, weight, family, spacing)
   - Padding, margins, alignment
   - Shadows, effects, and transitions
   - Border radius and border styling
8. RESPOND ONLY WITH VALID CSS CODE. No explanations, no markdown, only the CSS code.`,
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
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000,
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

/**
 * Simplify a tree node structure for LLM processing
 * @param node The tree node to simplify
 * @returns The simplified tree
 */
const simplifyTree = (node: TreeNode): any => {
  return {
    element: node.element,
    portalClasses: node.portalClasses,
    children: node.children.map(simplifyTree),
  };
};
