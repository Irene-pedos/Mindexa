# Mindexa Frontend - Project Instructions

Welcome to the Mindexa Frontend project. This document provides essential context and instructions for AI agents and developers working on this codebase.

## Project Overview

Mindexa is a secure academic integrity platform designed to provide ultra-secure academic assessment systems with explainable AI grading and real-time integrity monitoring.

- **Main Technologies:** Next.js (App Router), React 19, TypeScript, Tailwind CSS 4.
- **UI Framework:** Shadcn UI (Radix UI) and Framer Motion for animations.
- **Architecture:** Role-based routing (`admin`, `lecturer`, `student`) with a centralized API client layer.

## Building and Running

### Development
```bash
npm run dev
```
Starts the development server on `http://localhost:3000`.

### Production
```bash
npm run build
npm run start
```

### Linting
```bash
npm run lint
```

## Project Structure

- `app/`: Next.js App Router pages.
  - `admin/`: Admin-specific dashboards and settings.
  - `lecturer/`: Tools for assessment creation, grading, and ai-assistance.
  - `student/`: Student dashboard, courses, and assessment interfaces.
  - `(auth)`: Login, signup, and password recovery flows.
- `components/`:
  - `ui/`: Shared Shadcn UI components.
  - `mindexa/`: Domain-specific components (e.g., `integrity-notice`, `academic-planner`).
  - `providers/`: Context providers (Auth, Theme).
- `lib/`:
  - `api/`: API client and endpoint-specific services (`auth.ts`, `student.ts`, etc.).
  - `validation.ts`: Centralized validation logic for forms.
  - `utils.ts`: Tailwind merge and other utility functions.
- `hooks/`: Custom React hooks (e.g., `use-auth`).

## Development Conventions

### 1. Type Safety
- Always use TypeScript for new files.
- Define interfaces for API responses and component props in their respective files or a shared `types` folder if it grows.

### 2. API Communication
- Use `apiClient` from `@/lib/api/client` for all backend requests.
- It handles JWT injection, 401 token refreshing, and standard error handling.
- Base URL is configured via `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000/api/v1`).

### 3. Styling
- Use Tailwind CSS 4 utility classes.
- Follow the existing design system which prioritizes a clean, academic look (light mode by default).
- For animations, use `framer-motion` or the `motion` library.

### 4. Authentication & Authorization
- Auth state is managed by `AuthProvider` (`@/components/providers/auth-provider`).
- Role-based access is enforced via `RoleGuard` in `app/layout.tsx`.
- Protected routes are grouped by role in the `app/` directory.

### 5. Form Validation
- Prefer using the validation logic in `lib/validation.ts` or `zod` for complex forms.
- Ensure all user inputs are validated client-side before submission.

## Key Files to Reference

- `AUTHENTICATION_SETUP.md`: Detailed summary of the auth implementation.
- `lib/api/client.ts`: The core fetch wrapper.
- `app/layout.tsx`: Root layout with providers and global styles.
- `tailwind.config.ts`: Tailwind theme and plugin configuration.
