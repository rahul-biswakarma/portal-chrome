import * as React from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
  children: React.ReactNode;
}

export function Label({ htmlFor, children, ...props }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm font-medium text-gray-700 dark:text-gray-300"
      {...props}
    >
      {children}
    </label>
  );
}
