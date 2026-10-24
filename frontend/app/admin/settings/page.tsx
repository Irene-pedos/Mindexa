"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Shield,
  Settings,
  Server,
  Bell,
  Save,
  Loader2,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Calendar,
  Layers,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { integrityApi } from "@/lib/api/integrity";
import { adminApi, type SystemSettings } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  IGNORE: "Ignore (No Action)",
  LOG_ONLY: "Log Only",
  WARNING: "Warning Prompt",
  WARNING_LOG: "Warning + Log",
  WARNING_AUTO_SUBMIT: "Warning → Auto Submit",
  AUTO_SUBMIT: "Immediate Auto Submit",
};

interface RuleCatalogItem {
  key: string;
  label: string;
  defaultCategory: "Non-Tolerated" | "Tolerated";
  defaultAction: string;
  allowedActions: string[];
  desc: string;
}

const INTEGRITY_RULES_CATALOG: RuleCatalogItem[] = [
  {
    key: "tab_switching",
    label: "Tab switching",
    defaultCategory: "Non-Tolerated",
    defaultAction: "WARNING_AUTO_SUBMIT",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"],
    desc: "Switching to another browser tab or background window during assessment",
  },
  {
    key: "window_minimize",
    label: "Window minimize",
    defaultCategory: "Non-Tolerated",
    defaultAction: "WARNING_AUTO_SUBMIT",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"],
    desc: "Minimizing or unfocusing the assessment browser window",
  },
  {
    key: "copy",
    label: "Copy content",
    defaultCategory: "Tolerated",
    defaultAction: "WARNING_LOG",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "AUTO_SUBMIT"],
    desc: "Attempting to copy question text or mathematical symbols",
  },
  {
    key: "paste",
    label: "Paste external content",
    defaultCategory: "Tolerated",
    defaultAction: "WARNING_LOG",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "AUTO_SUBMIT"],
    desc: "Attempting to paste external text into essay or response fields",
  },
  {
    key: "browser_zoom",
    label: "Browser zoom change",
    defaultCategory: "Tolerated",
    defaultAction: "LOG_ONLY",
    allowedActions: ["IGNORE", "LOG_ONLY", "WARNING"],
    desc: "Changing page zoom scale outside permitted reading boundaries",
  },
  {
    key: "fullscreen_exit",
    label: "Full-screen exit",
    defaultCategory: "Tolerated",
    defaultAction: "WARNING",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"],
    desc: "Exiting mandatory full-screen lockdown mode",
  },
  {
    key: "idle_long_period",
    label: "Extended idle duration",
    defaultCategory: "Tolerated",
    defaultAction: "WARNING_LOG",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "AUTO_SUBMIT"],
    desc: "Inactivity detected with no cursor, keyboard, or scroll events",
  },
  {
    key: "screen_blurring",
    label: "Screen blurring (Focus lost)",
    defaultCategory: "Tolerated",
    defaultAction: "WARNING_LOG",
    allowedActions: ["IGNORE", "WARNING", "WARNING_LOG"],
    desc: "Assessment window blurred when another app or overlay opens above it",
  },
  {
    key: "browser_refresh",
    label: "Browser refresh / Reload",
    defaultCategory: "Non-Tolerated",
    defaultAction: "AUTO_SUBMIT",
    allowedActions: ["WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"],
    desc: "Reloading or forcing page refresh during an active sitting",
  },
  {
    key: "closing_browser",
    label: "Closing browser",
    defaultCategory: "Non-Tolerated",
    defaultAction: "AUTO_SUBMIT",
    allowedActions: ["AUTO_SUBMIT"],
    desc: "Terminating the browser window or closing the assessment tab",
  },
  {
    key: "opening_another_device",
    label: "Concurrent device access",
    defaultCategory: "Non-Tolerated",
    defaultAction: "AUTO_SUBMIT",
    allowedActions: ["AUTO_SUBMIT"],
    desc: "Attempting concurrent access from a second computer, tablet, or phone",
  },
  {
    key: "multiple_sessions",
    label: "Multiple active sessions",
    defaultCategory: "Non-Tolerated",
    defaultAction: "AUTO_SUBMIT",
    allowedActions: ["AUTO_SUBMIT"],
    desc: "Multiple simultaneous logins detected for the candidate account",
  },
  {
    key: "unauthorized_sharing",
    label: "Screen sharing / Mirroring",
    defaultCategory: "Non-Tolerated",
    defaultAction: "AUTO_SUBMIT",
    allowedActions: ["AUTO_SUBMIT"],
    desc: "Attempting screen share, AirPlay, or unauthorized mirror link",
  },
  {
    key: "time_expired",
    label: "Session time expiration",
    defaultCategory: "Non-Tolerated",
    defaultAction: "AUTO_SUBMIT",
    allowedActions: ["AUTO_SUBMIT"],
    desc: "Assessment duration timer reaches zero with no extension granted",
  },
];

