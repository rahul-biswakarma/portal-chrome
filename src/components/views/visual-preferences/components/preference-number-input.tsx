import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { DetectedElement } from '../types';

interface PreferenceNumberInputProps {
  option: DetectedElement['availablePreferences'][0];
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
}

export const PreferenceNumberInput: React.FC<PreferenceNumberInputProps> = ({
  option,
  value,
  onChange,
  onReset,
}) => {
  const range = option.metadata?.range || { min: 0, max: 1000, step: 1 };
  const unit = option.metadata?.range?.unit || option.metadata?.unit || '';

  // Ensure we have a valid number value, prioritizing the passed value prop
  let currentValue: number;
  if (typeof value === 'number' && !isNaN(value)) {
    currentValue = value;
  } else if (typeof option.currentValue === 'number' && !isNaN(option.currentValue)) {
    currentValue = option.currentValue;
  } else {
    currentValue = range.min;
  }

  // Apply range constraints
  currentValue = Math.max(range.min, Math.min(range.max, currentValue));

  console.log(`🔢 Number input ${option.id} render:`, {
    propValue: value,
    currentValue,
    defaultValue: option.currentValue,
    range,
    unit,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = parseFloat(e.target.value);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(range.min, Math.min(range.max, numValue));
      console.log(`🔢 Number input ${option.id} changed:`, clampedValue);
      onChange(clampedValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5 flex-1 min-w-0">
          <Label htmlFor={option.id} className="text-sm font-medium">
            {option.label}
          </Label>
          {option.description && (
            <p className="text-xs text-muted-foreground truncate">{option.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-3">
          {unit && <div className="text-sm text-muted-foreground">{unit}</div>}
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

      <div className="space-y-1">
        <Input
          id={option.id}
          type="number"
          value={currentValue}
          onChange={handleChange}
          min={range.min}
          max={range.max}
          step={range.step}
          className="h-7 font-mono"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Min: {range.min}</span>
          <span>Max: {range.max}</span>
        </div>
      </div>
    </div>
  );
};
