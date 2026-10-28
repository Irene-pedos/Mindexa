"use client"

import { useMemo, useRef, type KeyboardEvent } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TreeNode } from "@/lib/academic-structure"
import type { StructureProfile } from "@/lib/structure-profile"
import { KIND_ICON, KIND_TONE, kindLabel } from "./kind-meta"

interface StructureTreeProps {
  root: TreeNode
  profile: StructureProfile
  selectedKey: string
  onSelect: (key: string) => void
  expanded: Set<string>
  onToggle: (key: string) => void
  /** Active search: only these nodes are shown and these are opened. */
  filter: { visible: Set<string>; expand: Set<string> } | null
}

interface Row {
  node: TreeNode
  depth: number
  open: boolean
  hasChildren: boolean
}

/** The rows currently on screen, in order, honouring what is expanded and the search filter. */
function flatten(root: TreeNode, expanded: Set<string>, filter: StructureTreeProps["filter"]): Row[] {
  const rows: Row[] = []
  const walk = (node: TreeNode, depth: number) => {
    if (filter && !filter.visible.has(node.key)) return
    const children = filter ? node.children.filter((c) => filter.visible.has(c.key)) : node.children
    const open = filter ? filter.expand.has(node.key) : expanded.has(node.key)
    rows.push({ node, depth, open, hasChildren: children.length > 0 })
    if (open) children.forEach((c) => walk(c, depth + 1))
  }
  walk(root, 0)
  return rows
}

export function StructureTree({
  root,
  profile,
  selectedKey,
  onSelect,
  expanded,
  onToggle,
  filter,
}: StructureTreeProps) {
  const rows = useMemo(() => flatten(root, expanded, filter), [root, expanded, filter])
  const container = useRef<HTMLUListElement>(null)

  const focusRow = (key: string) => {
    container.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey
    if (!key) return
    const index = rows.findIndex((r) => r.node.key === key)
    if (index < 0) return
    const row = rows[index]

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        if (rows[index + 1]) focusRow(rows[index + 1].node.key)
        break
      case "ArrowUp":
        event.preventDefault()
        if (rows[index - 1]) focusRow(rows[index - 1].node.key)
        break
      case "ArrowRight":
        event.preventDefault()
        if (row.hasChildren && !row.open) onToggle(key)
        else if (row.hasChildren && rows[index + 1]) focusRow(rows[index + 1].node.key)
        break
      case "ArrowLeft": {
        event.preventDefault()
        if (row.hasChildren && row.open) onToggle(key)
        else {
          const parent = [...rows.slice(0, index)].reverse().find((r) => r.depth < row.depth)
          if (parent) focusRow(parent.node.key)
        }
        break
      }
      case "Home":
        event.preventDefault()
        focusRow(rows[0].node.key)
        break
      case "End":
        event.preventDefault()
        focusRow(rows[rows.length - 1].node.key)
        break
    }
  }

  return (
    <ul ref={container} role="tree" aria-label="Academic structure" onKeyDown={onKeyDown} className="space-y-0.5">
      {rows.map(({ node, depth, open, hasChildren }) => {
        const Icon = KIND_ICON[node.kind]
        const selected = node.key === selectedKey
        return (
          <li key={node.key} role="none">
            <button
              type="button"
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={selected}
              aria-expanded={hasChildren ? open : undefined}
              data-row-key={node.key}
              title={node.name}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(node.key)}
              style={{ paddingLeft: 8 + depth * 18 }}
              className={cn(
                "group flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                selected ? "bg-primary/10 text-foreground" : "hover:bg-muted/60",
                !node.isActive && "opacity-60",
              )}
            >
              <span
                aria-hidden
                onClick={(e) => {
                  if (!hasChildren) return
                  e.stopPropagation()
                  onToggle(node.key)
                }}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground",
                  hasChildren && "hover:bg-muted",
                )}
              >
                {hasChildren && <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />}
              </span>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", KIND_TONE[node.kind])}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn("block truncate text-[13px] leading-tight", selected ? "font-semibold" : "font-medium")}
                >
                  {node.name}
                </span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {kindLabel(profile, node.kind)}
                  {node.code ? ` · ${node.code}` : ""}
                </span>
              </span>
              {!node.isActive ? (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  Suspended
                </span>
              ) : node.kind !== "class" && node.students > 0 ? (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title="Students">
                  {node.students}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
