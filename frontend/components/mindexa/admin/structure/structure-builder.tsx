"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Building2, ChevronsDownUp, ChevronsUpDown, Search, Settings2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { adminApi } from "@/lib/api/admin"
import {
  activeDescendants,
  buildTree,
  countKinds,
  indexTree,
  pathTo,
  searchTree,
  type TreeNode,
} from "@/lib/academic-structure"
import {
  PRESETS,
  profileToSettings,
  readProfile,
  presetProfile,
  type LevelKey,
  type StructureProfile,
} from "@/lib/structure-profile"
import { createEntity, setEntityActive, updateEntity, type EntityFormValues } from "@/lib/structure-actions"
import { errorMessage } from "@/lib/error-message"
import { useAcademicStructure } from "@/hooks/use-academic-structure"
import { EntityDialog, type EntityDialogState } from "./entity-dialog"
import { NodePanel } from "./node-panel"
import { ProfileDialog } from "./profile-dialog"
import { StructureTree } from "./structure-tree"

interface InstitutionOption {
  id: string
  name: string
  code: string
  is_active: boolean
}

/** Trees up to this size open fully on load; bigger ones open to the second level only. */
const OPEN_ALL_UP_TO = 40

function initialExpanded(root: TreeNode): Set<string> {
  const keys = new Set<string>()
  const total = Object.values(countKinds(root)).reduce((a, b) => a + b, 0)
  const walk = (n: TreeNode, depth: number) => {
    if (n.children.length && (total <= OPEN_ALL_UP_TO || depth < 1)) keys.add(n.key)
    n.children.forEach((c) => walk(c, depth + 1))
  }
  walk(root, 0)
  return keys
}

