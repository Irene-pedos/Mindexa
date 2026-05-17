// app/(student)/resources/page.tsx
"use client"

import React, { useState, useEffect } from "react"
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
import { studentApi, StudentResourceResponse } from "@/lib/api/student"

interface UploadingFile {
  id: number
  name: string
  progress: number
  size: string
}

export default function StudentResourcesPage() {
  const [resources, setResources] = useState<StudentResourceResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [viewingResource, setViewingResource] = useState<StudentResourceResponse | null>(null)

  useEffect(() => {
    loadResources()
  }, [])

  const loadResources = async () => {
    try {
      const data = await studentApi.getPersonalResources()
      setResources(data)
    } catch (err) {
      toast.error("Failed to load resources")
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const uploadId = Date.now()
      const newUpload = {
        id: uploadId,
        name: file.name,
        progress: 10,
        size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      }

      setUploadingFiles((prev) => [...prev, newUpload])

      try {
        const formData = new FormData()
        formData.append("file", file)

        await studentApi.uploadPersonalResource(formData)
        toast.success(`${file.name} uploaded successfully`)
        loadResources()
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`)
      } finally {
        setUploadingFiles((prev) => prev.filter((item) => item.id !== uploadId))
      }
    }

    // Reset input
    e.target.value = ""
  }

  const deleteResource = async (id: string) => {
    try {
      await studentApi.deletePersonalResource(id)
      setResources(resources.filter((r) => r.id !== id))
      toast.info("Resource removed")
    } catch (err) {
      toast.error("Failed to delete resource")
    }
  }

  const handleDownload = (resource: StudentResourceResponse) => {
    toast.error("Download for personal resources not yet implemented in this view")
  }

  const handleView = (resource: StudentResourceResponse) => {
    toast.error("Preview for personal resources not yet implemented in this view")
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
      </div>
    )
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
          <CardDescription>Private study materials only. These are never visible to lecturers.</CardDescription>
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
                      <div className="font-medium">{resource.display_name || resource.original_filename}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 h-5">{resource.file_extension}</Badge>
                        <span>{resource.subject_tag || "General"}</span> • <span>{(resource.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span> • <span>{format(new Date(resource.created_at), "MMM d, yyyy")}</span>
                      </div>
                      {resource.processing_status !== "COMPLETED" && (
                         <div className="mt-1 flex items-center gap-2">
                            <Badge variant="secondary" className="text-[9px] h-4">
                               {resource.processing_status === "PROCESSING" ? "INDEXING FOR AI..." : resource.processing_status}
                            </Badge>
                         </div>
                      )}
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
              <DialogTitle className="truncate">{viewingResource?.display_name || viewingResource?.original_filename}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => viewingResource && handleDownload(viewingResource)}>
                  <Download className="size-4 mr-2" /> Download
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/30 flex items-center justify-center">
             <div className="text-center p-8 max-w-md">
                <FileText className="size-16 mx-auto text-muted-foreground/20 mb-4" />
                <h3 className="text-lg font-medium mb-2">Preview Unavailable</h3>
                <p className="text-sm text-muted-foreground">
                   Secure preview for personal study materials is currently restricted. 
                   Please download the file to view its contents.
                </p>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}