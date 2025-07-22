import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { DetectedElement } from '../types';

interface PreferenceSliderProps {
  option: DetectedElement['availablePreferences'][0];
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
}

export const PreferenceSlider: React.FC<PreferenceSliderProps> = ({
  option,
  value,
  onChange,
  onReset,
}) => {
  const range = option.metadata?.range || { min: 0, max: 100, step: 1 };
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

  console.log(`🎛️ Slider ${option.id} render:`, {
    propValue: value,
    currentValue,
    defaultValue: option.currentValue,
    range,
    unit,
  });

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor={option.id} className="text-sm font-medium">
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
          <div className="text-sm font-mono bg-muted px-2 py-1 rounded">
            {currentValue}
            {unit}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Slider
          id={option.id}
          min={range.min}
          max={range.max}
          step={range.step}
          value={[currentValue]}
          onValueChange={values => {
            const newValue = values[0];
            console.log(`🎛️ Slider ${option.id} changed:`, newValue);
            onChange(newValue);
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {range.min}
            {unit}
          </span>
          <span>
            {range.max}
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
};
