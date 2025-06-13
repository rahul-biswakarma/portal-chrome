import { getEnvVariable } from '../environment';
import { chatManager } from './session';
import type { GeminiRequestOptions, ApiParameters } from './types';

// Default API parameters
const DEFAULT_MODEL = 'gemini-2.0-flash';

export const getApiParameters = async (): Promise<ApiParameters> => {
  const model = (await getEnvVariable('GEMINI_MODEL')) || DEFAULT_MODEL;

  return {
    model,
    temperature: 0.7,
    maxTokens: 2048,
  };
};

/**
 * Get the stored Gemini API key
 */
export const getGeminiApiKey = async (): Promise<string | null> => {
  const result = await chrome.storage.sync.get('geminiApiKey');
  return result.geminiApiKey || null;
};

/**
 * Check if an image data URL is valid
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
 */
export const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

/**
 * Make a Gemini API request
 */
export async function makeGeminiRequest(options: GeminiRequestOptions): Promise<string> {
  const { apiKey, messages: newMessages, modelName, sessionId, temperature } = options;

  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  const url = `${baseUrl}/${modelName}:generateContent?key=${apiKey}`;

  const session = sessionId
    ? chatManager.getOrCreateSession(sessionId)
    : chatManager.createSession(`session_${Date.now()}`);

  // Add new messages to the session
  newMessages.forEach(msg => {
    session.addMessage(msg.role, msg.parts);
  });

  // Get all messages from the session
  const messagesFromSession = session.getMessages();

  // Used for tracking continuation attempts
  let fullContent = '';
  let continuationAttempts = 0;
  const MAX_CONTINUATION_ATTEMPTS = 10;

  // Keep track of whether we're in a continuation
  let continueGenerating = true;

  while (continueGenerating && continuationAttempts <= MAX_CONTINUATION_ATTEMPTS) {
    try {
      // Prepare messages for continuation
      const requestMessages = [...messagesFromSession];

      // If this is a continuation, add a continuation instruction
      if (continuationAttempts > 0) {
        requestMessages.push({
          role: 'user',
          parts: [{ text: 'Please continue your response from where you left off.' }],
        });
      }

      // Make the API request with properly structured messages
      const requestBody = {
        contents: requestMessages,
        generationConfig: {
          temperature: temperature !== undefined ? temperature : 0.2,
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
        throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
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
          session.addMessage('model', [{ text: fullContent }]);
        }

        // If we've reached max attempts, stop and return what we have
        if (continuationAttempts >= MAX_CONTINUATION_ATTEMPTS) {
          console.warn(
            `Reached maximum continuation attempts (${MAX_CONTINUATION_ATTEMPTS}). Returning partial content.`
          );
          continueGenerating = false;
          session.addMessage('model', [{ text: fullContent }]);
        }
      } else {
        // Handle cases where response is incomplete or empty
        const finishReason = data.candidates?.[0]?.finishReason;

        if (finishReason === 'MAX_TOKENS') {
          console.warn('Response hit MAX_TOKENS with no content. Attempting continuation...');
          continuationAttempts++;

          if (continuationAttempts >= MAX_CONTINUATION_ATTEMPTS) {
            console.warn(
              'Reached max continuation attempts, returning partial content if available.'
            );
            continueGenerating = false;
            if (fullContent) {
              session.addMessage('model', [{ text: fullContent }]);
            }
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
