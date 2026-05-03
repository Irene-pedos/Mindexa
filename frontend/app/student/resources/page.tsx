// app/(student)/resources/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Upload, FileText, Download, Trash2, Eye, X, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import { toast } from "sonner"

interface Resource {
  id: number
  name: string
  type: string
  size: string
  date: string
  subject: string
  url?: string
}

const initialResources: Resource[] = [
  { id: 1, name: "Lecture Notes - Database Systems Week 7.pdf", type: "PDF", size: "2.4 MB", date: "Mar 25, 2026", subject: "Database Systems" },
  { id: 2, name: "Past Exam Papers - Algorithms 2025.pdf", type: "PDF", size: "1.8 MB", date: "Mar 20, 2026", subject: "Algorithms" },
]

interface UploadingFile {
  id: number
  name: string
  progress: number
  size: string
}

export default function StudentResourcesPage() {
  const [resources, setResources] = useState(initialResources)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [viewingResource, setViewingResource] = useState<Resource | null>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file, index) => {
      const uploadId = Date.now() + index
      const newUpload = {
        id: uploadId,
        name: file.name,
        progress: 0,
        size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      }

      setUploadingFiles((prev) => [...prev, newUpload])

      // Simulate real upload progress
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 25
        if (progress > 100) progress = 100

        setUploadingFiles((prev) =>
          prev.map((item) =>
            item.id === uploadId ? { ...item, progress } : item
          )
        )

        if (progress >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            const newResource: Resource = {
              id: Date.now(),
              name: file.name,
              type: file.name.split(".").pop()?.toUpperCase() || "FILE",
              size: newUpload.size,
              date: format(new Date(), "MMM d, yyyy"),
              subject: "General",
              url: URL.createObjectURL(file),
            }
            setResources((prev) => [newResource, ...prev])
            setUploadingFiles((prev) => prev.filter((item) => item.id !== uploadId))
            toast.success(`${file.name} uploaded successfully`)
          }, 600)
        }
      }, 300)
    })

    // Reset input
    e.target.value = ""
  }

  const deleteResource = (id: number) => {
    setResources(resources.filter((r) => r.id !== id))
    toast.info("Resource removed")
  }

  const handleDownload = (resource: Resource) => {
    if (!resource.url) {
      toast.error("Download not available for this mock resource")
      return
    }
    const link = document.createElement("a")
    link.href = resource.url
    link.download = resource.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleView = (resource: Resource) => {
    if (!resource.url) {
      toast.error("Preview not available for this mock resource")
      return
    }
    setViewingResource(resource)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My Study Resources</h1>
          <p className="text-muted-foreground mt-1">Personal uploaded materials for revision and study support</p>
        </div>

        <label className="cursor-pointer">
          <Button asChild size="lg" className="font-medium">
            <span>
              <Upload className="mr-2 size-5" />
              Upload Files
            </span>
          </Button>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              Uploading ({uploadingFiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            {uploadingFiles.map((file) => (
              <div key={file.id} className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="truncate max-w-[80%]">{file.name}</span>
                  <span>{file.progress.toFixed(0)}%</span>
                </div>
                <Progress value={file.progress} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Resources List */}
      <Card>
        <CardHeader>
          <CardTitle>All Resources ({resources.length})</CardTitle>
          <CardDescription>Private study materials only</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {resources.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <FileText className="size-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No resources uploaded yet.</p>
              </div>
            ) : (
              resources.map((resource) => (
                <div key={resource.id} className="flex items-center justify-between rounded-xl border p-5 hover:bg-muted/50 group transition-all">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                      <FileText className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium">{resource.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 h-5">{resource.type}</Badge>
                        <span>{resource.subject}</span> • <span>{resource.size}</span> • <span>{resource.date}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => handleView(resource)}>
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDownload(resource)}>
                      <Download className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteResource(resource.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resource Viewer Dialog */}
      <Dialog open={!!viewingResource} onOpenChange={(open) => !open && setViewingResource(null)}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="truncate">{viewingResource?.name}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => viewingResource && handleDownload(viewingResource)}>
                  <Download className="size-4 mr-2" /> Download
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/30">
            {viewingResource?.url ? (
              <iframe
                src={viewingResource.url}
                className="w-full h-full border-none"
                title={viewingResource.name}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center">
                <X className="size-12 mb-4 opacity-20" />
                <p>Preview not available for this resource type or mock file.</p>
                <p className="text-sm mt-2">Try downloading the file instead.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}