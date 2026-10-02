import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a stored URL only when it is a real http(s) web address.
 *
 * Listing URL columns are writable through the data API, so a value could be
 * a `javascript:` or `data:` URL that would execute when the link is clicked.
 * Anything that is not plainly http(s) yields null and the caller should then
 * render plain text instead of a link.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
