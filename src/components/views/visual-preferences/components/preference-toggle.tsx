import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { DetectedElement } from '../types';

interface PreferenceToggleProps {
  option: DetectedElement['availablePreferences'][0];
  value: boolean;
  onChange: (value: boolean) => void;
  onReset?: () => void;
  uniqueKey?: string;
}

export const PreferenceToggle: React.FC<PreferenceToggleProps> = ({
  option,
  value,
  onChange,
  onReset,
  uniqueKey,
}) => {
  console.log(`🎛️ Toggle ${uniqueKey || option.id} render:`, {
    propValue: value,
    defaultValue: option.currentValue,
    uniqueKey,
  });

  return (
    <div className="flex items-center justify-between space-x-2" key={uniqueKey}>
      <div className="space-y-0.5">
        <Label htmlFor={`${uniqueKey || option.id}-toggle`} className="text-sm font-medium">
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
        <Switch
          id={`${uniqueKey || option.id}-toggle`}
          checked={value}
          onCheckedChange={checked => {
            console.log(`🎛️ Toggle ${uniqueKey || option.id} changed:`, checked);
            onChange(checked);
          }}
          aria-describedby={
            option.description ? `${uniqueKey || option.id}-description` : undefined
          }
        />
      </div>
    </div>
  );
};
