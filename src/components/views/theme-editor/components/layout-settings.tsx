import { Label } from '@/components/ui/label';

interface LayoutSettingsProps {
  spacingUnit: number;
  radiusUnit: number;
  borderWidthUnit: number;
  onSpacingUnitChange: (value: number) => void;
  onRadiusUnitChange: (value: number) => void;
  onBorderWidthUnitChange: (value: number) => void;
}

// Define preset options
const radiusPresets = [
  { label: 'None', value: 0, remValue: '0rem' },
  { label: 'Small', value: 0.25, remValue: '0.25rem' },
  { label: 'Medium', value: 0.5, remValue: '0.5rem' },
  { label: 'Large', value: 0.75, remValue: '0.75rem' },
  { label: 'Full', value: 1, remValue: '1rem' },
];

const spacingPresets = [
  { label: '90%', value: 0.5, remValue: '0.5rem' },
  { label: '95%', value: 0.75, remValue: '0.75rem' },
  { label: '100%', value: 1, remValue: '1rem' },
  { label: '105%', value: 1.25, remValue: '1.25rem' },
  { label: '110%', value: 1.5, remValue: '1.5rem' },
];

const borderPresets = [
  { label: 'None', value: 0, remValue: '0rem' },
  { label: 'Thin', value: 0.0625, remValue: '0.0625rem' }, // 1px at 16px base
  { label: 'Medium', value: 0.125, remValue: '0.125rem' }, // 2px at 16px base
  { label: 'Thick', value: 0.1875, remValue: '0.1875rem' }, // 3px at 16px base
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
        (preset) => Math.abs(preset.value - radiusUnit) < 0.1,
      ) || radiusPresets[2]
    );
  };

  const getCurrentSpacingPreset = () => {
    return (
      spacingPresets.find(
        (preset) => Math.abs(preset.value - spacingUnit) < 0.1,
      ) || spacingPresets[2]
    );
  };

  const getCurrentBorderPreset = () => {
    return (
      borderPresets.find(
        (preset) => Math.abs(preset.value - borderWidthUnit) < 0.1,
      ) || borderPresets[1]
    );
  };

  return (
    <div className="flex flex-col gap-6 border-b border-border pb-4">
      <h2 className="text-lg font-semibold text-foreground">Layout Settings</h2>

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
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-background hover:border-accent/50'
                }`}
              >
                {/* Visual representation */}
                <div
                  className="w-8 h-8 bg-accent"
                  style={{
                    borderRadius:
                      preset.value === 1 ? '50%' : `${preset.value * 16}px`,
                  }}
                />
                <span className="text-xs font-medium text-foreground">
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
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-background hover:border-accent/50'
                }`}
              >
                <span className="text-sm font-medium text-foreground">
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
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-background hover:border-accent/50'
                }`}
              >
                {/* Visual representation */}
                <div
                  className="w-8 h-6 bg-accent/20"
                  style={{
                    border: `${Math.max(1, preset.value * 16)}px solid hsl(var(--accent))`,
                  }}
                />
                <span className="text-xs font-medium text-foreground">
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
