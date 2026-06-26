# Mindexa Platform — UI & Design System Guidelines

This document outlines the visual aesthetics, styling architecture, layouts, component conventions, and frontend safety practices to maintain styling consistency and UX quality across the Mindexa assessment platform. All AI agents and developers must strictly follow these rules when building or refactoring user interfaces.

---

## 1. Visual Aesthetics & Design System

Mindexa features a high-fidelity, premium academic dashboard experience. Avoid plain or standard styles.

### Core Visual Principles

- **Modern Typography**: Do not use browser defaults. Always utilize modern sans-serif typefaces (e.g., `Inter`, `Outfit`, or `Roboto`). Make use of tight tracking (`tracking-tight`) for headings and slightly wider tracking for uppercase subtitles.
- **Glassmorphism & Depth**: Utilize subtle borders, blur backdrops, and soft shadow systems:
  - Backdrop blur: `backdrop-blur-md bg-background/90`
  - Premium borders: `border border-border/50` or `border border-muted/20`
  - Shadow system: `shadow-sm` or `shadow-none` (prefer outline-based depth over heavy black shadows).
- **Curated Gradients**: Use smooth, subtle HSL gradients instead of generic solid colors. For example, background accents can use `bg-gradient-to-r from-primary/[0.03] to-transparent`.
  You are not allowed to use hardcoded Tailwind color classes like `bg-blue-100` or `text-red-500`. Always use semantic tokens (e.g., `bg-primary/[0.03]`, `text-destructive`) to ensure theme consistency and future-proofing.
  you are not allowed to use bolded fonts for body text. Reserve `font-bold` exclusively for critical alert highlights or key metric values that require emphasis.

---

## 2. Color System & Semantic Tokens

Never use hardcoded basic Tailwind colors (e.g. `bg-red-50`, `border-red-200`, `text-blue-600`). Always use semantic color tokens to support dark/light theme switching automatically.

### Color Conversions Reference

| Hardcoded Style      | Replacement Semantic Token   | Use Case                          |
| :------------------- | :--------------------------- | :-------------------------------- |
| `border-red-200`     | `border-destructive/20`      | Danger/Integrity warnings borders |
| `bg-red-50/50`       | `bg-destructive/[0.03]`      | Alert banner background           |
| `border-red-100`     | `border-destructive/10`      | Subtle divider inside warnings    |
| `text-red-600`       | `text-destructive`           | Alert subtitle text               |
| `text-red-700`       | `text-destructive`           | Alert header text                 |
| `text-red-800`       | `text-destructive font-bold` | Highlighted breach text           |
| `bg-white/60`        | `bg-background/60`           | Card row background overlays      |
| `border-emerald-200` | `border-success/20`          | Success banner/badges borders     |
| `bg-emerald-50`      | `bg-success/[0.03]`          | Success banner/badges backgrounds |
| `text-emerald-700`   | `text-success`               | Success text indicator            |

---

## 3. Responsive Layouts & Breakpoints

To prevent breaking layout presentations on standard 1024px student laptops or tablet screens:

- **Parent Grid Columns**: Use `lg:grid-cols-12` instead of `xl:grid-cols-12`.
- **Responsive Sizing**:
  - Standard main column width: `lg:col-span-7` (falls back to single column on tablet/mobile).
  - Secondary sidebar width: `lg:col-span-5` (or `md:flex` for narrow layouts like Matrix views).
- **Flex Layouts**: When stacking header rows with actions, always allow wrapping:
  - Header class: `flex flex-col sm:flex-row sm:items-center justify-between gap-3`

---

## 4. UI Component Conventions

Use Mindexa design tokens and custom component abstractions to keep styles clean.

### Metric Cards

- Metric cards should display primary values, percent deltas, and comparison parameters.
- Avoid cluttered option dropdowns. Replace unused drop actions with direct, explicit paths:
  ```tsx
  <Button
    variant="dim"
    size="sm"
    mode="icon"
    className="-me-1 opacity-40 hover:opacity-100 h-6 w-6"
    asChild
  >
    <Link href="/student/performance">
      <MoreHorizontal className="size-3" />
    </Link>
  </Button>
  ```

### Notifications & Alerts

- **Unread Badges**: Use rounded primary indicators to denote counts:
  ```tsx
  {
    unreadCount > 0 && (
      <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold">
        {unreadCount}
      </span>
    );
  }
  ```
- **Visually Weighted Alerts**: Critical alert rows (warnings, timeouts) must use left-hand structural highlights:
  - Standard class: `p-3 flex items-start gap-3 hover:bg-muted/10 transition-colors`
  - Critical/Warning accent class: `border-l-2 border-destructive bg-destructive/[0.02]`

---

## 5. Micro-Animations & Interactions

An interface that feels alive encourages user interaction. Implement subtle transitions for all hover states:

- **Hover effects**: Always add `transition-all` or `transition-colors` with a duration of `duration-200` or `duration-300`.
- **Pulsing States**: Use `animate-pulse` exclusively for active loading states, live sync indicators, or critical warnings that demand immediate focus.

---

## 6. Frontend Security & Code Quality Standards

### React 19 & Next.js App Router Rules

1. **Fetch Cancellation**: All async `useEffect` calls must implement `AbortController` hooks to clean up pending promises and prevent `setState` triggers on unmounted nodes:
   ```typescript
   useEffect(() => {
     const controller = new AbortController();
     async function fetchData() {
       try {
         const data = await api.getData();
         if (controller.signal.aborted) return;
         setData(data);
       } catch (err) {
         if (controller.signal.aborted) return;
         // Error logic
       }
     }
     fetchData();
     return () => controller.abort();
   }, [deps]);
   ```
2. **Crash-Safe Parsing**:
   - Always map/filter arrays with optional fallbacks (`(data.items ?? []).filter(...)`).
   - Use optional chaining (`?.`) when dereferencing properties on potentially null objects like fetched metadata.
3. **Role Guards**: Always apply immediate role guards at the top of protected workspace paths:
   ```typescript
   const { user } = useAuth();
   useEffect(() => {
     if (user && user.role !== "STUDENT") {
       window.location.replace("/lecturer/dashboard");
     }
   }, [user]);
   ```
4. **Memoize Complex Calculations**: Use `useMemo` for derived states like progress calculations, filtering due items, or grouping sections:
   ```typescript
   const progress = useMemo(
     () => (total > 0 ? (completed / total) * 100 : 0),
     [completed, total],
   );
   ```
5. **Robust Error Boundaries**: Wrap rendering modules in standard error boundary classes to capture rendering faults gracefully without crashing the shell context.
