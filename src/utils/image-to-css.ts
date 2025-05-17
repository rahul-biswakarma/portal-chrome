import { captureScreenshot } from './screenshot';
import { getEnvVariable } from './environment';

interface CSSFeedbackResponse {
  success: boolean;
  message: string;
  cssCode?: string;
}

interface PromptGenerationResponse {
  success: boolean;
  prompt: string;
}

/**
 * Converts a file to a data URL
 */
export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Sends images to OpenAI to generate a prompt for CSS generation
 */
export const generatePrompt = async (
  referenceImageURL: string,
  currentPageURL: string,
): Promise<PromptGenerationResponse> => {
  try {
    const apiKey = await getEnvVariable('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }

    // Make API call to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'I have a web page and a reference image. Create a prompt for another LLM that will generate CSS to make my current page look like the reference image. The next LLM will receive: 1) Both these images, 2) A hierarchy tree of classes with default Tailwind classes, 3) Instructions to only use combinations of given Tailwind classes. Create a detailed prompt that will help the next LLM generate accurate CSS.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: referenceImageURL,
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: currentPageURL,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    return {
      success: true,
      prompt: data.choices[0].message.content,
    };
  } catch (error) {
    console.error('Error generating prompt:', error);
    return {
      success: false,
      prompt: 'Failed to generate prompt',
    };
  }
};

/**
 * Generates CSS based on the provided prompt and images
 */
export const generateCSS = async (
  prompt: string,
  referenceImageURL: string,
  currentPageURL: string,
  classHierarchy: string,
): Promise<string> => {
  try {
    const apiKey = await getEnvVariable('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}\n\nClass hierarchy with default Tailwind classes:\n${classHierarchy}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: referenceImageURL,
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: currentPageURL,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // Extract CSS code from the response
    const cssCode = extractCSSFromResponse(data.choices[0].message.content);
    return cssCode;
  } catch (error) {
    console.error('Error generating CSS:', error);
    throw error;
  }
};

/**
 * Helper function to extract CSS code from LLM response
 */
const extractCSSFromResponse = (response: string): string => {
  // Look for CSS code blocks in markdown format
  const cssRegex = /```css\s*([\s\S]*?)\s*```/;
  const match = response.match(cssRegex);

  if (match && match[1]) {
    return match[1].trim();
  }

  // If no CSS block found, return the whole text
  return response;
};

/**
 * Applies CSS to the current page
 */
export const applyCSS = async (
  tabId: number,
  cssCode: string,
): Promise<boolean> => {
  try {
    // Execute script to apply CSS
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (css: string) => {
        // Create or update style element
        let styleEl = document.getElementById('portal-generated-css');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'portal-generated-css';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
        return true;
      },
      args: [cssCode],
    });

    return true;
  } catch (error) {
    console.error('Error applying CSS:', error);
    return false;
  }
};

/**
 * Evaluates if the generated CSS makes the page look like the reference image
 */
export const evaluateCSSResult = async (
  referenceImageURL: string,
  newScreenshotURL: string,
  cssCode: string,
): Promise<CSSFeedbackResponse> => {
  try {
    const apiKey = await getEnvVariable('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: "Compare these two images: the reference design and the current page with applied CSS. Does the current page now look like the reference design? If yes, respond with 'SUCCESS'. If no, explain what needs to be improved and provide updated CSS code to make it match better.",
              },
              {
                type: 'image_url',
                image_url: {
                  url: referenceImageURL,
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: newScreenshotURL,
                },
              },
              {
                type: 'text',
                text: `Current CSS code:\n\`\`\`css\n${cssCode}\n\`\`\``,
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const content = data.choices[0].message.content;
    const isSuccess = content.includes('SUCCESS');

    if (isSuccess) {
      return {
        success: true,
        message: 'The CSS successfully matches the reference design.',
      };
    } else {
      // Extract new CSS if provided
      const newCssCode = extractCSSFromResponse(content);

      return {
        success: false,
        message: content,
        cssCode: newCssCode !== cssCode ? newCssCode : undefined,
      };
    }
  } catch (error) {
    console.error('Error evaluating CSS result:', error);
    return {
      success: false,
      message: 'Error evaluating CSS result',
    };
  }
};

/**
 * Main function to handle the entire image-to-CSS workflow
 */
export const processReferenceImage = async (
  referenceImage: File,
  tabId: number,
  classHierarchy: string,
  maxIterations = 5,
): Promise<{ success: boolean; message: string }> => {
  try {
    // Convert reference image to data URL
    const referenceImageURL = await fileToDataURL(referenceImage);

    // Initial screenshot
    const initialScreenshot = await captureScreenshot();

    // Generate prompt
    const promptResponse = await generatePrompt(
      referenceImageURL,
      initialScreenshot,
    );
    if (!promptResponse.success) {
      return { success: false, message: 'Failed to generate prompt' };
    }

    // Start CSS generation and feedback loop
    let cssCode = '';
    let currentScreenshot = initialScreenshot;
    let iterations = 0;
    let success = false;

    while (iterations < maxIterations && !success) {
      iterations++;

      // Send iteration update
      chrome.runtime.sendMessage({
        action: 'css-iteration-update',
        iteration: iterations,
      });

      // Generate CSS based on prompt
      cssCode = await generateCSS(
        promptResponse.prompt,
        referenceImageURL,
        currentScreenshot,
        classHierarchy,
      );

      // Apply CSS
      const appliedSuccessfully = await applyCSS(tabId, cssCode);
      if (!appliedSuccessfully) {
        return { success: false, message: 'Failed to apply CSS' };
      }

      // Take new screenshot after CSS applied
      currentScreenshot = await captureScreenshot();

      // Evaluate result
      const evaluation = await evaluateCSSResult(
        referenceImageURL,
        currentScreenshot,
        cssCode,
      );

      success = evaluation.success;

      if (!success && evaluation.cssCode) {
        // Apply updated CSS from feedback
        cssCode = evaluation.cssCode;
        await applyCSS(tabId, cssCode);
      }
    }

    return {
      success: true,
      message: success
        ? 'DevRev'
        : 'Maximum iterations reached without perfect match',
    };
  } catch (error) {
    console.error('Error in image-to-CSS workflow:', error);
    return { success: false, message: 'Error processing reference image' };
  }
};
