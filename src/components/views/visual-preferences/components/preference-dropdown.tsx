import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { PreferenceOption, PreferenceValue } from '../types';

interface PreferenceDropdownProps {
  option: PreferenceOption;
  value: string | undefined;
  onChange: (value: string) => void;
}

export const PreferenceDropdown: React.FC<PreferenceDropdownProps> = ({
  option,
  value,
  onChange,
}) => {
  const availableValues = (option.availableValues as PreferenceValue[]) || [];

  // Use the value if defined, otherwise fall back to the default value
  const displayValue = value !== undefined ? value : String(option.currentValue);

  return (
    <div className="space-y-2">
      <Label htmlFor={option.id} className="text-sm font-medium">
        {option.label}
      </Label>
      {option.description && <p className="text-xs text-muted-foreground">{option.description}</p>}
      <Select value={displayValue} onValueChange={onChange}>
        <SelectTrigger id={option.id}>
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