const SECTIONS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security & Integrity", icon: Shield },
  { id: "academic", label: "Academic Structure", icon: Globe },
  { id: "notifications", label: "Notifications & Alerts", icon: Bell },
  { id: "server", label: "System Diagnostics", icon: Server },
];

export default function AdminSystemSettings() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("general");

  const [settings, setSettings] = useState<SystemSettings>({
    platform_name: "Mindexa Academic OS",
    timezone: "UTC",
    maintenance_mode: false,
    enforce_fullscreen: true,
    ai_assistance_default: false,
    auto_flag_threshold: "3",
    default_duration: 90,
  });

  const [originalSettings, setOriginalSettings] = useState<SystemSettings | null>(null);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeProfileCode, setActiveProfileCode] = useState<string>("SECURE_ASSESSMENT");

  // Integrity rule filtering & search
  const [ruleSearch, setRuleSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "Non-Tolerated" | "Tolerated">("ALL");
  const [isRulesExpanded, setIsRulesExpanded] = useState(true);

  // Notification toggles
  const [notifications, setNotifications] = useState({
    instant_integrity_alerts: true,
    moderation_queue_alerts: true,
    maintenance_broadcasts: true,
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const [data, profRes] = await Promise.all([
          adminApi.getSystemSettings().catch(() => null),
          integrityApi.getProfiles().catch(() => ({ items: [] })),
        ]);
        if (data) {
          setSettings(data);
          setOriginalSettings(data);
        }
        if (profRes && profRes.items) setProfiles(profRes.items);
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadSettings();
  }, []);

  const currentProfile = profiles.find((p) => p.code === activeProfileCode) || profiles[0];

  const updateCurrentProfileField = (field: string, val: any) => {
    if (!currentProfile) return;
    setProfiles((prev) =>
      prev.map((p) => (p.code === currentProfile.code ? { ...p, [field]: val } : p)),
    );
  };

  const updateRuleAction = (ruleKey: string, newAction: string) => {
    if (!currentProfile) return;
    const ruleObj = INTEGRITY_RULES_CATALOG.find((r) => r.key === ruleKey);
    const existingRule = currentProfile.rules_json?.[ruleKey] || {
      category: ruleObj?.defaultCategory || "Non-Tolerated",
    };

    const newRulesJson = {
      ...(currentProfile.rules_json || {}),
      [ruleKey]: {
        ...existingRule,
        action: newAction,
      },
    };

    updateCurrentProfileField("rules_json", newRulesJson);
  };

  const isDirty = useMemo(() => {
    if (!originalSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  }, [settings, originalSettings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await adminApi.updateSystemSettings(settings);
      setOriginalSettings(settings);
      if (currentProfile && currentProfile.id) {
        await integrityApi.updateProfile(currentProfile.id, {
          allow_resume: currentProfile.allow_resume,
          rules_json: currentProfile.rules_json,
        });
      }
      toast.success("Platform configurations and integrity profiles updated successfully.");
    } catch (err) {
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const filteredRules = useMemo(() => {
    return INTEGRITY_RULES_CATALOG.filter((rule) => {
      const currentRuleConfig = currentProfile?.rules_json?.[rule.key] || {
        category: rule.defaultCategory,
      };
      const matchesSearch =
        rule.label.toLowerCase().includes(ruleSearch.toLowerCase()) ||
        rule.desc.toLowerCase().includes(ruleSearch.toLowerCase());
      const matchesCategory =
        categoryFilter === "ALL" || currentRuleConfig.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [currentProfile, ruleSearch, categoryFilter]);

  if (initialLoading) {
    return (
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-lg" />
            <Skeleton className="h-4 w-72 rounded-lg opacity-60" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
          <div className="md:col-span-3 space-y-5">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Settings className="size-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Platform & System Settings
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Centralized institutional governance, academic configuration, and integrity enforcement profiles.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isDirty && (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold"
            >
              Unsaved changes
            </Badge>
          )}
          <Button
            size="sm"
            className="h-8 px-4 text-xs font-semibold rounded-lg shadow-xs"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" /> Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Grid: Responsive Nav + Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Navigation / Sections */}
        <div className="md:col-span-1">
          {/* Mobile Horizontal Navigation Tabs */}
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shrink-0 cursor-pointer shadow-xs",
                  activeSection === item.id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/70 bg-card hover:bg-muted/70 text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Desktop Sticky Vertical Menu */}
          <div className="hidden md:flex flex-col space-y-1 sticky top-20">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 pb-1">
              Settings Sections
            </span>
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left cursor-pointer",
                  activeSection === item.id
                    ? "bg-primary/10 text-primary font-bold dark:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 space-y-5">
          {/* 1. General Configuration */}
          <Card
            id="general"
            className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden scroll-mt-20"
          >
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold text-foreground">
                  General Platform Configuration
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Base branding, operational timezone, and institutional accessibility.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Platform Display Name
                  </Label>
                  <Input
                    value={settings.platform_name}
                    onChange={(e) =>
                      setSettings({ ...settings, platform_name: e.target.value })
                    }
                    className="h-8.5 text-xs font-medium"
                    placeholder="e.g. Mindexa Academic OS"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Default Institutional Timezone
                  </Label>
                  <Select
                    value={settings.timezone}
                    onValueChange={(v) =>
                      setSettings({ ...settings, timezone: v })
                    }
                  >
                    <SelectTrigger className="h-8.5 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC" className="text-xs">
                        Coordinated Universal Time (UTC)
                      </SelectItem>
                      <SelectItem value="GMT+2" className="text-xs">
                        Central Africa Time (CAT / GMT+2)
                      </SelectItem>
                      <SelectItem value="GMT+3" className="text-xs">
                        East Africa Time (EAT / GMT+3)
                      </SelectItem>
                      <SelectItem value="EST" className="text-xs">
                        Eastern Standard Time (EST / GMT-5)
                      </SelectItem>
                      <SelectItem value="PST" className="text-xs">
                        Pacific Standard Time (PST / GMT-8)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-foreground">
                    Default Assessment Duration
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      max={480}
                      value={settings.default_duration}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          default_duration: parseInt(e.target.value, 10) || 60,
                        })
                      }
                      className="h-8.5 text-xs font-bold w-28"
                    />
                    <span className="text-xs text-muted-foreground">minutes (standard session length)</span>
                  </div>
                </div>
              </div>

              {/* Maintenance Mode */}
              <div className="rounded-xl border border-border/70 p-3.5 sm:p-4 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground">
                      Platform Maintenance Mode
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Temporarily lock student assessment sessions during scheduled system updates.
                    </div>
                  </div>
                  <Switch
                    checked={settings.maintenance_mode}
                    onCheckedChange={(v) =>
                      setSettings({ ...settings, maintenance_mode: v })
                    }
                  />
                </div>

                {settings.maintenance_mode && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>
                      Maintenance mode is active. Candidates sitting exams will be notified and prevented from launching new attempts.
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2. Security & Institutional Integrity Profiles */}
          <Card
            id="security"
            className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden scroll-mt-20"
          >
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold text-foreground">
                  Security & Institutional Integrity Profiles
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Govern full-screen lockdowns, proctoring heuristics, and assessment behavior policies.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-5">
              {/* Global Switches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-xs font-bold text-foreground">
                      Enforce Global Fullscreen
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Mandatory viewport lockdown on summative exams
                    </div>
                  </div>
                  <Switch
                    checked={settings.enforce_fullscreen}
                    onCheckedChange={(v) =>
                      setSettings({ ...settings, enforce_fullscreen: v })
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-xs font-bold text-foreground">
                      AI Assistant Governance
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Enable AI formative study support by default
                    </div>
                  </div>
                  <Switch
                    checked={settings.ai_assistance_default}
                    onCheckedChange={(v) =>
                      setSettings({ ...settings, ai_assistance_default: v })
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card sm:col-span-2">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-xs font-bold text-foreground">
                      Auto-Flag Incident Threshold
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Number of tolerated infractions before automated escalation to proctors
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={settings.auto_flag_threshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          auto_flag_threshold: e.target.value,
                        })
                      }
                      className="h-7.5 w-16 text-xs font-bold text-center"
                    />
                    <span className="text-[11px] text-muted-foreground">events</span>
                  </div>
                </div>
              </div>

              {/* Profiles Manager */}
              <div className="border-t border-border/60 pt-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Institutional Integrity Profile
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Configure automated proctoring reactions applied across published assessments.
                    </p>
                  </div>
                  <Select
                    value={activeProfileCode}
                    onValueChange={(code) => setActiveProfileCode(code)}
                  >
                    <SelectTrigger className="w-full sm:w-64 h-8 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECURE_ASSESSMENT" className="text-xs">
                        Secure Assessment Profile (High Stakes)
                      </SelectItem>
                      <SelectItem value="HOMEWORK" className="text-xs">
                        Homework & Continuous Tasks
                      </SelectItem>
                      <SelectItem value="PRACTICE" className="text-xs">
                        Open Practice Profile (Relaxed)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {currentProfile && (
                  <div className="rounded-xl border border-border/80 bg-muted/15 p-3.5 sm:p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-foreground">
                            {currentProfile.name}
                          </h4>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">
                            {currentProfile.code}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {currentProfile.description || "Proctoring heuristics and reaction policy"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto bg-card border border-border/80 px-3 py-1.5 rounded-lg shadow-xs">
                        <Label className="text-xs font-semibold text-foreground whitespace-nowrap cursor-pointer">
                          Allow Student Resume:
                        </Label>
                        <Switch
                          checked={currentProfile.allow_resume}
                          onCheckedChange={(v) =>
                            updateCurrentProfileField("allow_resume", v)
                          }
                        />
                      </div>
                    </div>

                    {/* Search & Filter Toolbar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search rule or action..."
                          value={ruleSearch}
                          onChange={(e) => setRuleSearch(e.target.value)}
                          className="h-8 pl-8 pr-3 text-xs bg-background"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex rounded-lg bg-muted/60 p-0.5 border border-border/40">
                          {(["ALL", "Non-Tolerated", "Tolerated"] as const).map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setCategoryFilter(cat)}
                              className={cn(
                                "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer",
                                categoryFilter === cat
                                  ? "bg-background text-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {cat === "ALL" ? "All Rules (14)" : cat}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsRulesExpanded((prev) => !prev)}
                          className="size-8 rounded-lg border border-border/60 hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
                          title={isRulesExpanded ? "Collapse rules table" : "Expand rules table"}
                        >
                          {isRulesExpanded ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Rules Table */}
                    {isRulesExpanded && (
                      <div className="overflow-x-auto rounded-xl border border-border/70 bg-background shadow-xs">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                            <tr>
                              <th className="py-2.5 px-3.5">Integrity Trigger & Scenario</th>
                              <th className="py-2.5 px-3">Category</th>
                              <th className="py-2.5 px-3.5 text-right sm:text-left">Enforced Reaction</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 text-[11px]">
                            {filteredRules.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-xs text-muted-foreground">
                                  No rules match your filter criteria.
                                </td>
                              </tr>
                            ) : (
                              filteredRules.map((rule) => {
                                const currentRuleConfig = currentProfile.rules_json?.[rule.key] || {
                                  category: rule.defaultCategory,
                                  action: rule.defaultAction,
                                };
                                const isNonTolerated = currentRuleConfig.category === "Non-Tolerated";

                                return (
                                  <tr key={rule.key} className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2.5 px-3.5">
                                      <div className="font-semibold text-foreground">{rule.label}</div>
                                      <div className="text-[10px] text-muted-foreground line-clamp-1">{rule.desc}</div>
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span
                                        className={cn(
                                          "inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border",
                                          isNonTolerated
                                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
                                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
                                        )}
                                      >
                                        {currentRuleConfig.category}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3.5">
                                      <div className="flex justify-end sm:justify-start">
                                        <Select
                                          value={currentRuleConfig.action}
                                          onValueChange={(newAction) =>
                                            updateRuleAction(rule.key, newAction)
                                          }
                                        >
                                          <SelectTrigger className="h-7.5 text-[11px] font-semibold w-40 sm:w-48 bg-card">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {rule.allowedActions.map((act) => (
                                              <SelectItem key={act} value={act} className="text-xs">
                                                {ACTION_LABELS[act] || act}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 3. Academic Structure Navigation */}
          <Card
            id="academic"
            className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden scroll-mt-20"
          >
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold text-foreground">
                  Academic Structure & Assignments
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Manage institutional faculties, departments, academic semesters, and teaching duty allocations.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link
                  href="/admin/academic/structure"
                  className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 hover:border-primary/60 bg-muted/10 hover:bg-primary/[0.03] transition-all shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Layers className="size-4" />
                    </div>
                    <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                      Faculties & Departments
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Hierarchical academic branches
                    </p>
                  </div>
                  <div className="flex items-center text-[11px] font-semibold text-primary pt-3">
                    Configure <ArrowRight className="size-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>

                <Link
                  href="/admin/academic/periods"
                  className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 hover:border-primary/60 bg-muted/10 hover:bg-primary/[0.03] transition-all shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Calendar className="size-4" />
                    </div>
                    <p className="text-xs font-bold text-foreground group-hover:text-emerald-600 transition-colors">
                      Academic Semesters
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Terms, intake years & periods
                    </p>
                  </div>
                  <div className="flex items-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-3">
                    View Periods <ArrowRight className="size-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>

                <Link
                  href="/admin/academic/assignments"
                  className="group flex flex-col justify-between p-3.5 rounded-xl border border-border/70 hover:border-primary/60 bg-muted/10 hover:bg-primary/[0.03] transition-all shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Globe className="size-4" />
                    </div>
                    <p className="text-xs font-bold text-foreground group-hover:text-indigo-600 transition-colors">
                      Teaching Assignments
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Staff course & exam duties
                    </p>
                  </div>
                  <div className="flex items-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 pt-3">
                    Manage Duties <ArrowRight className="size-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* 4. Notifications & Alerts Configuration */}
          <Card
            id="notifications"
            className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden scroll-mt-20"
          >
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold text-foreground">
                  Notifications & Incident Alerts
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Set up automated dispatch thresholds for academic infractions and moderation events.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className="text-xs font-bold text-foreground">
                    Instant Candidate Integrity Alerts
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Notify active invigilators and exam officers when non-tolerated infractions occur
                  </p>
                </div>
                <Switch
                  checked={notifications.instant_integrity_alerts}
                  onCheckedChange={(v) =>
                    setNotifications((prev) => ({ ...prev, instant_integrity_alerts: v }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className="text-xs font-bold text-foreground">
                    Moderation Queue Escalations
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Alert departmental moderators when assessments are submitted for compliance review
                  </p>
                </div>
                <Switch
                  checked={notifications.moderation_queue_alerts}
                  onCheckedChange={(v) =>
                    setNotifications((prev) => ({ ...prev, moderation_queue_alerts: v }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className="text-xs font-bold text-foreground">
                    Maintenance & Platform Broadcasts
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Send email notifications to all registered faculty before scheduled maintenance
                  </p>
                </div>
                <Switch
                  checked={notifications.maintenance_broadcasts}
                  onCheckedChange={(v) =>
                    setNotifications((prev) => ({ ...prev, maintenance_broadcasts: v }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* 5. System Diagnostics & Infrastructure */}
          <Card
            id="server"
            className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden scroll-mt-20"
          >
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <Server className="size-4 text-primary" />
                <CardTitle className="text-sm font-bold text-foreground">
                  System Diagnostics & Infrastructure
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Runtime health of AI reasoning models, background brokers, and database layers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-border/70 bg-muted/15 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Database Layer
                    </span>
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Database className="size-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">PostgreSQL 16 + pgvector</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Connected & schema synced</p>
                </div>

                <div className="p-3 rounded-xl border border-border/70 bg-muted/15 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Task Broker
                    </span>
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Cpu className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-foreground">Celery + Redis 7</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Workers active and consuming</p>
                </div>

                <div className="p-3 rounded-xl border border-border/70 bg-muted/15 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      AI Gateway
                    </span>
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Shield className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-foreground">LangChain / OpenAI</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Multi-tier model fallback active</p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Full-Width Sticky Bottom Action Bar inside the main content container */}
      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3.5 border-t border-border/80 bg-background/95 backdrop-blur-md z-20 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs text-muted-foreground self-start sm:self-auto">
          {isDirty ? (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-semibold"
            >
              Unsaved changes
            </Badge>
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> All settings synchronized.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (originalSettings) setSettings(originalSettings);
              toast.info("Changes reverted to previously saved state.");
            }}
            disabled={!isDirty || loading}
            className="h-8 px-4 text-xs font-semibold rounded-lg"
          >
            <RotateCcw className="mr-1.5 size-3.5" /> Discard
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-8 px-5 text-xs font-semibold rounded-lg shadow-xs"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" /> Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
