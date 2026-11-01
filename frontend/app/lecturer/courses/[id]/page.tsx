// app/lecturer/courses/[id]/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  BookOpen,
  ChevronLeft,
  Database,
  FileText,
  ImageIcon,
  Loader2,
  MoreVertical,
  Plus,
  TrendingUp,
  Users,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { lecturerApi, type LecturerMaterialResponse, type WorkspaceDetail } from "@/lib/api/lecturer";
import { errorMessage } from "@/lib/error-message";
import { materialView } from "@/lib/material-processing";
import { cn } from "@/lib/utils";
import { MaterialsPanel } from "@/components/mindexa/lecturer/course/materials-panel";
import { CourseRoster } from "@/components/mindexa/lecturer/course/course-roster";
import { StudentRecordDialog } from "@/components/mindexa/lecturer/course/student-record-dialog";
import { BannerDialog } from "@/components/mindexa/lecturer/course/banner-dialog";

export default function LecturerWorkspaceDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null | undefined>(undefined);
  const [materials, setMaterials] = useState<LecturerMaterialResponse[]>([]);
  const [tab, setTab] = useState("students");

  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([lecturerApi.getWorkspaceDetail(id), lecturerApi.getWorkspaceMaterials(id)])
      .then(([detail, files]) => {
        if (!live) return;
        setWorkspace(detail);
        setMaterials(files);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setWorkspace(null);
        toast.error(errorMessage(err, "Could not load this course."));
      });
    return () => {
      live = false;
    };
  }, [id]);

  // Stable, so the materials panel's polling effect does not restart on every render.
  const updateMaterials = useCallback(
    (update: (current: LecturerMaterialResponse[]) => LecturerMaterialResponse[]) => setMaterials(update),
    [],
  );

  const archive = async () => {
    setArchiving(true);
    try {
      await lecturerApi.archiveWorkspace(id);
      toast.success("Course archived");
      router.push("/lecturer/courses");
    } catch (err) {
      toast.error(errorMessage(err, "Could not archive this course."));
      setArchiving(false);
    }
  };

  if (workspace === undefined) {
    return (
      <div className="w-full min-w-0 space-y-5">
        <div className="flex items-center gap-3 border-b pb-4">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground">
          <Database className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Course not found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            It may have been archived or is not attached to your account.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/lecturer/courses">Back to my courses</Link>
        </Button>
      </div>
    );
  }

  const placement = [workspace.institution_name, workspace.department_name, workspace.option_name].filter(Boolean).join(" · ");
  const cohort = workspace.class_name === "GLOBAL" ? "All classes" : workspace.class_name;
  const ready = materials.filter((m) => materialView(m).phase === "ready").length;
  const needsAttention = materials.filter((m) => materialView(m).phase === "failed").length;
  const preparing = materials.filter((m) => materialView(m).active).length;

  const stats = [
    {
      icon: Users,
      label: "Students",
      value: String(workspace.student_count),
      note: cohort,
    },
    {
      icon: TrendingUp,
      label: "Class average",
      value: workspace.performance_avg > 0 ? `${workspace.performance_avg.toFixed(1)}%` : "—",
      note: workspace.performance_avg > 0 ? "of graded work" : "no graded work yet",
    },
    {
      icon: FileText,
      label: "Materials ready",
      value: `${ready}/${materials.length}`,
      note: needsAttention ? `${needsAttention} need attention` : preparing ? `${preparing} being prepared` : "for students and the AI tools",
      warn: needsAttention > 0,
    },
    {
      icon: BookOpen,
      label: "Academic period",
      value: workspace.academic_year || "—",
      note: workspace.language ? `Language: ${workspace.language}` : "",
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-5 pb-10 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" asChild className="shrink-0" aria-label="Back to my courses">
            <Link href="/lecturer/courses">
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{workspace.title}</h1>
              <Badge variant="outline" className="border-primary/20 bg-primary/10 font-mono text-[10px] text-primary">
                {workspace.code}
              </Badge>
            </div>
            {placement && <p className="mt-0.5 truncate text-xs text-muted-foreground">{placement}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/lecturer/assessments?workspace=${id}`}>
              <ClipboardList className="mr-1.5 size-4" /> Assessments
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/lecturer/assessments/new?workspace=${id}`}>
              <Plus className="mr-1.5 size-4" /> New assessment
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setBannerOpen(true)}>
                <ImageIcon className="mr-2 size-3.5" /> Change banner
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArchiveOpen(true)}>
                <Archive className="mr-2 size-3.5" /> Archive course
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Banner */}
      <div className="relative h-28 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-primary/5 to-muted sm:h-32">
        {workspace.banner_image_url && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(workspace.banner_image_url)})` }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/30 to-transparent" />
        <div className="relative flex h-full items-end justify-between gap-3 p-4">
          <p className="text-xs font-semibold text-foreground">
            {[workspace.code, cohort, workspace.academic_year].filter(Boolean).join(" · ")}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setBannerOpen(true)} className="h-7 text-xs">
            <ImageIcon className="mr-1.5 size-3" /> {workspace.banner_image_url ? "Edit banner" : "Add a banner"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, note, warn }) => (
          <div
            key={label}
            className={cn("flex items-center justify-between gap-2 rounded-2xl border bg-card p-4", warn && "border-amber-500/40")}
          >
            <div className="min-w-0 space-y-0.5">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="truncate text-xl font-semibold tabular-nums tracking-tight">{value}</dd>
              {note && (
                <p className={cn("truncate text-[11px]", warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{note}</p>
              )}
            </div>
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground",
                warn && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              <Icon className="size-4" />
            </span>
          </div>
        ))}
      </dl>

      {/* Students and materials */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto p-1">
          <TabsTrigger value="students" className="gap-1.5">
            <Users className="size-3.5" /> Students
            <span className="text-[10px] tabular-nums opacity-70">{workspace.roster?.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5">
            <FileText className="size-3.5" /> Materials
            <span className="text-[10px] tabular-nums opacity-70">{materials.length}</span>
            {preparing > 0 && <Loader2 className="size-3 animate-spin text-primary" aria-label="Files are being prepared" />}
            {needsAttention > 0 && <span className="size-1.5 rounded-full bg-destructive" aria-label="Some files need attention" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <CourseRoster roster={workspace.roster ?? []} onOpen={(s) => setStudent({ id: s.id, name: s.name })} />
        </TabsContent>
        <TabsContent value="materials" className="mt-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <MaterialsPanel workspaceId={id} materials={materials} onMaterials={updateMaterials} />
        </TabsContent>
      </Tabs>

      <StudentRecordDialog workspaceId={id} student={student} onClose={() => setStudent(null)} />

      <BannerDialog
        open={bannerOpen}
        workspaceId={id}
        current={workspace.banner_image_url}
        onClose={() => setBannerOpen(false)}
        onSaved={(updated) => {
          setWorkspace((current) => (current ? { ...current, ...updated, roster: current.roster } : updated));
          setBannerOpen(false);
        }}
      />

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this course?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves your active courses. Student grades and submissions are kept safely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={(e) => {
                e.preventDefault();
                void archive();
              }}
            >
              {archiving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Archive course
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
