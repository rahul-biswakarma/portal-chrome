import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { captureScreenshot } from '@/utils/screenshot';
import { makeGeminiRequest, isValidImageData } from '@/utils/gemini-client';
import type { GeminiMessage, MessagePart } from '@/utils/gemini-client';
import { getEnvVariable } from '@/utils/environment';

// Define the structure of a theme object
export interface Theme {
  name: string; // e.g., "Vibrant Dusk", "Minimalist Ocean"
  headingFont: string;
  paragraphFont: string;
  accentColor: string; // HEX
  accentLabelColor: string; // HEX
  neutralColor: string; // HEX
  spacingUnit: number;
  radiusUnit: number;
  borderWidthUnit: number;
}

interface ThemeSuggestionsProps {
  onApplyTheme: (theme: Theme) => void;
  // Current theme values to send to Gemini for context
  currentTheme?: {
    headingFont: string;
    paragraphFont: string;
    accentColor: string;
    accentLabelColor: string;
    neutralColor: string;
    spacingUnit: number;
    radiusUnit: number;
    borderWidthUnit: number;
  };
}

// Helper function to convert data URL to base64
const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

// Function to generate themes using Gemini AI
const generateThemesWithGemini = async (
  currentTheme?: ThemeSuggestionsProps['currentTheme'],
): Promise<Theme[]> => {
  try {
    // Get Gemini API key
    const apiKey = await getEnvVariable('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Gemini API key not found. Please set it in Settings.');
    }

    // Capture current page screenshot
    const screenshot = await captureScreenshot({ fullPage: false });

    // Create the prompt for theme generation
    const themePrompt = `You are an expert UI/UX designer specializing in theme generation for web applications.

TASK: Generate 6 diverse, professional theme suggestions based on the current page screenshot and theme context.

CURRENT THEME CONTEXT:
${
  currentTheme
    ? `
- Heading Font: ${currentTheme.headingFont}
- Paragraph Font: ${currentTheme.paragraphFont}
- Accent Color: ${currentTheme.accentColor}
- Accent Label Color: ${currentTheme.accentLabelColor}
- Neutral Color: ${currentTheme.neutralColor}
- Spacing Unit: ${currentTheme.spacingUnit}px
- Radius Unit: ${currentTheme.radiusUnit}px
- Border Width: ${currentTheme.borderWidthUnit}px
`
    : 'No current theme data available'
}

REQUIREMENTS:
1. Generate 6 unique themes with creative names
2. Each theme should be professionally designed and cohesive
3. Vary font combinations from: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Source Sans Pro, Nunito Sans, Work Sans, DM Sans
4. Create harmonious color schemes with proper contrast
5. Suggest appropriate spacing, radius, and border values
6. Ensure themes work well for the application shown in the screenshot
7. Make themes distinct from each other and the current theme

RESPONSE FORMAT:
Return a valid JSON array with exactly 6 theme objects. Each theme must have this exact structure:

[
  {
    "name": "Theme Name",
    "headingFont": "Font Name",
    "paragraphFont": "Font Name",
    "accentColor": "#HEXCODE",
    "accentLabelColor": "#HEXCODE",
    "neutralColor": "#HEXCODE",
    "spacingUnit": number,
    "radiusUnit": number,
    "borderWidthUnit": number
  }
]

IMPORTANT: Return ONLY the JSON array, no other text or explanations.`;

    // Build message parts
    const parts: MessagePart[] = [{ text: themePrompt }];

    // Add screenshot if valid
    if (isValidImageData(screenshot)) {
      const imgData = dataUrlToBase64(screenshot);
      const mimeType = screenshot.split(';')[0].split(':')[1];
      parts.push({
        inline_data: {
          data: imgData,
          mime_type: mimeType,
        },
      });
    }

    // Prepare messages for Gemini
    const messages: GeminiMessage[] = [
      {
        role: 'user',
        parts,
      },
    ];

    // Get model from environment or use default
    const model =
      (await getEnvVariable('GEMINI_MODEL')) ||
      'gemini-2.5-flash-preview-05-20';

    // Make request to Gemini
    const response = await makeGeminiRequest({
      apiKey,
      messages,
      modelName: model,
      sessionId: `theme_gen_${Date.now()}`,
      temperature: 0.7, // Higher creativity for theme generation
    });

    // Parse JSON response
    try {
      // Clean the response - remove any markdown formatting
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const themes = JSON.parse(cleanResponse) as Theme[];

      // Validate that we got an array of themes
      if (!Array.isArray(themes) || themes.length === 0) {
        throw new Error('Invalid response format from Gemini');
      }

      // Validate each theme has required properties
      themes.forEach((theme, index) => {
        if (
          !theme.name ||
          !theme.headingFont ||
          !theme.paragraphFont ||
          !theme.accentColor ||
          !theme.accentLabelColor ||
          !theme.neutralColor ||
          typeof theme.spacingUnit !== 'number' ||
          typeof theme.radiusUnit !== 'number' ||
          typeof theme.borderWidthUnit !== 'number'
        ) {
          throw new Error(`Invalid theme structure at index ${index}`);
        }
      });

      return themes;
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', response);
      throw new Error('Failed to parse theme suggestions from Gemini');
    }
  } catch (error) {
    console.error('Error generating themes with Gemini:', error);
    throw error;
  }
};

