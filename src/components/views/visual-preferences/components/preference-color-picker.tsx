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

  console.log(`🎨 Color picker ${uniqueKey || option.id} render:`, {
    propValue: value,
    currentValue,
    defaultValue: option.currentValue,
    uniqueKey,
  });

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-card" key={uniqueKey}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor={`${uniqueKey || option.id}-color`} className="text-sm font-medium">
            {option.label}
          </Label>
          {option.description && (
            <p className="text-xs text-muted-foreground">{option.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
              title="Reset to default"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          <div
            className="w-8 h-8 rounded-md border-2 border-border shadow-sm"
            style={{ backgroundColor: currentValue }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {/* Color input */}
        <input
          id={`${uniqueKey || option.id}-color`}
          type="color"
          value={currentValue}
          onChange={e => {
            const newValue = e.target.value;
            console.log(`🎨 Color picker ${uniqueKey || option.id} changed:`, newValue);
            onChange(newValue);
          }}
          className="w-full h-8 rounded border cursor-pointer"
          style={{ colorScheme: 'light' }}
        />

        {/* Hex input for manual entry */}
        <input
          type="text"
          value={currentValue}
          onChange={e => {
            const newValue = e.target.value;
            if (newValue === '' || /^#[0-9A-Fa-f]*$/.test(newValue)) {
              // Allow partial hex values while typing
              console.log(`🎨 Color picker ${uniqueKey || option.id} hex changed:`, newValue);
              onChange(newValue);
            }
          }}
          onBlur={e => {
            // Validate and fix on blur
            const fixedValue = validateAndFixColor(e.target.value);
            if (fixedValue !== e.target.value) {
              console.log(`🎨 Color picker ${uniqueKey || option.id} fixed:`, fixedValue);
              onChange(fixedValue);
            }
          }}
          placeholder="#ffffff"
          className="w-full px-2 py-1 text-xs border rounded font-mono bg-background"
          maxLength={7}
        />
      </div>
    </div>
  );
};
