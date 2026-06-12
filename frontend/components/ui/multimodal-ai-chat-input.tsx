'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';

import equal from 'fast-deep-equal';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 as LoaderIcon, X as XIcon, Paperclip as PaperclipIcon, ArrowUp as ArrowUpIcon, Square as StopIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

const clsx = (...args: any[]) => args.filter(Boolean).join(' ');

// Type Definitions
export interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface UIMessage {
  id: string;
  content: string;
  role: string;
  attachments?: Attachment[];
}

export type VisibilityType = 'public' | 'private' | 'unlisted' | string;

// Utility Functions
const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

// Button variants using cva
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-black text-white hover:bg-gray-800',
        destructive: 'border border-black text-black hover:bg-gray-100',
        outline: 'border border-gray-400 bg-white hover:bg-gray-100 hover:text-black',
        secondary: 'bg-gray-200 text-black hover:bg-gray-300',
        ghost: 'text-black hover:bg-gray-100 hover:text-black',
        link: 'text-black underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

// Button component
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? 'button' : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

// Textarea component
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-base ring-offset-white placeholder:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-black',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

// Sub-Components

export interface SuggestedAction {
  title: string;
  label: string;
  action: string;
}

interface SuggestedActionsProps {
  chatId: string;
  onSelectAction: (action: string) => void;
  selectedVisibilityType: VisibilityType;
  suggestedActions?: SuggestedAction[];
}