// Mock function to simulate LLM theme generation (fallback)
const generateMockThemes = (): Theme[] => {
  const mockThemes: Theme[] = [];
  const baseFonts = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat'];
  const baseColors = [
    { accent: '#8B5CF6', label: '#FFFFFF', neutral: '#F3F4F6' }, // Purple
    { accent: '#10B981', label: '#FFFFFF', neutral: '#F0FDF4' }, // Green
    { accent: '#3B82F6', label: '#FFFFFF', neutral: '#EFF6FF' }, // Blue
    { accent: '#F59E0B', label: '#000000', neutral: '#FFFBEB' }, // Amber
    { accent: '#EF4444', label: '#FFFFFF', neutral: '#FEF2F2' }, // Red
    { accent: '#6366F1', label: '#FFFFFF', neutral: '#EEF2FF' }, // Indigo
  ];

  for (let i = 0; i < 6; i++) {
    mockThemes.push({
      name: `Fallback Theme ${i + 1}`,
      headingFont: baseFonts[i % baseFonts.length],
      paragraphFont: baseFonts[(i + 1) % baseFonts.length],
      accentColor: baseColors[i % baseColors.length].accent,
      accentLabelColor: baseColors[i % baseColors.length].label,
      neutralColor: baseColors[i % baseColors.length].neutral,
      spacingUnit: 4 + i, // e.g., 4px, 5px, ...
      radiusUnit: 2 + i, // e.g., 2px, 3px, ...
      borderWidthUnit: 1, // Keep border width at 1px for mock themes for now
    });
  }
  return mockThemes;
};

export const ThemeSuggestions = ({
  onApplyTheme,
  currentTheme,
}: ThemeSuggestionsProps) => {
  const [suggestedThemes, setSuggestedThemes] = useState<Theme[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try to generate themes with Gemini
      const themes = await generateThemesWithGemini(currentTheme);
      setSuggestedThemes(themes);
      console.log('Successfully generated themes with Gemini:', themes);
    } catch (error) {
      console.error(
        'Failed to generate themes with Gemini, using fallback:',
        error,
      );
      setError(
        error instanceof Error ? error.message : 'Failed to generate AI themes',
      );

      // Fallback to mock themes
      setSuggestedThemes(generateMockThemes());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground">
          🎨 AI Theme Suggestions
        </h2>
        <Button onClick={handleGenerateClick} disabled={isLoading}>
          {isLoading ? '🤖 Generating...' : '✨ Generate Themes'}
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded flex items-center gap-2">
          <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          Analyzing page and generating personalized themes with Gemini AI...
        </div>
      )}

      {error && (
        <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
          ⚠️ {error}. Using fallback themes.
        </div>
      )}

      {suggestedThemes && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {suggestedThemes.map((theme, index) => (
            <Card key={index} className="bg-card text-card-foreground">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{theme.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1 pb-2">
                <div className="flex items-center gap-1">
                  <span className="font-medium">Accent:</span>
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: theme.accentColor }}
                  />
                  <span className="text-xs">{theme.accentColor}</span>
                </div>
                <p>
                  <span className="font-medium">Heading:</span>{' '}
                  {theme.headingFont}
                </p>
                <p>
                  <span className="font-medium">Paragraph:</span>{' '}
                  {theme.paragraphFont}
                </p>
                <p>
                  <span className="font-medium">Spacing:</span>{' '}
                  {theme.spacingUnit}px
                </p>
              </CardContent>
              <CardFooter className="pt-2">
                <Button
                  onClick={() => onApplyTheme(theme)}
                  size="sm"
                  className="w-full text-xs"
                >
                  Apply Theme
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
