import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { DetectedElement } from '../types';

interface PreferenceTextInputProps {
  option: DetectedElement['availablePreferences'][0];
  value: string;
  onChange: (value: string) => void;
  onReset?: () => void;
}

export const PreferenceTextInput: React.FC<PreferenceTextInputProps> = ({
  option,
  value,
  onChange,
  onReset,
}) => {
  const currentValue = value || (option.currentValue as string) || '';
  const placeholder = option.metadata?.placeholder || `Enter ${option.label.toLowerCase()}...`;
  const maxLength = option.metadata?.maxLength || 100;

  return (
    <div className="space-y-2 p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Label htmlFor={option.id} className="text-sm font-medium">
            {option.label}
          </Label>
          {option.description && (
            <p className="text-xs text-muted-foreground">{option.description}</p>
          )}
        </div>
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
      </div>

      <div className="space-y-1">
        <Input
          id={option.id}
          type="text"
          value={currentValue}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full"
        />
        {maxLength && (
          <p className="text-xs text-muted-foreground text-right">
            {currentValue.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
};
