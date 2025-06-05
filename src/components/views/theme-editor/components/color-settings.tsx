import { Label } from '@/components/ui/label';
import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface ColorSettingsProps {
  accentColor: string;
  accentLabelColor: string;
  neutralColor: string;
  onAccentColorChange: (color: string) => void;
  onAccentLabelColorChange: (color: string) => void;
  onNeutralColorChange: (color: string) => void;
}

export const ColorSettings = ({
  accentColor,
  accentLabelColor,
  neutralColor,
  onAccentColorChange,
  onAccentLabelColorChange,
  onNeutralColorChange,
}: ColorSettingsProps) => {
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const ColorInputRow = ({
    label,
    id,
    value,
    onChange,
  }: {
    label: string;
    id: string;
    value: string;
    onChange: (value: string) => void;
  }) => {
    const isValidHex = /^#([0-9A-F]{3}){1,2}$/i.test(value);

    return (
      <div className="flex items-center justify-between w-full gap-3">
        <Label
          htmlFor={id}
          className="text-sm font-medium text-foreground min-w-0 flex-shrink"
        >
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <Popover
            open={openPopover === id}
            onOpenChange={(open) => setOpenPopover(open ? id : null)}
          >
            <PopoverTrigger asChild>
              <button
                className="w-10 h-10 rounded-md border-2 border-border hover:border-primary transition-colors shadow-sm relative overflow-hidden"
                style={{ backgroundColor: isValidHex ? value : '#000000' }}
                aria-label={`Pick color for ${label}`}
              >
                <span className="sr-only">Open color picker</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-3"
              side="left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={isValidHex ? value : '#000000'}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-12 h-12 border border-border rounded cursor-pointer"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground">Hex Value</Label>
                    <Input
                      type="text"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className="w-24 h-8 text-xs font-mono"
                      placeholder="#000000"
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Click and drag on the color picker above
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="min-w-[70px] text-right">
            <span
              className={`text-xs font-mono ${isValidHex ? 'text-foreground' : 'text-destructive'}`}
            >
              {value.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4">
      <h2 className="text-lg font-semibold text-foreground">Color Settings</h2>
      <div className="space-y-4">
        <ColorInputRow
          label="Accent Color (Primary)"
          id="accent-color"
          value={accentColor}
          onChange={onAccentColorChange}
        />
        <ColorInputRow
          label="Accent Label Color (Button Text)"
          id="accent-label-color"
          value={accentLabelColor}
          onChange={onAccentLabelColorChange}
        />
        <ColorInputRow
          label="Neutral Color (Background)"
          id="neutral-color"
          value={neutralColor}
          onChange={onNeutralColorChange}
        />
      </div>
    </div>
  );
};
