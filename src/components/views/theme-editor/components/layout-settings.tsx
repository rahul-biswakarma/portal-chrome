import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { LayoutSettingsProps } from '../types';

export const LayoutSettings: React.FC<LayoutSettingsProps> = ({ layout, onLayoutChange }) => {
  const SliderControl = ({
    label,
    value,
    onChange,
    min,
    max,
    step,
    unit,
    description,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    unit: string;
    description?: string;
  }) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium text-foreground">{label}</Label>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
            {value.toFixed(4)}
            {unit}
          </span>
        </div>

        <Slider
          value={[value]}
          onValueChange={values => onChange(values[0])}
          min={min}
          max={max}
          step={step}
          className="w-full"
        />

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {min}
            {unit}
          </span>
          <span>
            {max}
            {unit}
          </span>
        </div>
      </div>
    );
  };

  const handleSpacingChange = (value: number) => {
    onLayoutChange({ ...layout, spacingUnit: value });
  };

  const handleRadiusChange = (value: number) => {
    onLayoutChange({ ...layout, radiusUnit: value });
  };

  const handleBorderWidthChange = (value: number) => {
    onLayoutChange({ ...layout, borderWidthUnit: value });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Layout & Spacing</h3>
        <p className="text-sm text-muted-foreground">
          Adjust spacing, border radius, and border width for consistent design patterns.
        </p>
      </div>

      <div className="space-y-6">
        <SliderControl
          label="Spacing Unit"
          value={layout.spacingUnit}
          onChange={handleSpacingChange}
          min={0.125}
          max={2}
          step={0.0625}
          unit="rem"
          description="Base unit for margins, padding, and gaps throughout the interface"
        />

        <SliderControl
          label="Border Radius"
          value={layout.radiusUnit}
          onChange={handleRadiusChange}
          min={0}
          max={1}
          step={0.0625}
          unit="rem"
          description="Roundness of corners for buttons, cards, and other elements"
        />

        <SliderControl
          label="Border Width"
          value={layout.borderWidthUnit}
          onChange={handleBorderWidthChange}
          min={0}
          max={0.5}
          step={0.0625}
          unit="rem"
          description="Thickness of borders and dividers"
        />
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h4 className="text-sm font-medium mb-3">Layout Preview</h4>
        <div className="space-y-3">
          {/* Spacing preview */}
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 bg-primary rounded"
              style={{ marginRight: `${layout.spacingUnit}rem` }}
            />
            <div
              className="w-4 h-4 bg-primary rounded"
              style={{ marginRight: `${layout.spacingUnit}rem` }}
            />
            <div className="w-4 h-4 bg-primary rounded" />
            <span className="text-xs text-muted-foreground ml-2">
              Spacing: {layout.spacingUnit}rem
            </span>
          </div>

          {/* Radius preview */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 bg-primary"
              style={{ borderRadius: `${layout.radiusUnit}rem` }}
            />
            <span className="text-xs text-muted-foreground">Radius: {layout.radiusUnit}rem</span>
          </div>

          {/* Border preview */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 bg-background border-primary"
              style={{
                borderWidth: `${layout.borderWidthUnit}rem`,
                borderRadius: `${layout.radiusUnit}rem`,
              }}
            />
            <span className="text-xs text-muted-foreground">
              Border: {layout.borderWidthUnit}rem
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
        <div>
          <h5 className="text-sm font-medium mb-2">Common Values</h5>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Tight: 0.125rem</div>
            <div>Normal: 0.25rem</div>
            <div>Relaxed: 0.5rem</div>
            <div>Loose: 1rem</div>
          </div>
        </div>
        <div>
          <h5 className="text-sm font-medium mb-2">Current Scale</h5>
          <div className="space-y-1 text-xs font-mono">
            <div>1x: {layout.spacingUnit}rem</div>
            <div>2x: {(layout.spacingUnit * 2).toFixed(3)}rem</div>
            <div>4x: {(layout.spacingUnit * 4).toFixed(3)}rem</div>
            <div>8x: {(layout.spacingUnit * 8).toFixed(3)}rem</div>
          </div>
        </div>
      </div>
    </div>
  );
};
