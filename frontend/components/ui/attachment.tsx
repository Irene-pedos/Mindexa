import * as React from "react"
import { cn } from "@/lib/utils"

export type AttachmentGroupProps = React.HTMLAttributes<HTMLDivElement>

export const AttachmentGroup = React.forwardRef<HTMLDivElement, AttachmentGroupProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    />
  )
)
AttachmentGroup.displayName = "AttachmentGroup"

export interface AttachmentProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical"
  state?: "default" | "uploading"
}

export const Attachment = React.forwardRef<HTMLDivElement, AttachmentProps>(
  ({ className, orientation = "horizontal", state = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:bg-accent/10 hover:shadow-md",
        orientation === "vertical" ? "flex-col items-center text-center gap-2 w-32" : "flex-row items-center gap-3 w-full",
        state === "uploading" && "opacity-70 border-dashed animate-pulse",
        className
      )}
      {...props}
    />
  )
)
Attachment.displayName = "Attachment"

export interface AttachmentMediaProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "icon" | "image"
}

export const AttachmentMedia = React.forwardRef<HTMLDivElement, AttachmentMediaProps>(
  ({ className, variant = "icon", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        variant === "image" 
          ? "overflow-hidden w-full aspect-video" 
          : "size-10",
        className
      )}
      {...props}
    />
  )
)
AttachmentMedia.displayName = "AttachmentMedia"

export type AttachmentContentProps = React.HTMLAttributes<HTMLDivElement>

export const AttachmentContent = React.forwardRef<HTMLDivElement, AttachmentContentProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex-1 min-w-0 flex flex-col gap-0.5", className)}
      {...props}
    />
  )
)
AttachmentContent.displayName = "AttachmentContent"

export type AttachmentTitleProps = React.HTMLAttributes<HTMLHeadingElement>

export const AttachmentTitle = React.forwardRef<HTMLHeadingElement, AttachmentTitleProps>(
  ({ className, ...props }, ref) => (
    <h4
      ref={ref}
      className={cn("text-xs font-semibold text-foreground truncate select-none", className)}
      {...props}
    />
  )
)
AttachmentTitle.displayName = "AttachmentTitle"

export type AttachmentDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

export const AttachmentDescription = React.forwardRef<HTMLParagraphElement, AttachmentDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-[10px] text-muted-foreground truncate select-none", className)}
      {...props}
    />
  )
)
AttachmentDescription.displayName = "AttachmentDescription"

export type AttachmentActionsProps = React.HTMLAttributes<HTMLDivElement>

export const AttachmentActions = React.forwardRef<HTMLDivElement, AttachmentActionsProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-1.5 shrink-0 ml-auto", className)}
      {...props}
    />
  )
)
AttachmentActions.displayName = "AttachmentActions"

export type AttachmentActionProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export const AttachmentAction = React.forwardRef<HTMLButtonElement, AttachmentActionProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex size-6 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors outline-none",
        className
      )}
      {...props}
    />
  )
)
AttachmentAction.displayName = "AttachmentAction"