function PureSuggestedActions({
  onSelectAction,
  suggestedActions = [
    {
      title: 'How can I improve',
      label: 'my time management skills?',
      action: 'How can I improve my time management skills?',
    },
    {
      title: 'Suggest ideas for',
      label: 'a creative writing project',
      action: 'Suggest ideas for a creative writing project',
    },
    {
      title: 'What are some tips',
      label: 'for staying motivated?',
      action: 'What are some tips for staying motivated?',
    },
    {
      title: 'Help me brainstorm',
      label: 'ideas for a new hobby',
      action: 'Help me brainstorm ideas for a new hobby',
    },
  ],
}: SuggestedActionsProps) {
  return (
    <div
      data-testid="suggested-actions"
      className="grid pb-2 sm:grid-cols-2 gap-2 w-full animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <AnimatePresence>
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${index}`}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <Button
            variant="ghost"
            onClick={() => onSelectAction(suggestedAction.action)}
            className="text-left border rounded-xl px-4 py-3 text-xs flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start
                       border-gray-200 bg-white hover:bg-gray-50 text-black hover:text-gray-900 shadow-sm"
          >
            <span className="font-semibold text-[11px] text-zinc-700">{suggestedAction.title}</span>
            <span className="text-zinc-400 font-normal">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
  );
}

const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;
    if (!equal(prevProps.suggestedActions, nextProps.suggestedActions)) return false;
    return true;
  },
);


const PreviewAttachment = ({
  attachment,
  isUploading = false,
}: {
  attachment: Attachment;
  isUploading?: boolean;
}) => {
  const { name, url, contentType } = attachment;

  return (
    <div data-testid="input-attachment-preview" className="flex flex-col gap-1 select-none animate-in scale-in duration-200">
      <div className="w-16 h-12 bg-gray-200 rounded-md relative flex flex-col items-center justify-center overflow-hidden border border-gray-300">
        {contentType?.startsWith('image/') && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={name ?? 'An image attachment'}
            className="rounded-md size-full object-cover grayscale"
          />
        ) : (
          <div className="flex items-center justify-center text-[9px] text-gray-600 text-center p-1 font-bold">
             {name?.split('.').pop()?.toUpperCase() || 'FILE'}
          </div>
        )}

        {isUploading && (
          <div
            data-testid="input-attachment-loader"
            className="animate-spin absolute text-gray-500 bg-white/50 w-full h-full flex items-center justify-center"
          >
            <LoaderIcon className="size-4" />
          </div>
        )}
      </div>
      <div className="text-[10px] text-gray-600 max-w-16 truncate text-center">
        {name}
      </div>
    </div>
  );
};

function PureAttachmentsButton({
  fileInputRef,
  disabled,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  disabled: boolean;
}) {
  return (
    <Button
      data-testid="attachments-button"
      className="rounded-md p-1.5 h-7 w-7 border border-gray-300 hover:bg-gray-200 flex items-center justify-center"
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      disabled={disabled}
      variant="ghost"
      aria-label="Attach files"
    >
      <PaperclipIcon className="size-3.5 -rotate-45" />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton, (prev, next) => prev.disabled === next.disabled);

function PureStopButton({ onStop }: { onStop: () => void }) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-1.5 h-7 w-7 bg-red-600 text-white hover:bg-red-700 flex items-center justify-center border-none"
      onClick={(event) => {
        event.preventDefault();
        onStop();
      }}
      aria-label="Stop generating"
    >
      <StopIcon className="size-3.5 fill-current" />
    </Button>
  );
}

const StopButton = memo(PureStopButton, (prev, next) => prev.onStop === next.onStop);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
  attachments,
  canSend,
  isGenerating,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
  attachments: Array<Attachment>;
  canSend: boolean;
  isGenerating: boolean;
}) {
  const isDisabled =
    uploadQueue.length > 0 ||
    !canSend ||
    isGenerating ||
    (input.trim().length === 0 && attachments.length === 0);

  return (
    <Button
      data-testid="send-button"
      className="rounded-full p-1.5 h-7 w-7 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={(event) => {
        event.preventDefault();
        if (!isDisabled) {
          submitForm();
        }
      }}
      disabled={isDisabled}
      aria-label="Send message"
    >
      <ArrowUpIcon className="size-3.5" />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length) return false;
  if (prevProps.attachments.length !== nextProps.attachments.length) return false;
  if (prevProps.attachments.length > 0 && !equal(prevProps.attachments, nextProps.attachments)) return false;
  if (prevProps.canSend !== nextProps.canSend) return false;
  if (prevProps.isGenerating !== nextProps.isGenerating) return false;
  return true;
});


// Main Component

interface MultimodalInputProps {
  chatId: string;
  messages: Array<UIMessage>;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  onSendMessage: (params: { input: string; attachments: Attachment[] }) => void;
  onStopGenerating: () => void;
  isGenerating: boolean;
  canSend: boolean;
  className?: string;
  selectedVisibilityType: VisibilityType;
  placeholder?: string;
  suggestedActions?: SuggestedAction[] | null;
  value?: string;
  onChange?: (value: string) => void;
}

function PureMultimodalInput({
  chatId,
  messages,
  attachments,
  setAttachments,
  onSendMessage,
  onStopGenerating,
  isGenerating,
  canSend,
  className,
  selectedVisibilityType,
  placeholder = "Send a message...",
  suggestedActions,
  value,
  onChange,
}: MultimodalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [internalInput, setInternalInput] = useState('');
  const isControlled = value !== undefined;
  const input = isControlled ? (value as string) : internalInput;

  const setInput = useCallback((val: string) => {
    if (isControlled && onChange) {
      onChange(val);
    } else {
      setInternalInput(val);
    }
  }, [isControlled, onChange]);

  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  };

  const resetHeight = useCallback(() => {
     const textarea = textareaRef.current;
      if (textarea) {
          textarea.style.height = 'auto';
          textarea.rows = 1;
          adjustHeight();
      }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [input]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  // Mock file upload simulator
  const uploadFile = async (file: File): Promise<Attachment | undefined> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const mockUrl = URL.createObjectURL(file);
          const mockAttachment: Attachment = {
            url: mockUrl,
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          };
          resolve(mockAttachment);
        } catch (error) {
          console.error('Failed to create object URL for preview:', error);
          resolve(undefined);
        } finally {
           setUploadQueue(currentQueue => currentQueue.filter(name => name !== file.name));
        }
      }, 700);
    });
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      setUploadQueue(currentQueue => [...currentQueue, ...files.map((file) => file.name)]);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      const MAX_FILE_SIZE = 25 * 1024 * 1024;
      const validFiles = files.filter(file => file.size <= MAX_FILE_SIZE);
      const invalidFiles = files.filter(file => file.size > MAX_FILE_SIZE);

      if (invalidFiles.length > 0) {
         setUploadQueue(currentQueue => currentQueue.filter(name => !invalidFiles.some(f => f.name === name)));
      }

      const uploadPromises = validFiles.map((file) => uploadFile(file));
      const uploadedAttachments = await Promise.all(uploadPromises);

      const successfullyUploadedAttachments = uploadedAttachments.filter(
        (attachment): attachment is Attachment => attachment !== undefined,
      );

      setAttachments((currentAttachments) => [
        ...currentAttachments,
        ...successfullyUploadedAttachments,
      ]);

    },
    [setAttachments],
  );

  const handleRemoveAttachment = useCallback(
    (attachmentToRemove: Attachment) => {
      if (attachmentToRemove.url.startsWith('blob:')) {
         URL.revokeObjectURL(attachmentToRemove.url);
      }
      setAttachments((currentAttachments) =>
        currentAttachments.filter(
          (attachment) => attachment.url !== attachmentToRemove.url || attachment.name !== attachmentToRemove.name
        )
      );
      textareaRef.current?.focus();
    },
    [setAttachments]
  );

  const submitForm = useCallback(() => {
     if (input.trim().length === 0 && attachments.length === 0) {
        return;
     }

    onSendMessage({ input, attachments });

    setInput('');
    setAttachments([]);

    attachments.forEach(att => {
        if (att.url.startsWith('blob:')) {
            URL.revokeObjectURL(att.url);
        }
    });

    resetHeight();
    textareaRef.current?.focus();

  }, [
    input,
    attachments,
    onSendMessage,
    setAttachments,
    resetHeight,
    setInput,
  ]);

  const showSuggestedActions = suggestedActions !== null && messages.length === 0 && attachments.length === 0 && uploadQueue.length === 0;
  const isAttachmentDisabled = isGenerating || uploadQueue.length > 0;

  return (
    <div className={cn("relative w-full flex flex-col gap-3", className)}>

      <AnimatePresence>
       {showSuggestedActions && (
         <motion.div
            key="suggested-actions-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
         >
            <SuggestedActions
              onSelectAction={(action) => {
                setInput(action);
                requestAnimationFrame(() => {
                     adjustHeight();
                     textareaRef.current?.focus();
                });
             }}
              chatId={chatId}
              selectedVisibilityType={selectedVisibilityType}
              suggestedActions={suggestedActions || undefined}
            />
         </motion.div>
       )}
      </AnimatePresence>

      <div className="relative border border-zinc-200 focus-within:border-zinc-400 bg-white rounded-2xl p-2 transition-colors">
        {/* Hidden file input */}
        <input
          type="file"
          className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
          ref={fileInputRef}
          multiple
          onChange={handleFileChange}
          tabIndex={-1}
          disabled={isAttachmentDisabled}
          accept="image/*,video/*,audio/*,.pdf"
        />

        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            data-testid="attachments-preview"
            className="flex pt-1 flex-row gap-2 overflow-x-auto items-end pb-2 pl-1 border-b border-zinc-100 mb-2"
          >
            {attachments.map((attachment) => (
              <div key={attachment.url || attachment.name} className="relative group">
                  <PreviewAttachment attachment={attachment} isUploading={false} />
                  <Button
                    variant="ghost"
                    className="absolute top-[-6px] right-[-6px] h-4.5 w-4.5 rounded-full p-0 flex items-center justify-center z-20 bg-zinc-950 text-white hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveAttachment(attachment)}
                    aria-label={`Remove ${attachment.name}`}
                  >
                     <XIcon className="size-2.5" />
                  </Button>
              </div>
            ))}
            {uploadQueue.map((filename, index) => (
              <PreviewAttachment
                key={`upload-${filename}-${index}`}
                attachment={{ url: '', name: filename, contentType: '', size: 0 }}
                isUploading={true}
              />
            ))}
          </div>
        )}

        <textarea
          data-testid="multimodal-input"
          ref={textareaRef}
          placeholder={placeholder}
          value={input}
          onChange={handleInput}
          className={cn(
            'flex w-full resize-none bg-transparent px-2 py-1 text-sm placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-h-[36px] max-h-[250px] overflow-y-auto text-zinc-900',
          )}
          rows={1}
          disabled={!canSend || isGenerating || uploadQueue.length > 0}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();

              const canSubmit = canSend && !isGenerating && uploadQueue.length === 0 && (input.trim().length > 0 || attachments.length > 0);

              if (canSubmit) {
                submitForm();
              }
            }
          }}
        />

        <div className="flex flex-row items-center justify-between mt-2 pt-1 border-t border-zinc-50 pl-1 pr-1">
          <div>
            <AttachmentsButton
              fileInputRef={fileInputRef}
              disabled={isAttachmentDisabled}
            />
          </div>

          <div>
            {isGenerating ? (
              <StopButton onStop={onStopGenerating} />
            ) : (
              <SendButton
                submitForm={submitForm}
                input={input}
                uploadQueue={uploadQueue}
                attachments={attachments}
                canSend={canSend}
                isGenerating={isGenerating}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { PureMultimodalInput };
