import re

with open('frontend/app/lecturer/assessments/[id]/edit/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Core State initialization for empty defaults
content = content.replace('startTime: "09:00",', 'startTime: "",')
content = content.replace('endTime: "11:00",', 'endTime: "",')
content = content.replace('durationMinutes: 120,', 'durationMinutes: "" as any,')
content = content.replace('passing_marks: 70,', 'passing_marks: "" as any,')

# Blueprint defaults (in setBlueprint hooks or initialization)
content = content.replace('marks: 0,', 'marks: "" as any,')
content = content.replace('questions: 0,', 'questions: "" as any,')

# Questions default
content = content.replace('marks: 2,', 'marks: "" as any,')

# 2. Add required asterisks
required_labels = ['Display Title', 'Assessment Protocol', 'Course / Module', 'Scheduled Date', 'Access Start', 'Access End', 'Duration', 'Passing Threshold', 'Marks Allocation', 'Target Question Nodes']
for label in required_labels:
    content = re.sub(r'<Label className="(.*?)">(.*?)'+label+'(.*?)</Label>', r'<Label className="\1">\2'+label+r'\3 <span className="text-red-500">*</span></Label>', content)

# 3. Add handleNextStep validation
if 'const handleNextStep' not in content:
    handle_next_step = """
  const handleNextStep = (step: number) => {
    if (step === 2) {
      if (!metadata.title) return toast.error("Display Title is required");
      if (!metadata.mode) return toast.error("Assessment Protocol is required");
      if (!metadata.date) return toast.error("Scheduled Date is required");
      if (!metadata.startTime) return toast.error("Access Start is required");
      if (!metadata.endTime) return toast.error("Access End is required");
      if (!metadata.durationMinutes || parseInt(metadata.durationMinutes as any) <= 0) return toast.error("Valid duration is required");
      if (!metadata.passing_marks || parseInt(metadata.passing_marks as any) <= 0) return toast.error("Valid passing marks is required");
    }
    if (step === 4 && metadata.mode !== "Groupwork") {
      for (const b of blueprint) {
        if (!b.section) return toast.error("All sections must have a title");
        if (!b.marks || parseInt(b.marks as any) <= 0) return toast.error("All sections must have allocated marks");
        if (!b.questions || parseInt(b.questions as any) <= 0) return toast.error("All sections must have target question count");
      }
    }
    setActiveStep(step);
  };
"""
    content = content.replace('  const totalMarks = useMemo(', handle_next_step + '\n  const totalMarks = useMemo(')

# Replace all onClick={() => setActiveStep(X)} with handleNextStep(X) inside the StepperContent buttons
content = re.sub(r'onClick={\(\) => setActiveStep\((\d+)\)}', r'onClick={() => handleNextStep(\1)}', content)

# 4. Expandable Image Upload in QuestionCard
new_image_upload_logic = """
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
                <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Contextual Media <span className="text-muted-foreground/40 font-normal lowercase">(optional)</span></Label>
                {!question.imageUrl && (
                    <label className="cursor-pointer flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-primary/60 hover:text-primary transition-colors">
                        <Upload className="size-3" /> Add
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                )}
            </div>
            {question.imageUrl && (
              <div className="relative inline-block border rounded p-1 bg-muted/30 group overflow-hidden w-full h-[80px]">
                <img src={question.imageUrl} alt="Diagram" className="w-full h-full object-contain rounded-sm" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                  <Button variant="destructive" size="sm" onClick={() => onUpdate({ imageUrl: undefined })} className="h-6 rounded text-[9px] font-bold uppercase tracking-widest"><Trash2 className="size-3 mr-1.5" /> Remove</Button>
                </div>
              </div>
            )}
          </div>
"""

# Try to find the old image upload logic and replace it
content = re.sub(r'<div className="space-y-2">\s*<Label className="text-\[9px\] font-bold uppercase tracking-widest text-muted-foreground/60">Contextual Media</Label>.*?</div>\s*</div>\s*</div>', new_image_upload_logic.strip() + '\n</div>\n</div>', content, flags=re.DOTALL)

# 5. Fix empty string parses in totalMarks and others
content = content.replace('sum + s.marks', 'sum + (parseInt(s.marks as any) || 0)')
content = content.replace('parseInt(q.marks)', '(parseInt(q.marks as any) || 0)')

with open('frontend/app/lecturer/assessments/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")