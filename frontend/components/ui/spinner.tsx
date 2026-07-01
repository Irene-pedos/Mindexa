import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import * as React from "react"

export type SpinnerProps = React.HTMLAttributes<HTMLDivElement>

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      {...props}
    >
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  )
}
