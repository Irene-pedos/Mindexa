/**
 * Browser-side leftovers of the AI assistants (lecturer chat sessions with attachment text,
 * pinned/selected scope for the student tutor). They are personal, so they must not survive a
 * sign-out or an expired session on a shared machine.
 */
export const AI_LOCAL_DATA_PREFIXES = [
  "mindexa_lecturer_ai_",
  "mindexa_lecturer_pinned_",
  "mindexa_ai_tutor_",
  "mindexa_pinned_conversations",
] as const;

export interface KeyedStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export function clearAiLocalData(storage: KeyedStorage): void {
  // Collect first: removing while iterating shifts the indexes.
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && AI_LOCAL_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      doomed.push(key);
    }
  }
  doomed.forEach((key) => storage.removeItem(key));
}
