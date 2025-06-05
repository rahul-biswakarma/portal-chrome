import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface LayoutSettingsProps {
  spacingUnit: number;
  radiusUnit: number;
  borderWidthUnit: number;
  onSpacingUnitChange: (value: number) => void;
  onRadiusUnitChange: (value: number) => void;
  onBorderWidthUnitChange: (value: number) => void;
}

// Original default values
const originalDefaults = {
  spacingUnit: 0.25, // 100% base value
  radiusUnit: 0.0625,
  borderWidthUnit: 0.0625,
};

// Define preset options based on 0.25rem as 100%
const radiusPresets = [
  { label: 'None', value: 0, remValue: '0rem' },
  { label: 'Small', value: 0.0625, remValue: '0.0625rem' }, // Original default
  { label: 'Medium', value: 0.125, remValue: '0.125rem' },
  { label: 'Large', value: 0.25, remValue: '0.25rem' },
  { label: 'Full', value: 0.5, remValue: '0.5rem' },
];

const spacingPresets = [
  { label: '90%', value: 0.225, remValue: '0.225rem' }, // 90% of 0.25rem
  { label: '95%', value: 0.2375, remValue: '0.2375rem' }, // 95% of 0.25rem
  { label: '100%', value: 0.25, remValue: '0.25rem' }, // Original default (100%)
  { label: '105%', value: 0.2625, remValue: '0.2625rem' }, // 105% of 0.25rem
  { label: '110%', value: 0.275, remValue: '0.275rem' }, // 110% of 0.25rem
];

const borderPresets = [
  { label: 'None', value: 0, remValue: '0rem' },
  { label: 'Thin', value: 0.0625, remValue: '0.0625rem' }, // Original default
  { label: 'Medium', value: 0.125, remValue: '0.125rem' },
  { label: 'Thick', value: 0.1875, remValue: '0.1875rem' },
];

export const LayoutSettings = ({
  spacingUnit,
  radiusUnit,
  borderWidthUnit,
  onSpacingUnitChange,
  onRadiusUnitChange,
  onBorderWidthUnitChange,
}: LayoutSettingsProps) => {
  // Convert current values to closest preset values for display
  const getCurrentRadiusPreset = () => {
    return (
      radiusPresets.find(
        (preset) => Math.abs(preset.value - radiusUnit) < 0.01,
      ) || radiusPresets[1]
    );
  };

  const getCurrentSpacingPreset = () => {
    return (
      spacingPresets.find(
        (preset) => Math.abs(preset.value - spacingUnit) < 0.01,
      ) || spacingPresets[2]
    );
  };

  const getCurrentBorderPreset = () => {
    return (
      borderPresets.find(
        (preset) => Math.abs(preset.value - borderWidthUnit) < 0.01,
      ) || borderPresets[1]
    );
  };

  const handleReset = () => {
    onSpacingUnitChange(originalDefaults.spacingUnit);
    onRadiusUnitChange(originalDefaults.radiusUnit);
    onBorderWidthUnitChange(originalDefaults.borderWidthUnit);
  };

  return (
    <div className="flex flex-col gap-6 border-b border-border pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Layout Settings
        </h2>
        <Button
          onClick={handleReset}
          variant="outline"
          size="sm"
          className="gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      {/* Radius Section */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium text-foreground">Radius</Label>
        <div className="grid grid-cols-5 gap-2">
          {radiusPresets.map((preset) => {
            const isSelected = getCurrentRadiusPreset().value === preset.value;
            return (
              <button
                key={preset.label}
                onClick={() => onRadiusUnitChange(preset.value)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-primary bg-accent/50'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                {/* Visual representation */}
                <div
                  className={`w-8 h-8 ${isSelected ? 'bg-primary' : 'bg-muted-foreground'}`}
                  style={{
                    borderRadius:
                      preset.value === 0.5 ? '50%' : `${preset.value * 16}px`,
                  }}
                />
                <span
                  className={`text-xs font-medium ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}
                >
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spacing Section */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium text-foreground">Spacing</Label>
        <div className="grid grid-cols-5 gap-2">
          {spacingPresets.map((preset) => {
            const isSelected = getCurrentSpacingPreset().value === preset.value;
            return (
              <button
                key={preset.label}
                onClick={() => onSpacingUnitChange(preset.value)}
                className={`flex items-center justify-center p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-primary bg-accent/50'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                <span
                  className={`text-sm font-medium ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}
                >
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Border Width Section */}
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-medium text-foreground">
          Border Width
        </Label>
        <div className="grid grid-cols-4 gap-2">
          {borderPresets.map((preset) => {
            const isSelected = getCurrentBorderPreset().value === preset.value;
            return (
              <button
                key={preset.label}
                onClick={() => onBorderWidthUnitChange(preset.value)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-primary bg-accent/50'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                {/* Visual representation */}
                <div
                  className={`w-8 h-6 ${isSelected ? 'bg-accent' : 'bg-muted'}`}
                  style={{
                    border: `${Math.max(1, preset.value * 16)}px solid hsl(var(${isSelected ? '--primary' : '--muted-foreground'}))`,
                  }}
                />
                <span
                  className={`text-xs font-medium ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}
                >
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
