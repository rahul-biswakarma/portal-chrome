import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  max?: number;
}) {
  // Ensure value is always valid
  const validValue = React.useMemo(() => {
    if (value === null || value === undefined) return 0;
    // Clamp value between 0 and max
    return Math.max(0, Math.min(max, value));
  }, [value, max]);

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      value={validValue}
      max={max}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{
          transform: validValue
            ? `translateX(-${100 - (validValue / max) * 100}%)`
            : `translateX(-100%)`,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
