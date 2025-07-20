import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import type { FontSettingsProps } from '../types';

// Popular Google Fonts for theme editing
const POPULAR_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Source Sans Pro',
  'Oswald',
  'Raleway',
  'PT Sans',
  'Lora',
  'Playfair Display',
  'Nunito',
  'Ubuntu',
  'Poppins',
  'Merriweather',
  'Crimson Text',
  'Work Sans',
  'Fira Sans',
  'DM Sans',
  'Space Grotesk',
] as const;

export const FontSettings: React.FC<FontSettingsProps> = ({ fonts, onFontsChange }) => {
  const FontSelector = ({
    label,
    value,
    onChange,
    description,
    previewText,
  }: {
    label: string;
    value: string;
    onChange: (font: string) => void;
    description?: string;
    previewText?: string;
  }) => {
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium text-foreground">{label}</Label>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {POPULAR_FONTS.slice(0, 12).map(font => (
            <Button
              key={font}
              variant={value === font ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange(font)}
              className="justify-start text-left h-auto py-2 px-3"
              style={{ fontFamily: `'${font}', system-ui, sans-serif` }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="truncate">{font}</span>
                {value === font && <Check className="h-3 w-3 ml-1 flex-shrink-0" />}
              </div>
            </Button>
          ))}
        </div>

        {previewText && (
          <div className="p-3 bg-muted rounded-md">
            <p style={{ fontFamily: `'${value}', system-ui, sans-serif` }} className="text-sm">
              {previewText}
            </p>
          </div>
        )}
      </div>
    );
  };

  const handleHeadingFontChange = (font: string) => {
    onFontsChange({ ...fonts, heading: font });
  };

  const handleParagraphFontChange = (font: string) => {
    onFontsChange({ ...fonts, paragraph: font });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Typography</h3>
        <p className="text-sm text-muted-foreground">
          Choose fonts for headings and body text. All fonts are loaded from Google Fonts.
        </p>
      </div>

      <div className="space-y-6">
        <FontSelector
          label="Heading Font"
          value={fonts.heading}
          onChange={handleHeadingFontChange}
          description="Used for h1, h2, h3, h4, h5, h6 elements"
          previewText="The quick brown fox jumps over the lazy dog"
        />

        <FontSelector
          label="Body Font"
          value={fonts.paragraph}
          onChange={handleParagraphFontChange}
          description="Used for paragraphs and general text content"
          previewText="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
        />
      </div>

      {fonts.heading !== fonts.paragraph && (
        <div className="p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-medium mb-3">Font Combination Preview</h4>
          <div className="space-y-2">
            <h5
              style={{ fontFamily: `'${fonts.heading}', system-ui, sans-serif` }}
              className="text-lg font-semibold"
            >
              Sample Heading ({fonts.heading})
            </h5>
            <p
              style={{ fontFamily: `'${fonts.paragraph}', system-ui, sans-serif` }}
              className="text-sm text-muted-foreground"
            >
              Sample paragraph text using {fonts.paragraph}. This gives you a preview of how your
              chosen fonts work together.
            </p>
          </div>
        </div>
      )}

      {fonts.heading === fonts.paragraph && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center mt-0.5">
              <span className="text-white text-xs">i</span>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Same font for headings and body
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Using the same font creates a unified, minimalist look. Consider using different
                font weights to create hierarchy.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
