"use client"

import React, { createContext, useContext, useState } from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

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
  return <div className={cn("w-full border-b border-border/40", className)}>{children}</div>
}

function List({ ariaLabel, children, className }: { ariaLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-6 overflow-x-auto scrollbar-none", className)}
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
          "text-xs font-medium pb-3 pt-1.5 transition-colors relative focus-visible:outline-none",
          isActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
          className
        )}
      >
        {children}
      </button>
    </TabContext.Provider>
  )
}

function Indicator({ className }: { className?: string }) {
  const tabContext = useContext(TabContext)
  const tabsContext = useContext(TabsContext)
  if (!tabsContext) throw new Error("Tabs.Indicator must be used within Tabs")

  const isActive = tabContext ? tabContext.isActive : false
  if (!isActive) return null

  return (
    <motion.div
      layoutId="active-tab-indicator"
      className={cn("absolute bottom-0 left-0 right-0 h-0.5 bg-primary", className)}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    />
  )
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
