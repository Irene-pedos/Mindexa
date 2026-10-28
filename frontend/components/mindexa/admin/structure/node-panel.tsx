"use client"

import Link from "next/link"
import { ChevronRight, Loader2, Pencil, Plus, Power } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { allowedChildKinds, countKinds, type NodeKind, type TreeNode } from "@/lib/academic-structure"
import { LEVEL_ORDER, type LevelKey, type StructureProfile } from "@/lib/structure-profile"
import { KIND_HINT, KIND_ICON, KIND_TONE, kindLabel } from "./kind-meta"

interface NodePanelProps {
  node: TreeNode
  /** Root-to-node path, for the breadcrumb. */
  path: TreeNode[]
  profile: StructureProfile
  busy: boolean
  onSelect: (key: string) => void
  onAdd: (kind: LevelKey, parent: TreeNode) => void
  onEdit: (node: TreeNode) => void
  onToggleActive: (node: TreeNode) => void
}

const DELIVERY_LABEL: Record<string, string> = {
  PHYSICAL_ROOM: "In a room",
  ONLINE: "Online",
  HYBRID: "Hybrid",
  NOT_APPLICABLE: "Not applicable",
}

export function NodePanel({ node, path, profile, busy, onSelect, onAdd, onEdit, onToggleActive }: NodePanelProps) {
  const Icon = KIND_ICON[node.kind]
  const addable = allowedChildKinds(node.kind, profile.enabled)
  const isRoot = node.kind === "institution"
  const groups = groupChildren(node.children)

  return (
    <div className="space-y-5">
      {/* Where am I (not needed on the top level, where the title says it) */}
      {path.length > 1 && (
        <nav aria-label="Location" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {path.map((n, i) => (
            <span key={n.key} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              {i === path.length - 1 ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {n.name}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(n.key)}
                  className="rounded px-0.5 hover:text-foreground hover:underline"
                >
                  {n.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* What is it */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", KIND_TONE[node.kind])}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {kindLabel(profile, node.kind)}
            </p>
            <h2 className="break-words text-xl font-semibold leading-tight tracking-tight">{node.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {node.code && (
                <Badge variant="outline" className="font-mono text-xs">
                  {node.code}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  node.isActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                )}
              >
                {node.isActive ? "Active" : "Suspended"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isRoot ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/institutions">Institution details</Link>
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => onEdit(node)}>
                <Pencil className="mr-1.5 size-3.5" /> Edit
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onToggleActive(node)}
                className={
                  node.isActive
                    ? "text-amber-700 hover:text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
                }
              >
                {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Power className="mr-1.5 size-3.5" />}
                {node.isActive ? "Suspend" : "Reactivate"}
              </Button>
            </>
          )}
        </div>
      </header>

      {!node.isActive && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          This {kindLabel(profile, node.kind).toLowerCase()} is suspended, so it no longer appears when choosing where
          to assign lecturers or create classes. Reactivate it to bring it back.
        </p>
      )}

      {/* Key facts */}
      <Facts node={node} profile={profile} root={isRoot ? node : null} />

      {/* Add inside */}
      {addable.length > 0 && (
        <section aria-label="Add" className="flex flex-wrap items-center gap-2">
          {addable.map((kind, i) => (
            <Button
              key={kind}
              variant={i === 0 ? "default" : "outline"}
              title={KIND_HINT[kind]}
              onClick={() => onAdd(kind, node)}
            >
              <Plus className="mr-1.5 size-3.5" />
              Add {profile.labels[kind].singular.toLowerCase()}
              {kind === "class" && node.kind === "department" && profile.enabled.program ? " (no programme)" : ""}
            </Button>
          ))}
        </section>
      )}

      {/* What is inside */}
      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map(({ kind, nodes }) => (
            <section key={kind} aria-label={profile.labels[kind as LevelKey]?.plural}>
              <h3 className="mb-1.5 text-sm font-semibold">
                {kindLabel(profile, kind, true)}{" "}
                <span className="font-normal text-muted-foreground">({nodes.length})</span>
              </h3>
              <ul className="divide-y rounded-xl border">
                {nodes.map((child) => (
                  <ChildRow key={child.key} child={child} profile={profile} onSelect={onSelect} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState node={node} profile={profile} addable={addable} onAdd={onAdd} />
      )}

      {node.kind === "class" && (
        <p className="text-xs text-muted-foreground">
          Students enrol in classes, and lecturers are assigned to teach them.{" "}
          <Link href="/admin/academic/assignments" className="font-medium text-primary hover:underline">
            Manage teaching assignments
          </Link>
        </p>
      )}
      {node.kind === "department" && (
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/courses" className="font-medium text-primary hover:underline">
            Manage this department&apos;s courses
          </Link>
        </p>
      )}
    </div>
  )
}

function groupChildren(children: TreeNode[]): { kind: NodeKind; nodes: TreeNode[] }[] {
  const order: NodeKind[] = ["campus", "college", "department", "program", "year", "class"]
  return order
    .map((kind) => ({ kind, nodes: children.filter((c) => c.kind === kind) }))
    .filter((g) => g.nodes.length > 0)
}

function ChildRow({
  child,
  profile,
  onSelect,
}: {
  child: TreeNode
  profile: StructureProfile
  onSelect: (key: string) => void
}) {
  const Icon = KIND_ICON[child.kind]
  const meta = [
    child.kind !== "class" && child.classes > 0
      ? `${child.classes} ${child.classes === 1 ? profile.labels.class.singular.toLowerCase() : profile.labels.class.plural.toLowerCase()}`
      : "",
    child.students > 0 ? `${child.students} student${child.students === 1 ? "" : "s"}` : "",
    child.kind === "class" ? child.detail : child.kind === "year" ? child.detail : "",
  ].filter(Boolean)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(child.key)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
          !child.isActive && "opacity-60",
        )}
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", KIND_TONE[child.kind])}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{child.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[child.code, ...meta].filter(Boolean).join(" · ") || kindLabel(profile, child.kind)}
          </span>
        </span>
        {!child.isActive && (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
          >
            Suspended
          </Badge>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

function Facts({ node, profile, root }: { node: TreeNode; profile: StructureProfile; root: TreeNode | null }) {
  const facts: { label: string; value: string }[] = []

  if (root) {
    const counts = countKinds(root, true) // active items only, matching what pickers elsewhere offer
    for (const key of LEVEL_ORDER) {
      if (counts[key] > 0 || profile.enabled[key])
        facts.push({ label: profile.labels[key].plural, value: String(counts[key]) })
    }
    facts.push({ label: "Students", value: String(root.students) })
  } else if (node.kind === "class") {
    facts.push({ label: "Students enrolled", value: String(node.students) })
    if (node.extra.capacity) facts.push({ label: "Seats", value: String(node.extra.capacity) })
    facts.push({ label: "Delivery", value: DELIVERY_LABEL[node.extra.locationType ?? ""] ?? "In a room" })
    if (node.extra.room)
      facts.push({ label: node.extra.locationType === "ONLINE" ? "Link" : "Room", value: node.extra.room })
    if (node.extra.academicYear) facts.push({ label: "Academic year", value: node.extra.academicYear })
  } else {
    if (node.extra.level != null)
      facts.push({ label: `${profile.labels.year.singular} number`, value: String(node.extra.level) })
    if (node.classes > 0) facts.push({ label: profile.labels.class.plural, value: String(node.classes) })
    if (node.students > 0) facts.push({ label: "Students", value: String(node.students) })
    if (node.kind === "department") facts.push({ label: "Courses", value: String(node.extra.courses ?? 0) })
  }

  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {facts.map((f) => (
        <div key={f.label} className="rounded-xl border bg-muted/20 px-3 py-2">
          <dt className="truncate text-xs text-muted-foreground">{f.label}</dt>
          <dd className="truncate text-lg font-semibold tabular-nums leading-snug">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function EmptyState({
  node,
  profile,
  addable,
  onAdd,
}: {
  node: TreeNode
  profile: StructureProfile
  addable: LevelKey[]
  onAdd: (kind: LevelKey, parent: TreeNode) => void
}) {
  if (addable.length === 0) return null
  const first = addable[0]
  const isRoot = node.kind === "institution"
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <p className="text-sm font-medium">
        {isRoot
          ? "Start building your structure"
          : `Nothing in this ${kindLabel(profile, node.kind).toLowerCase()} yet`}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        {isRoot
          ? `Begin with the top level you use. Lecturers, courses and students all attach to a ${profile.labels.department.singular.toLowerCase()} and its ${profile.labels.class.plural.toLowerCase()}.`
          : KIND_HINT[first]}
      </p>
      <Button size="sm" className="mt-3" onClick={() => onAdd(first, node)}>
        <Plus className="mr-1.5 size-3.5" />
        Add {profile.labels[first].singular.toLowerCase()}
      </Button>
    </div>
  )
}
