// components/mindexa/layout/mindexa-logo.tsx
import Image from "next/image"

export function MindexaLogo() {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <div className="relative h-10 w-32 flex-shrink-9">
        <Image
          src="/icons/logo/mindexa-logo.svg"
          alt="Mindexa Logo"
          fill
          className="object-contain"
          priority
        />
      </div>
    </div>
  )
}