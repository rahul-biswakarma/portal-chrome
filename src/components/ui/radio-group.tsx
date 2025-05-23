import * as React from 'react';

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

interface RadioGroupItemProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
}

export function RadioGroup({
  value,
  onValueChange,
  children,
  ...props
}: RadioGroupProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onValueChange) {
      onValueChange(e.target.value);
    }
  };

  return (
    <div role="radiogroup" {...props}>
      {React.Children.map(children, (child) => {
        // Skip non-element children (like strings, numbers, null, etc.)
        if (!React.isValidElement(child)) return child;

        // Cast the child to ReactElement with RadioGroupItemProps
        const radioChild = child as React.ReactElement<RadioGroupItemProps>;

        // Clone the child to pass the checked and onChange props
        return React.cloneElement(radioChild, {
          checked: value === radioChild.props.value,
          onChange: handleChange,
        });
      })}
    </div>
  );
}

export function RadioGroupItem({ value, id, ...props }: RadioGroupItemProps) {
  return (
    <input
      type="radio"
      value={value}
      id={id || value}
      className="h-4 w-4 rounded-full border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
      {...props}
    />
  );
}
