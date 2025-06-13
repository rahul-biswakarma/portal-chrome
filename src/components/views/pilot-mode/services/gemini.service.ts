import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateEvaluationWithGemini(
  apiKey: string,
  prompt: string,
  _currentCSS: string,
  _referenceImageUrl: string | undefined,
  currentScreenshot: string,
  _computedStyles: Record<string, Record<string, string>>
): Promise<string | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/png',
          data: currentScreenshot.split(',')[1],
        },
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating evaluation with Gemini:', error);
    return null;
  }
}
