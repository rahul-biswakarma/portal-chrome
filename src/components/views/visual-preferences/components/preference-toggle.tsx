import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { PreferenceOption } from '../types';

interface PreferenceToggleProps {
  option: PreferenceOption;
  value: boolean;
  onChange: (value: boolean) => void;
}

export const PreferenceToggle: React.FC<PreferenceToggleProps> = ({ option, value, onChange }) => {
  return (
    <div className="flex items-center justify-between space-x-2">
      <div className="space-y-0.5">
        <Label htmlFor={option.id} className="text-sm font-medium">
          {option.label}
        </Label>
        {option.description && (
          <p className="text-xs text-muted-foreground">{option.description}</p>
        )}
      </div>
      <Switch
        id={option.id}
        checked={value}
        onCheckedChange={onChange}
        aria-describedby={option.description ? `${option.id}-description` : undefined}
      />
    </div>
  );
};
