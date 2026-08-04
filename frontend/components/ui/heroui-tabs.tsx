"use client"

import React, { createContext, useContext, useState } from "react"
import { cn } from "@/lib/utils"

interface TabsContextType {
  activeTab: string
  setActiveTab: (id: string) => void
}

const TabsContext = createContext<TabsContextType | undefined>(undefined)

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  const [localActive, setLocalActive] = useState(defaultValue || "")
  const activeTab = value !== undefined ? value : localActive
  
  const setActiveTab = (val: string) => {
    setLocalActive(val)
    if (onValueChange) onValueChange(val)
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function ListContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("w-full border-none py-1", className)}>{children}</div>
}

function List({ ariaLabel, children, className }: { ariaLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-2 p-1 bg-muted/30 rounded-xl w-fit items-center flex-wrap overflow-x-auto scrollbar-none", className)}
    >
      {children}
    </div>
  )
}

const TabContext = createContext<{ isActive: boolean } | undefined>(undefined)

function Tab({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  if (!context) throw new Error("Tabs.Tab must be used within Tabs")
  
  const { activeTab, setActiveTab } = context
  const isActive = activeTab === id

  return (
    <TabContext.Provider value={{ isActive }}>
      <button
        role="tab"
        aria-selected={isActive}
        onClick={() => setActiveTab(id)}
        className={cn(
          "text-xs font-semibold px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 text-center focus-visible:outline-none",
          isActive
            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          className
        )}
      >
        {children}
      </button>
    </TabContext.Provider>
  )
}

function Indicator() {
  return null
}

function Panel({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  if (!context) throw new Error("Tabs.Panel must be used within Tabs")
  
  const { activeTab } = context

  if (activeTab !== id) return null

  return (
    <div
      role="tabpanel"
      className={cn("animate-in fade-in duration-200", className)}
    >
      {children}
    </div>
  )
}

Tabs.ListContainer = ListContainer
Tabs.List = List
Tabs.Tab = Tab
Tabs.Indicator = Indicator
Tabs.Panel = Panel

export default Tabs
