/**
 * localStorage that never throws. Private windows, blocked site data and a full quota all make
 * `setItem` throw, and these writes happen in click handlers and effects where an exception
 * would break the action the user actually asked for. Remembering is best-effort.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to do
  }
}
