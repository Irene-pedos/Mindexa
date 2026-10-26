"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageScrollerProvider } from "@/components/ui/message-scroller";
import { ConversationList } from "@/components/mindexa/common/conversation-list";
import { RevisionCenter } from "@/components/mindexa/student/ai-tutor/revision-center";
import { ScopePicker } from "@/components/mindexa/student/ai-tutor/scope-picker";
import {
  DeleteConversationDialog,
  ExportConversationDialog,
  ShareConversationDialog,
} from "@/components/mindexa/student/ai-tutor/tutor-dialogs";
import { TutorComposer, type DraftSeed } from "@/components/mindexa/student/ai-tutor/tutor-composer";
import { TutorMessageList } from "@/components/mindexa/student/ai-tutor/tutor-message-list";
import {
  ErrorNotice,
  ExamBlockedCard,
  LanguagePolicyNotice,
  ScopePill,
  TutorWelcome,
} from "@/components/mindexa/student/ai-tutor/tutor-notices";
import { TutorSidebar, type TutorTab } from "@/components/mindexa/student/ai-tutor/tutor-sidebar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { usePersistedChoice } from "@/hooks/use-persisted-choice";
import { usePinnedIds } from "@/hooks/use-pinned-ids";
import { useTutorChat } from "@/hooks/use-tutor-chat";
import { useTutorData } from "@/hooks/use-tutor-data";
import { studentApi } from "@/lib/api/student";
import {
  buildTranscriptMarkdown,
  buildTranscriptPlainText,
  formatHistoryDate,
  isScopeKinyarwanda,
  orderConversations,
  scopeLabel,
  type ScopeCatalog,
} from "@/lib/tutor-chat";
import { cn } from "@/lib/utils";

interface AISupportChatProps {
  initialTopicContext?: string;
  initialTab?: TutorTab;
  isFullPage?: boolean;
}

const isTab = (value: string): value is TutorTab => value === "support" || value === "revision";

/**
 * The student's AI study tutor: a chat grounded in a chosen course, material or personal file,
 * plus a curriculum revision center. This component wires state together; the pieces live in
 * `ai-tutor/`, the conversation logic in `useTutorChat`, and pure rules in `lib/tutor-chat.ts`.
 */
