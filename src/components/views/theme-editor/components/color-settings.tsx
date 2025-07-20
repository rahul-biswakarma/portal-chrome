import React from 'react';
import { HexColorPicker } from 'react-colorful';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ColorSettingsProps } from '../types';
import { isValidHexColor } from '../utils';

export const ColorSettings: React.FC<ColorSettingsProps> = ({ colors, onColorsChange }) => {
  const ColorInputRow = ({
    label,
    id,
    value,
    onChange,
    description,
  }: {
    label: string;
    id: string;
    value: string;
    onChange: (value: string) => void;
    description?: string;
  }) => {
    const isValid = isValidHexColor(value);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex-1">
            <Label htmlFor={id} className="text-sm font-medium text-foreground">
              {label}
            </Label>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-12 h-12 rounded-md border-2 border-border hover:border-primary transition-colors shadow-sm cursor-pointer bg-transparent relative overflow-hidden"
                  style={{ backgroundColor: isValid ? value : '#000000' }}
                  aria-label={`Pick color for ${label}`}
                >
                  <span className="sr-only">Open color picker</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" side="right">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-center text-muted-foreground">
                    {(isValid ? value : '#000000').toUpperCase()}
                  </div>
                  <HexColorPicker color={isValid ? value : '#000000'} onChange={onChange} />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {!isValid && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Invalid color format. Please use a valid hex color (e.g., #FF5733).
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  const handleAccentChange = (color: string) => {
    onColorsChange({ ...colors, accent: color });
  };

  const handleAccentLabelChange = (color: string) => {
    onColorsChange({ ...colors, accentLabel: color });
  };

  const handleNeutralChange = (color: string) => {
    onColorsChange({ ...colors, neutral: color });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Color Settings</h3>
        <p className="text-sm text-muted-foreground">
          Customize the color scheme for your theme. Changes are applied in real-time.
        </p>
      </div>

      <div className="space-y-6">
        <ColorInputRow
          label="Primary Accent Color"
          id="accent-color"
          value={colors.accent}
          onChange={handleAccentChange}
          description="Main brand color used for buttons, links, and highlights"
        />

        <ColorInputRow
          label="Accent Text Color"
          id="accent-label-color"
          value={colors.accentLabel}
          onChange={handleAccentLabelChange}
          description="Text color that appears on accent backgrounds"
        />

        <ColorInputRow
          label="Background Color"
          id="neutral-color"
          value={colors.neutral}
          onChange={handleNeutralChange}
          description="Main background color for cards and surfaces"
        />
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h4 className="text-sm font-medium mb-2">Color Preview</h4>
        <div className="flex gap-2">
          <div
            className="w-8 h-8 rounded border"
            style={{ backgroundColor: colors.accent }}
            title="Accent Color"
          />
          <div
            className="w-8 h-8 rounded border"
            style={{ backgroundColor: colors.accentLabel }}
            title="Accent Label Color"
          />
          <div
            className="w-8 h-8 rounded border"
            style={{ backgroundColor: colors.neutral }}
            title="Neutral Color"
          />
        </div>
      </div>
    </div>
  );
};
