import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Grid3X3, Rows3, Columns3 } from 'lucide-react';
import type { PreferenceOption } from '../types';

interface LayoutSelectorProps {
  option: PreferenceOption;
  value: string;
  onChange: (value: string) => void;
}

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({ option, value, onChange }) => {
  const getLayoutIcon = (layout: string) => {
    switch (layout) {
      case 'grid':
        return <Grid3X3 className="h-4 w-4" />;
      case 'row':
        return <Rows3 className="h-4 w-4" />;
      case 'column':
        return <Columns3 className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const availableValues = (option.availableValues as string[]) || [];

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{option.label}</Label>
      {option.description && <p className="text-xs text-muted-foreground">{option.description}</p>}
      <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-3 gap-2">
        {availableValues.map(layoutValue => (
          <div key={layoutValue} className="flex items-center space-x-2">
            <RadioGroupItem value={layoutValue} id={`${option.id}-${layoutValue}`} />
            <Label
              htmlFor={`${option.id}-${layoutValue}`}
              className="flex items-center space-x-1 text-xs cursor-pointer"
            >
              {getLayoutIcon(layoutValue)}
              <span className="capitalize">{layoutValue}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
};
