"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { integrityApi } from "@/lib/api/integrity";
import { adminApi } from "@/lib/api/admin";
import { Skeleton } from "@/components/ui/skeleton";

const ACTION_LABELS: Record<string, string> = {
  IGNORE: "Ignore",
  LOG_ONLY: "Log only",
  WARNING: "Warning",
  WARNING_LOG: "Warning + Log",
  WARNING_AUTO_SUBMIT: "Warning → Auto Submit",
  AUTO_SUBMIT: "Auto Submit",
};

const INTEGRITY_RULES_CATALOG = [
  { key: "tab_switching", label: "Tab switching", defaultCategory: "Non-Tolerated", defaultAction: "WARNING_AUTO_SUBMIT", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"], desc: "Switching to another browser tab or window" },
  { key: "window_minimize", label: "Window minimize", defaultCategory: "Non-Tolerated", defaultAction: "WARNING_AUTO_SUBMIT", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"], desc: "Minimizing the assessment browser window" },
  { key: "copy", label: "Copy", defaultCategory: "Tolerated", defaultAction: "WARNING_LOG", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "AUTO_SUBMIT"], desc: "Attempting to copy question text or content" },
  { key: "paste", label: "Paste", defaultCategory: "Tolerated", defaultAction: "WARNING_LOG", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "AUTO_SUBMIT"], desc: "Attempting to paste external text into response fields" },
  { key: "browser_zoom", label: "Browser zoom", defaultCategory: "Tolerated", defaultAction: "LOG_ONLY", allowedActions: ["IGNORE", "LOG_ONLY", "WARNING"], desc: "Changing page zoom scale in browser" },
  { key: "fullscreen_exit", label: "Full-screen exit", defaultCategory: "Tolerated", defaultAction: "WARNING", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"], desc: "Exiting mandatory full-screen mode" },
  { key: "idle_long_period", label: "Idle for long period", defaultCategory: "Tolerated", defaultAction: "WARNING_LOG", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG", "AUTO_SUBMIT"], desc: "Inactivity detected for extended duration" },
  { key: "screen_blurring", label: "Screen blurring (Focus lost)", defaultCategory: "Tolerated", defaultAction: "WARNING_LOG", allowedActions: ["IGNORE", "WARNING", "WARNING_LOG"], desc: "Assessment blurred when another task or app runs above it" },
  { key: "browser_refresh", label: "Browser refresh", defaultCategory: "Non-Tolerated", defaultAction: "AUTO_SUBMIT", allowedActions: ["WARNING_AUTO_SUBMIT", "AUTO_SUBMIT"], desc: "Reloading or refreshing the page mid-assessment" },
  { key: "closing_browser", label: "Closing browser", defaultCategory: "Non-Tolerated", defaultAction: "AUTO_SUBMIT", allowedActions: ["AUTO_SUBMIT"], desc: "Closing the browser or active tab" },
  { key: "opening_another_device", label: "Opening assessment in another device", defaultCategory: "Non-Tolerated", defaultAction: "AUTO_SUBMIT", allowedActions: ["AUTO_SUBMIT"], desc: "Attempting concurrent access on a second device" },
  { key: "multiple_sessions", label: "Multiple simultaneous sessions", defaultCategory: "Non-Tolerated", defaultAction: "AUTO_SUBMIT", allowedActions: ["AUTO_SUBMIT"], desc: "Multiple active sessions detected for student account" },
  { key: "unauthorized_sharing", label: "Unauthorized assessment sharing", defaultCategory: "Non-Tolerated", defaultAction: "AUTO_SUBMIT", allowedActions: ["AUTO_SUBMIT"], desc: "Attempting screen share or unauthorized mirror link" },
  { key: "time_expired", label: "Time expired", defaultCategory: "Non-Tolerated", defaultAction: "AUTO_SUBMIT", allowedActions: ["AUTO_SUBMIT"], desc: "Assessment duration timer reaches zero" },
];

export default function AdminSystemSettings() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [settings, setSettings] = useState({
    platform_name: "Mindexa Academic OS",
    timezone: "UTC",
    maintenance_mode: false,
    enforce_fullscreen: true,
    ai_assistance_default: false,
    auto_flag_threshold: "3",
    default_duration: 90,
  });

  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeProfileCode, setActiveProfileCode] = useState<string>("SECURE_ASSESSMENT");

  useEffect(() => {
    async function loadSettings() {
      try {
        const [data, profRes] = await Promise.all([
          adminApi.getSystemSettings().catch(() => null),
          integrityApi.getProfiles().catch(() => ({ items: [] })),
        ]);
        if (data) setSettings(data);
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
      prev.map((p) => (p.code === currentProfile.code ? { ...p, [field]: val } : p))
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

  const handleSave = async () => {
    setLoading(true);
    try {
      await adminApi.updateSystemSettings(settings);
      if (currentProfile && currentProfile.id) {
        await integrityApi.updateProfile(currentProfile.id, {
          allow_resume: currentProfile.allow_resume,
          rules_json: currentProfile.rules_json,
        });
      }
      toast.success("System & Integrity configurations updated successfully");
    } catch (err) {
      toast.error("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (initialLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-md" />
            <Skeleton className="h-4 w-96 rounded-md opacity-60" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            System Settings
          </h1>
          <p className="text-muted-foreground text-sm">
            Platform-wide institutional configuration
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-lg px-4 h-9"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? (
            "Processing..."
          ) : (
            <>
              <Save className="mr-2 size-3.5" /> Save Changes
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Navigation / Sections (Sidebar style in desktop) */}
        <div className="md:col-span-1 space-y-1 sticky top-20 h-fit">
          {[
            { id: "general", label: "General Settings", icon: Settings },
            { id: "security", label: "Security & Integrity", icon: Shield },
            { id: "academic", label: "Academic Structure", icon: Globe },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "server", label: "Platform & API", icon: Server },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="md:col-span-2 space-y-6 pb-20">
          <Card id="general" className="border shadow-none scroll-mt-20">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                General Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                  Platform Display Name
                </Label>
                <Input
                  value={settings.platform_name}
                  onChange={(e) =>
                    setSettings({ ...settings, platform_name: e.target.value })
                  }
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5 pt-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                  Default Timezone
                </Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(v) =>
                    setSettings({ ...settings, timezone: v })
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">
                      Coordinated Universal Time (UTC)
                    </SelectItem>
                    <SelectItem value="GMT+2">
                      Central African Time (GMT+2)
                    </SelectItem>
                    <SelectItem value="EST">
                      Eastern Standard Time (EST)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">Maintenance Mode</div>
                  <div className="text-[10px] text-muted-foreground">
                    Temporarily disable student access
                  </div>
                </div>
                <Switch
                  checked={settings.maintenance_mode}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, maintenance_mode: v })
                  }
                  className="scale-75"
                />
              </div>
            </CardContent>
          </Card>

          <Card id="security" className="border shadow-none scroll-mt-20">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Security & Institutional Integrity Profiles
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">
                    Enforce Global Fullscreen
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Mandatory for all summative exams
                  </div>
                </div>
                <Switch
                  checked={settings.enforce_fullscreen}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, enforce_fullscreen: v })
                  }
                  className="scale-75"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">
                    AI Assistant Governance
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Enable student study support by default
                  </div>
                </div>
                <Switch
                  checked={settings.ai_assistance_default}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, ai_assistance_default: v })
                  }
                  className="scale-75"
                />
              </div>

              {/* Institutional Profiles Configuration Manager */}
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Institutional Integrity Profiles
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Centrally configure integrity rules applied when lecturers publish assessments
                    </p>
                  </div>
                  <Select
                    value={activeProfileCode}
                    onValueChange={(code) => setActiveProfileCode(code)}
                  >
                    <SelectTrigger className="w-56 h-8 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SECURE_ASSESSMENT">
                        Secure Assessment Profile (CAT/Formative/Summative)
                      </SelectItem>
                      <SelectItem value="HOMEWORK">Homework Profile</SelectItem>
                      <SelectItem value="PRACTICE">Practice Profile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Selected Profile Settings */}
                {currentProfile && (
                  <div className="p-4 border rounded-xl bg-muted/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{currentProfile.name}</h4>
                        <p className="text-[11px] text-muted-foreground">{currentProfile.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-semibold">Allow Student Resume:</Label>
                        <Switch
                          checked={currentProfile.allow_resume}
                          onCheckedChange={(v) =>
                            updateCurrentProfileField("allow_resume", v)
                          }
                          className="scale-75"
                        />
                      </div>
                    </div>

                    {/* Integrity Rules Table */}
                    <div className="border rounded-lg overflow-hidden bg-background">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                          <tr>
                            <th className="py-2.5 px-3">Integrity Rule</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Enforced Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-[11px]">
                          {INTEGRITY_RULES_CATALOG.map((rule) => {
                            const currentRuleConfig = currentProfile.rules_json?.[rule.key] || {
                              category: rule.defaultCategory,
                              action: rule.defaultAction,
                            };
                            return (
                              <tr key={rule.key} className="hover:bg-muted/20">
                                <td className="py-2 px-3">
                                  <div className="font-semibold text-foreground">{rule.label}</div>
                                  <div className="text-[10px] text-muted-foreground">{rule.desc}</div>
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                                      currentRuleConfig.category === "Non-Tolerated"
                                        ? "bg-red-50 text-red-700 border border-red-200"
                                        : "bg-amber-50 text-amber-700 border border-amber-200"
                                    }`}
                                  >
                                    {currentRuleConfig.category}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  <Select
                                    value={currentRuleConfig.action}
                                    onValueChange={(newAction) =>
                                      updateRuleAction(rule.key, newAction)
                                    }
                                  >
                                    <SelectTrigger className="h-7 text-[10px] font-semibold w-48">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {rule.allowedActions.map((act) => (
                                        <SelectItem key={act} value={act} className="text-[10px]">
                                          {ACTION_LABELS[act] || act}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card id="academic" className="border shadow-none scroll-mt-20">
            <CardHeader className="py-3 px-4 border-b h-12 flex justify-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Academic & Institutional
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-[13px] text-muted-foreground">
              <p>
                Configure institutional hierarchy, departments, and semesters.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-bold"
              >
                Manage Academic Structure <ArrowRight className="size-3 ml-2" />
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" className="h-8 text-xs px-4">
              Discard
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs px-6"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Processing..." : "Save Config"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
