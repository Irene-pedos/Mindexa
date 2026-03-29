// components/mindexa/dashboard/study-resources.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

const resources = [
  { name: "Lecture Notes – Week 7.pdf", size: "2.4 MB" },
  { name: "Past Papers – Algorithms", size: "Shared folder" },
]

export function StudyResources() {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Study Resources</CardTitle>
          <Button size="sm" variant="outline">
            <Upload className="mr-2 size-4" />
            Upload
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {resources.map((res, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50">
            <FileText className="size-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{res.name}</div>
              <div className="text-xs text-muted-foreground">{res.size}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}