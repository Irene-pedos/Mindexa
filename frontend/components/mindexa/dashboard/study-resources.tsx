// components/mindexa/dashboard/study-resources.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StudentResourceResponse } from "@/lib/api/student"
import Link from "next/link"

interface StudyResourcesProps {
  resources?: StudentResourceResponse[]
}

export function StudyResources({ resources = [] }: StudyResourcesProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Study Resources</CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href="/student/resources">
              <Upload className="mr-2 size-4" />
              Upload
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No resources uploaded yet.
          </p>
        ) : (
          resources.slice(0, 3).map((res, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <FileText className="size-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {res.display_name || res.original_filename}
                </div>
                <div className="text-xs text-muted-foreground uppercase">
                  {res.file_extension} • {(res.file_size_bytes / 1024).toFixed(0)} KB
                </div>
              </div>
            </div>
          ))
        )}
        {resources.length > 3 && (
          <Button variant="ghost" className="w-full text-xs" asChild>
            <Link href="/student/resources">View all resources</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}