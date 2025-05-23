import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface LayoutSettingsProps {
  spacingUnit: number;
  radiusUnit: number;
  borderWidthUnit: number;
  onSpacingUnitChange: (value: number) => void;
  onRadiusUnitChange: (value: number) => void;
  onBorderWidthUnitChange: (value: number) => void;
}

export const LayoutSettings = ({
  spacingUnit,
  radiusUnit,
  borderWidthUnit,
  onSpacingUnitChange,
  onRadiusUnitChange,
  onBorderWidthUnitChange,
}: LayoutSettingsProps) => {
  const handleInputChange = (
    setter: (value: number) => void,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setter(value);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-3">
      <h2 className="text-lg font-semibold text-foreground">Layout Settings</h2>

      {/* Spacing Unit Section */}
      <div className="flex items-center justify-between">
        <Label
          htmlFor="spacing-unit"
          className="text-sm font-medium text-muted-foreground"
        >
          Spacing Unit (px)
        </Label>
        <Input
          type="number"
          id="spacing-unit"
          value={spacingUnit}
          onChange={(e) => handleInputChange(onSpacingUnitChange, e)}
          step="1"
          className="w-24 text-sm bg-background text-foreground border-border"
        />
      </div>

      {/* Radius Unit Section */}
      <div className="flex items-center justify-between">
        <Label
          htmlFor="radius-unit"
          className="text-sm font-medium text-muted-foreground"
        >
          Radius Unit (px)
        </Label>
        <Input
          type="number"
          id="radius-unit"
          value={radiusUnit}
          onChange={(e) => handleInputChange(onRadiusUnitChange, e)}
          step="1"
          className="w-24 text-sm bg-background text-foreground border-border"
        />
      </div>

      {/* Border Width Unit Section */}
      <div className="flex items-center justify-between">
        <Label
          htmlFor="border-width-unit"
          className="text-sm font-medium text-muted-foreground"
        >
          Border Width Unit (px)
        </Label>
        <Input
          type="number"
          id="border-width-unit"
          value={borderWidthUnit}
          onChange={(e) => handleInputChange(onBorderWidthUnitChange, e)}
          step="1"
          className="w-24 text-sm bg-background text-foreground border-border"
        />
      </div>
    </div>
  );
};
