import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Clean CSS for server upload - keeps it simple and identical to extension behavior
 */
export function cleanCssForServerUpload(css: string): string {
  // Just return the CSS as-is for server upload
  // This ensures the server and extension behavior are identical
  return css.trim();
}
