// frontend/components/ui/typography.tsx
"use client"

import * as React from "react";

export function TypographyH1({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={`scroll-m-20 text-2xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-balance ${className}`}
      {...props}
    />
  );
}

export function TypographyH2({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`scroll-m-20 text-xl md:text-5xl font-semibold tracking-tight first:mt-0 ${className}`}
      {...props}
    />
  );
}

export function TypographyH3({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`scroll-m-20 text-l md:text-3xl font-medium tracking-tight leading-tight ${className}`}
      {...props}
    />
  );
}

export function TypographyH4({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h4
      className={`scroll-m-20 text-m font-semibold tracking-tight ${className}`}
      {...props}
    />
  );
}

export function TypographyP({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`leading-7 [&:not(:first-child)]:mt-4 ${className}`}
      {...props}
    />
  );
}

export function TypographyBlockquote({
  className,
  ...props
}: React.HTMLAttributes<HTMLQuoteElement>) {
  return (
    <blockquote
      className={`mt-6 border-l-2 pl-6 italic ${className}`}
      {...props}
    />
  );
}

export function TypographyList({
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={`my-6 ml-6 list-disc [&>li]:mt-2 ${className}`} {...props} />
  );
}

export function TypographyLead({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-muted-foreground text-xl ${className}`} {...props} />
  );
}

export function TypographyLarge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-lg font-semibold ${className}`} {...props} />;
}

export function TypographySmall({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <small
      className={`text-sm leading-none font-medium ${className}`}
      {...props}
    />
  );
}

export function TypographyMuted({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-muted-foreground text-sm ${className}`} {...props} />
  );
}