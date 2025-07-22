import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { DetectedElement } from '../types';

interface PreferenceColorPickerProps {
  option: DetectedElement['availablePreferences'][0];
  value: string;
  onChange: (value: string) => void;
  onReset?: () => void;
  uniqueKey?: string;
}

export const PreferenceColorPicker: React.FC<PreferenceColorPickerProps> = ({
  option,
  value,
  onChange,
  onReset,
  uniqueKey,
}) => {
  const validateAndFixColor = (color: string): string => {
    if (!color || !color.startsWith('#')) return '#ffffff';

    // Remove any non-hex characters
    const hexOnly = color.slice(1).replace(/[^0-9A-Fa-f]/g, '');

    // Handle different lengths
    if (hexOnly.length === 3) {
      // Convert #abc to #aabbcc
      return `#${hexOnly[0]}${hexOnly[0]}${hexOnly[1]}${hexOnly[1]}${hexOnly[2]}${hexOnly[2]}`;
    } else if (hexOnly.length === 6) {
      return `#${hexOnly}`;
    } else if (hexOnly.length < 6) {
      // Pad with zeros to make valid 6-digit hex
      return `#${hexOnly.padEnd(6, '0')}`;
    } else {
      // Truncate to 6 digits
      return `#${hexOnly.slice(0, 6)}`;
    }
  };

  const currentValue = validateAndFixColor(value || (option.currentValue as string) || '#ffffff');
  const colorInputId = `color-${uniqueKey || option.id}`;

  console.log(`🎨 Color picker ${uniqueKey || option.id} render:`, {
    propValue: value,
    currentValue,
    defaultValue: option.currentValue,
    uniqueKey,
  });

  return (
    <div className="space-y-2" key={uniqueKey}>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5 flex-1 min-w-0">
          <Label htmlFor={`${uniqueKey || option.id}-text`} className="text-sm font-medium">
            {option.label}
          </Label>
          {option.description && (
            <p className="text-xs text-muted-foreground truncate">{option.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-3">
          <div className="flex items-center gap-2">
            {/* Color swatch as label for hidden color input */}
            <label
              htmlFor={colorInputId}
              className="w-8 h-8 rounded border border-border/50 cursor-pointer hover:border-border transition-colors shadow-sm block relative"
              style={{ backgroundColor: currentValue }}
              title="Click to open color picker"
            >
              <input
                id={colorInputId}
                type="color"
                value={currentValue}
                onChange={e => {
                  const newValue = e.target.value;
                  console.log(`🎨 Color picker ${uniqueKey || option.id} changed:`, newValue);
                  onChange(newValue);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{
                  transform: 'translateX(-50px)', // Shift the actual input to the left to influence picker placement
                }}
              />
            </label>
            <input
              id={`${uniqueKey || option.id}-text`}
              type="text"
              value={currentValue}
              onChange={e => {
                const newValue = e.target.value;
                if (newValue === '' || /^#[0-9A-Fa-f]*$/.test(newValue)) {
                  console.log(`🎨 Color picker ${uniqueKey || option.id} hex changed:`, newValue);
                  onChange(newValue);
                }
              }}
              onBlur={e => {
                const fixedValue = validateAndFixColor(e.target.value);
                if (fixedValue !== e.target.value) {
                  console.log(`🎨 Color picker ${uniqueKey || option.id} fixed:`, fixedValue);
                  onChange(fixedValue);
                }
              }}
              className="w-16 h-7 px-2 text-xs font-mono border border-border/50 rounded bg-background focus:border-ring focus:outline-none"
              placeholder="#ffffff"
              maxLength={7}
            />
          </div>
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive rounded-md"
              title="Reset to default"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
