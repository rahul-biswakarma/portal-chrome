import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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
  // We can add currentTheme if the LLM needs context, but not for mock generation
}

// Mock function to simulate LLM theme generation
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
      name: `Suggested Theme ${i + 1}`,
      headingFont: baseFonts[i % baseFonts.length],
      paragraphFont: baseFonts[(i + 1) % baseFonts.length],
      accentColor: baseColors[i % baseColors.length].accent,
      accentLabelColor: baseColors[i % baseColors.length].label,
      neutralColor: baseColors[i % baseColors.length].neutral,
      spacingUnit: parseFloat((0.2 + i * 0.01).toFixed(2)),
      radiusUnit: parseFloat((0.05 + i * 0.005).toFixed(3)),
      borderWidthUnit: parseFloat((0.05 + i * 0.005).toFixed(3)),
    });
  }
  return mockThemes;
};

export const ThemeSuggestions = ({ onApplyTheme }: ThemeSuggestionsProps) => {
  const [suggestedThemes, setSuggestedThemes] = useState<Theme[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateClick = async () => {
    setIsLoading(true);
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSuggestedThemes(generateMockThemes());
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground">
          AI Theme Suggestions
        </h2>
        <Button onClick={handleGenerateClick} disabled={isLoading}>
          {isLoading ? 'Generating...' : '✨ Generate Themes'}
        </Button>
      </div>

      {suggestedThemes && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suggestedThemes.map((theme, index) => (
            <Card key={index} className="bg-card text-card-foreground">
              <CardHeader>
                <CardTitle className="text-md">{theme.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Accent:</span>
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: theme.accentColor }}
                  />
                  <span>{theme.accentColor}</span>
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
                  {theme.spacingUnit}rem
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={() => onApplyTheme(theme)}
                  size="sm"
                  className="w-full"
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
