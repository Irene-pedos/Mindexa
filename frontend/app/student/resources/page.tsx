// app/(student)/resources/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Upload, FileText, Download, Trash2, Eye, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Resource {
  id: number
  name: string
  type: string
  size: string
  date: string
  subject: string
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
              date: "Mar 28, 2026",
              subject: "General",
            }
            setResources((prev) => [newResource, ...prev])
            setUploadingFiles((prev) => prev.filter((item) => item.id !== uploadId))
          }, 600)
        }
      }, 300)
    })

    // Reset input
    e.target.value = ""
  }

  const deleteResource = (id: number) => {
    setResources(resources.filter((r) => r.id !== id))
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
        <Card>
          <CardHeader>
            <CardTitle>Uploading ({uploadingFiles.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploadingFiles.map((file) => (
              <div key={file.id} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{file.name}</span>
                  <span>{file.progress.toFixed(0)}%</span>
                </div>
                <Progress value={file.progress} className="h-2" />
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
            {resources.map((resource) => (
              <div key={resource.id} className="flex items-center justify-between rounded-xl border p-5 hover:bg-muted/50 group">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                    <FileText className="size-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium">{resource.name}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-3">
                      <span>{resource.subject}</span> • <span>{resource.size}</span> • <span>{resource.date}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon"><Eye className="size-4" /></Button>
                  <Button variant="ghost" size="icon"><Download className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteResource(resource.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}