export function AISupportChat({ initialTopicContext, initialTab }: AISupportChatProps = {}) {
  const [tabChoice, setTabChoice] = usePersistedChoice({
    storageKey: "mindexa_ai_tutor_tab",
    urlParam: "tab",
    writeUrl: true,
    initial: initialTab,
    isValid: isTab,
  });
  const activeTab: TutorTab = tabChoice === "revision" ? "revision" : "support";
  const showChat = useCallback(() => setTabChoice("support"), [setTabChoice]);

  const [selectedScope, setSelectedScope] = usePersistedChoice({
    storageKey: "mindexa_ai_tutor_scope",
    urlParam: "scope",
    writeUrl: true,
  });
  const [revisionWorkspace, setRevisionWorkspace] = usePersistedChoice({
    storageKey: "mindexa_ai_tutor_course",
    urlParam: "course",
  });

  const data = useTutorData();
  const { workspaces, materials, resources, setResources } = data;

  const catalog = useMemo<ScopeCatalog>(
    () => ({ workspaces, materials, personal: resources }),
    [workspaces, materials, resources]
  );
  const scopeIsKinyarwanda = isScopeKinyarwanda(selectedScope, catalog);
  const activeScopeLabel = scopeLabel(selectedScope, catalog);
  const clearScope = useCallback(() => setSelectedScope(null), [setSelectedScope]);

  const chat = useTutorChat({
    catalog,
    selectedScope,
    scopeLoading: data.loading,
    onStaleScope: clearScope,
    scopeIsKinyarwanda,
    onShowChat: showChat,
  });
  const { messages } = chat;

  // The draft lives inside the composer; bumping `nonce` replaces it from here. Arriving from a
  // study session with a topic starts the composer with a review prompt.
  const [draftSeed, setDraftSeed] = useState<DraftSeed>(() => ({
    text: initialTopicContext?.trim()
      ? `I am reviewing "${initialTopicContext}". Can you explain the core concepts and test my understanding?`
      : "",
    nonce: 0,
  }));
  const setDraft = (text: string) => setDraftSeed((seed) => ({ text, nonce: seed.nonce + 1 }));

  const pins = usePinnedIds("mindexa_pinned_conversations");
  const { copiedId, copy } = useCopyToClipboard();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Default the revision course to the first one the student is enrolled in.
  useEffect(() => {
    if (!revisionWorkspace && workspaces.length > 0) setRevisionWorkspace(workspaces[0].id);
  }, [revisionWorkspace, workspaces, setRevisionWorkspace]);

  const orderedConversations = useMemo(
    () => orderConversations(chat.conversations, pins.pinnedIds),
    [chat.conversations, pins.pinnedIds]
  );
  const conversationItems = useMemo(
    () =>
      orderedConversations.map((c) => ({
        id: c.conversation_id,
        title: c.preview || "Untitled Chat",
        meta: [
          formatHistoryDate(c.last_activity_at || c.created_at),
          c.turn_count > 0 ? `${c.turn_count} msg${c.turn_count > 1 ? "s" : ""}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [orderedConversations]
  );

  const markdown = useMemo(() => buildTranscriptMarkdown(messages), [messages]);
  const plainText = useMemo(() => buildTranscriptPlainText(messages), [messages]);

  const uploadPersonalFile = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const created = await studentApi.uploadPersonalResource(formData);
      setResources((prev) => [created, ...prev]);
      setSelectedScope(created.id);
      toast.success(`Uploaded "${file.name}". Background processing initiated for AI context grounding.`);
    } catch (err) {
      chat.handleApiError(err, "Failed to upload study resource.");
    } finally {
      setIsUploading(false);
    }
  };

  const deletePersonalFile = async (id: string) => {
    try {
      await studentApi.deletePersonalResource(id);
      setResources((prev) => prev.filter((r) => r.id !== id));
      if (selectedScope === id) setSelectedScope(null);
      toast.success("Resource deleted successfully.");
    } catch {
      toast.error("Failed to delete resource.");
    }
  };

  const confirmDeleteConversation = async () => {
    if (!conversationToDelete) return;
    setIsDeleting(true);
    const deleted = await chat.deleteConversation(conversationToDelete);
    if (deleted) pins.remove(conversationToDelete);
    setIsDeleting(false);
    setConversationToDelete(null);
  };

  const startSocraticReview = (topic: string) => {
    showChat();
    void chat.send(
      `Let's review the curriculum learning unit: "${topic}". Please give me a concise breakdown of the core concept followed by one comprehension-check question to test my understanding.`
    );
  };

  const examTitle = chat.examBlockTitle ?? data.examBlock?.title ?? null;
  if (examTitle !== null) return <ExamBlockedCard assessmentTitle={examTitle} />;

  const composer = (
    <TutorComposer
      draftSeed={draftSeed}
      onSend={chat.send}
      isGenerating={chat.isThinking}
      onStop={chat.stop}
      attachments={chat.attachments}
      setAttachments={chat.setAttachments}
      blockedByPolicy={chat.blockedByPolicy}
    />
  );

  return (
    <MessageScrollerProvider scrollPreviousItemPeek={64} scrollMargin={24}>
      <div
        className={cn(
          "relative flex w-full flex-row overflow-hidden bg-background",
          isFullScreen ? "fixed inset-0 z-50 h-screen w-screen p-0" : "h-full min-h-0"
        )}
      >
        <TutorSidebar
          open={isSidebarOpen}
          onOpenChange={setIsSidebarOpen}
          activeTab={activeTab}
          onTabChange={setTabChoice}
          onNewChat={() => {
            chat.startNewChat();
            setDraft("");
          }}
          scopePicker={
            <ScopePicker
              selectedId={selectedScope}
              label={activeScopeLabel}
              catalog={catalog}
              loading={data.loading}
              isUploading={isUploading}
              open={scopeOpen}
              onOpenChange={setScopeOpen}
              onSelect={setSelectedScope}
              onCourseChosen={setRevisionWorkspace}
              onUpload={uploadPersonalFile}
              onDeletePersonal={deletePersonalFile}
            />
          }
          history={
            <ConversationList
              items={conversationItems}
              currentId={chat.currentConversationId}
              pinnedIds={pins.pinnedIds}
              disabled={chat.loadingConversation}
              onOpen={chat.openConversation}
              onTogglePin={(id) => pins.toggle(id)}
              onDelete={setConversationToDelete}
              emptyText="No chat history yet."
            />
          }
          hasScope={!!selectedScope}
          scopeLabel={activeScopeLabel}
          onOpenScope={() => {
            setIsSidebarOpen(true);
            setScopeOpen(true);
          }}
          canShareOrExport={messages.length > 0 && activeTab === "support"}
          onShare={() => setShareOpen(true)}
          onExport={() => setExportOpen(true)}
          isFullScreen={isFullScreen}
          onToggleFullScreen={() => setIsFullScreen((v) => !v)}
        />

        <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {!isSidebarOpen && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSidebarOpen(true)}
              className="absolute left-3 top-3 z-30 size-8 rounded-xl border-border/60 bg-background/80 text-muted-foreground shadow-xs backdrop-blur-md hover:text-foreground sm:hidden"
              aria-label="Open sidebar"
              title="Open sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}

          {activeScopeLabel && activeTab === "support" && <ScopePill label={activeScopeLabel} onClear={clearScope} />}

          {chat.error && <ErrorNotice message={chat.error} onDismiss={chat.dismissError} />}

          {activeTab === "support" && (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {messages.length === 0 && !chat.isThinking ? (
                  <TutorWelcome onPick={(text) => chat.send({ input: text, attachments: [] })}>{composer}</TutorWelcome>
                ) : (
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <TutorMessageList
                      messages={messages}
                      isThinking={chat.isThinking}
                      copiedId={copiedId}
                      onCopy={(text, id) => void copy(text, id)}
                      onEditMessage={(text) => {
                        setDraft(text);
                        toast.info("Message placed in composer for editing.");
                      }}
                      onRegenerate={chat.regenerate}
                    />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-background via-background/80 to-transparent" />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4 md:p-5">
                      <div className="pointer-events-auto mx-auto w-full max-w-4xl space-y-1.5 lg:max-w-5xl 2xl:max-w-6xl">
                        {chat.blockedByPolicy && <LanguagePolicyNotice />}
                        {composer}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Kept mounted (hidden) so a generated guide and the topic survive switching tabs. */}
          <div className={cn("min-h-0 flex-1 flex-col", activeTab === "revision" ? "flex" : "hidden")}>
            <RevisionCenter
              workspaces={workspaces}
              workspaceId={revisionWorkspace}
              onWorkspaceChange={setRevisionWorkspace}
              initialTopic={initialTopicContext}
              onStartSocraticReview={startSocraticReview}
              onError={chat.handleApiError}
            />
          </div>
        </main>
      </div>

      <DeleteConversationDialog
        open={!!conversationToDelete}
        deleting={isDeleting}
        onCancel={() => setConversationToDelete(null)}
        onConfirm={confirmDeleteConversation}
      />
      <ShareConversationDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        transcript={markdown}
        onCopy={(text, id, message) => void copy(text, id, message)}
      />
      <ExportConversationDialog open={exportOpen} onOpenChange={setExportOpen} markdown={markdown} plainText={plainText} />
    </MessageScrollerProvider>
  );
}
