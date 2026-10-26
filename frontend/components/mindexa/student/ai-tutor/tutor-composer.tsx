"use client";

import { AIChatInput, type Attachment } from "@/components/ui/ai-chat-input";
import { studentApi } from "@/lib/api/student";

/** Replace the draft from outside by passing a new `nonce`. */
export interface DraftSeed {
  text: string;
  nonce: number;
}

interface TutorComposerProps {
  draftSeed: DraftSeed;
  onSend: (params: { input: string; attachments?: Attachment[] }) => void;
  isGenerating: boolean;
  onStop: () => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  /** The selected course is Kinyarwanda, where the tutor is switched off by policy. */
  blockedByPolicy: boolean;
}

/**
 * The tutor's message box: attaches files as personal study resources and honours the language
 * policy. The draft text lives inside the input (not in the page), so typing does not re-render
 * the conversation above it.
 */
export function TutorComposer({
  draftSeed,
  onSend,
  isGenerating,
  onStop,
  attachments,
  setAttachments,
  blockedByPolicy,
}: TutorComposerProps) {
  return (
    <AIChatInput
      key={draftSeed.nonce}
      initialValue={draftSeed.text}
      onSend={onSend}
      isGenerating={isGenerating}
      onStop={onStop}
      attachments={attachments}
      setAttachments={setAttachments}
      disabled={blockedByPolicy}
      placeholder={
        blockedByPolicy ? "AI Study Tutor is disabled for Kinyarwanda courses" : "Ask your AI tutor anything..."
      }
      onUploadFile={async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await studentApi.uploadPersonalResource(formData);
        return { id: res.id };
      }}
    />
  );
}
