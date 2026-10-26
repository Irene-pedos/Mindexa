"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface NumberFieldProps {
  value: number;
  /** Called with a clamped integer, when editing finishes (blur / Enter). */
  onCommit: (value: number) => void;
  min: number;
  max: number;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Integer input that can be cleared while typing. A plain controlled number input that falls
 * back to a default on every keystroke ("" -> 10) makes it impossible to delete the digits and
 * type a new value; this keeps the raw text locally and commits a clamped integer on blur.
 */
export function NumberField({ value, onCommit, min, max, id, className, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(String(value));

  // Follow the parent when the value changes from outside (new question, redraft...).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(text, 10);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setText(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={className}
      aria-label={rest["aria-label"]}
    />
  );
}