export function StructureBuilder() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [institutions, setInstitutions] = useState<InstitutionOption[] | null>(null)
  const [institutionId, setInstitutionId] = useState<string | null>(searchParams.get("institution"))
  const { structure, loading, error, reload } = useAcademicStructure(institutionId)

  const [selectedKey, setSelectedKey] = useState<string>("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<EntityDialogState | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [confirmSuspend, setConfirmSuspend] = useState<TreeNode | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  /** A node to select once the next reload brings it in (after adding it). */
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)

  // ── institutions ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    adminApi
      .getInstitutions()
      .then((list: InstitutionOption[]) => {
        if (cancelled) return
        setInstitutions(list)
        setInstitutionId((current) =>
          current && list.some((i) => i.id === current)
            ? current
            : ((list.find((i) => i.is_active) ?? list[0])?.id ?? null),
        )
      })
      .catch((err) => {
        if (!cancelled) {
          setInstitutions([])
          toast.error(errorMessage(err, "Could not load institutions."))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const chooseInstitution = (id: string) => {
    setInstitutionId(id)
    setSelectedKey("")
    setQuery("")
    const params = new URLSearchParams(searchParams.toString())
    params.set("institution", id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // ── tree ────────────────────────────────────────────────────────────────────
  const tree = useMemo(() => (structure ? buildTree(structure) : null), [structure])
  const index = useMemo(() => (tree ? indexTree(tree) : new Map<string, TreeNode>()), [tree])
  const savedProfile = useMemo(() => readProfile(structure?.institution.settings), [structure])
  const profile: StructureProfile = savedProfile ?? presetProfile("custom")
  const filter = useMemo(() => (tree ? searchTree(tree, query) : null), [tree, query])

  // First load of an institution: open the tree and select its root.
  useEffect(() => {
    if (!tree) return
    setExpanded((prev) => (prev.size === 0 ? initialExpanded(tree) : prev))
  }, [tree])

  // Keep the selection valid after every reload (a node may have been added or removed).
  useEffect(() => {
    if (!tree) return
    if (pendingSelect && index.has(pendingSelect)) {
      select(pendingSelect)
      setPendingSelect(null)
    } else if (!selectedKey || !index.has(selectedKey)) {
      setSelectedKey(tree.key)
    }
    // `select` only reads `tree`, which is in the dependency list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, index, pendingSelect])

  const select = useCallback(
    (key: string) => {
      if (!tree) return
      setSelectedKey(key)
      // reveal it in the tree
      setExpanded((prev) => {
        const next = new Set(prev)
        pathTo(tree, key)
          .slice(0, -1)
          .forEach((n) => next.add(n.key))
        return next
      })
    },
    [tree],
  )

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const expandAll = () =>
    tree && setExpanded(new Set([...index.values()].filter((n) => n.children.length).map((n) => n.key)))
  const collapseAll = () => tree && setExpanded(new Set([tree.key]))

  const selected = (selectedKey && index.get(selectedKey)) || tree
  const path = tree && selected ? pathTo(tree, selected.key) : []

  // ── actions ─────────────────────────────────────────────────────────────────
  const openAdd = (kind: LevelKey, parent: TreeNode) => {
    if (!tree) return
    setDialog({
      mode: "create",
      kind,
      parent,
      path: pathTo(tree, parent.key)
        .map((n) => n.name)
        .join(" › "),
    })
  }

  const openEdit = (node: TreeNode) => {
    if (node.kind === "institution") return
    setDialog({
      mode: "edit",
      kind: node.kind,
      node,
      initial: {
        name: node.name,
        code: node.code ?? "",
        level: node.extra.level != null ? String(node.extra.level) : "",
        capacity: node.extra.capacity ? String(node.extra.capacity) : "",
        room: node.extra.room ?? "",
        locationType: node.extra.locationType ?? "PHYSICAL_ROOM",
      },
    })
  }

  const submitDialog = async (state: EntityDialogState, values: EntityFormValues) => {
    if (!institutionId) return
    if (state.mode === "create") {
      const created = (await createEntity(state.kind, state.parent, institutionId, values)) as { id?: string } | null
      toast.success(`${profile.labels[state.kind].singular} added`)
      if (created?.id) setPendingSelect(`${state.kind}:${created.id}`)
      setExpanded((prev) => new Set(prev).add(state.parent.key))
    } else {
      await updateEntity(state.kind, state.node.id, values)
      toast.success("Changes saved")
    }
    setDialog(null)
    await reload()
  }

  const applyActive = async (node: TreeNode, active: boolean) => {
    if (node.kind === "institution") return
    setBusyKey(node.key)
    try {
      await setEntityActive(node.kind, node.id, active)
      toast.success(`${node.name} ${active ? "reactivated" : "suspended"}`)
      await reload()
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${active ? "reactivate" : "suspend"} ${node.name}.`))
    } finally {
      setBusyKey(null)
    }
  }

  const requestToggle = (node: TreeNode) => {
    if (node.isActive) setConfirmSuspend(node)
    else void applyActive(node, true)
  }

  const saveProfile = async (next: StructureProfile) => {
    if (!institutionId) return
    await adminApi.updateInstitution(institutionId, { settings: profileToSettings(next) })
    toast.success("Structure settings saved")
    setProfileOpen(false)
    await reload()
  }

  // codes already used next to what is being added (a duplicate is caught before the server does)
  const takenCodes = useMemo(() => {
    if (!dialog || dialog.mode !== "create") return []
    return dialog.parent.children.filter((c) => c.kind === dialog.kind && c.code).map((c) => c.code as string)
  }, [dialog])

  const inUse = useMemo(() => {
    const counts = tree ? countKinds(tree) : null
    return {
      campus: counts?.campus ?? 0,
      college: counts?.college ?? 0,
      department: counts?.department ?? 0,
      program: counts?.program ?? 0,
      year: counts?.year ?? 0,
      class: counts?.class ?? 0,
    }
  }, [tree])

  // ── render ──────────────────────────────────────────────────────────────────
  const presetTitle = PRESETS.find((p) => p.key === profile.preset)?.title

  if (institutions === null) return <PageSkeleton />

  if (institutions.length === 0) {
    return (
      <Shell>
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">No institution yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            The academic structure belongs to an institution. Register one first, then come back to organize it.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/admin/institutions">Register an institution</Link>
          </Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      actions={
        <>
          <Select value={institutionId ?? undefined} onValueChange={chooseInstitution}>
            <SelectTrigger className="h-8 w-56" aria-label="Institution">
              <SelectValue placeholder="Choose institution" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                  {i.is_active ? "" : " (suspended)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {structure && (
            <Button variant="outline" className="h-8" onClick={() => setProfileOpen(true)}>
              <Settings2 className="mr-1.5 size-3.5" />
              {savedProfile ? `Structure: ${presetTitle}` : "Structure settings"}
            </Button>
          )}
        </>
      }
    >
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button variant="outline" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      )}

      {structure && !savedProfile && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Tell us how {structure.institution.name} is organized</p>
              <p className="text-xs text-muted-foreground">
                A university, a school and a training centre all name and group things differently. Choose yours and the
                screens will use your words and hide levels you don&apos;t need.
              </p>
            </div>
          </div>
          <Button onClick={() => setProfileOpen(true)}>Choose structure</Button>
        </div>
      )}

      {loading && !structure ? (
        <PageSkeleton inline />
      ) : tree && selected ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          {/* Browse */}
          <section aria-label="Structure" className="min-w-0 rounded-2xl border bg-card">
            <div className="space-y-2 border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or code"
                  aria-label="Search the structure"
                  className="h-8 pl-8 pr-8"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {query && filter
                    ? `Showing ${filter.visible.size} item${filter.visible.size === 1 ? "" : "s"}`
                    : "Click an item to see what is inside it"}
                </span>
                {!query && (
                  <span className="flex gap-0.5">
                    <Button variant="ghost" size="icon" aria-label="Expand all" title="Expand all" onClick={expandAll}>
                      <ChevronsUpDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Collapse all"
                      title="Collapse all"
                      onClick={collapseAll}
                    >
                      <ChevronsDownUp />
                    </Button>
                  </span>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 lg:max-h-[calc(100vh-17rem)]">
              {query && filter && filter.visible.size === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nothing matches &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <StructureTree
                  root={tree}
                  profile={profile}
                  selectedKey={selected.key}
                  onSelect={(key) => select(key)}
                  expanded={expanded}
                  onToggle={toggle}
                  filter={filter}
                />
              )}
            </div>
          </section>

          {/* Details */}
          <section aria-label="Details" className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
            <NodePanel
              node={selected}
              path={path}
              profile={profile}
              busy={busyKey === selected.key}
              onSelect={select}
              onAdd={openAdd}
              onEdit={openEdit}
              onToggleActive={requestToggle}
            />
          </section>
        </div>
      ) : null}

      <EntityDialog
        state={dialog}
        profile={profile}
        takenCodes={takenCodes}
        onClose={() => setDialog(null)}
        onSubmit={submitDialog}
      />

      <ProfileDialog
        open={profileOpen}
        institutionName={structure?.institution.name ?? ""}
        profile={savedProfile}
        inUse={inUse}
        onClose={() => setProfileOpen(false)}
        onSave={saveProfile}
      />

      <AlertDialog open={confirmSuspend !== null} onOpenChange={(open) => !open && setConfirmSuspend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {confirmSuspend?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSuspend && activeDescendants(confirmSuspend) > 0
                ? `It will stop appearing when choosing where to assign lecturers or create classes, and so will the ${activeDescendants(confirmSuspend)} active item${activeDescendants(confirmSuspend) === 1 ? "" : "s"} inside it. Nothing is deleted, and you can reactivate it at any time.`
                : "It will stop appearing when choosing where to assign lecturers or create classes. Nothing is deleted, and you can reactivate it at any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const node = confirmSuspend
                setConfirmSuspend(null)
                if (node) void applyActive(node, false)
              }}
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  )
}

function Shell({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div data-tour="admin-academic" className="w-full min-w-0 space-y-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Academic Structure</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            How your institution is organized. Select an item to see what is inside it, and add what is missing.
          </p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

function PageSkeleton({ inline = false }: { inline?: boolean }) {
  const body = (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Skeleton className="h-96 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  )
  return inline ? body : <Shell>{body}</Shell>
}
