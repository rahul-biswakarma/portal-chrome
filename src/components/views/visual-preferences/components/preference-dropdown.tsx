import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { DetectedElement } from '../types';

interface PreferenceDropdownProps {
  option: DetectedElement['availablePreferences'][0];
  value: string;
  onChange: (value: string) => void;
  onReset?: () => void;
}

export const PreferenceDropdown: React.FC<PreferenceDropdownProps> = ({
  option,
  value,
  onChange,
  onReset,
}) => {
  const availableValues = option.availableValues || [];

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
        {onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive rounded-md ml-3"
            title="Reset to default"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={option.id} className="h-7">
          <SelectValue placeholder={`Select ${option.label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {availableValues.map(optionValue => (
            <SelectItem key={String(optionValue)} value={String(optionValue)}>
              {String(optionValue)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
