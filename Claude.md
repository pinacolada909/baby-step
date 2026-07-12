# BabyOS - Product Requirements Document (PRD)

## 1. Executive Summary

**Product Name:** BabyOS (nav bar + page title; the repo, GitHub org, and one leftover string in `AuthModal.tsx` still say "BabyStep" — that's a rename left half-done, not two products. See [Known Issues](#known-issues--inconsistencies).)

**Tagline:** "Navigate Early Parenthood with Confidence"

**Overview:** BabyOS is a bilingual web application that helps new parents track a newborn's sleep, feeding, diapers, pumping/milk stash, and growth, while coordinating caregiving workload and postpartum recovery across multiple caregivers.

**Target Users:** First-time parents and caregivers of newborns (0-3 months), including multi-caregiver households (e.g., two parents + grandparent/nanny).

**Platform:** Single-page web app — React + Vite (not Next.js), deployed on Vercel.

**Languages Supported:** English and Chinese (Simplified), fully parallel translation files.

---

## 2. Product Vision & Goals

### Primary Goals
- Reduce new parent anxiety and cognitive load by making tracking fast (including hands-free voice entry)
- Enable data-driven insights into baby's patterns (sleep, feeding, diapers, growth)
- Facilitate multi-caregiver coordination to prevent caregiver burnout, including postpartum recovery time for the recovering parent
- Provide a seamless, bilingual experience for diverse users

### Success Metrics
- User engagement with tracking features (including voice input adoption)
- Multi-caregiver adoption rate (invite redemption rate)
- Workload balance across caregivers (Activity Dashboard usage)
- Data synchronization reliability across caregivers

---

## 3. Features Overview

### 3.1 Navigation & Core Structure

| Route | Feature | Icon |
|-------|---------|------|
| `/` | Home | Home |
| `/diaper-tracker` | Diaper Tracker | Baby |
| `/feeding-tracker` | Feeding Tracker | UtensilsCrossed |
| `/pumping-tracker` | Pumping Tracker | Droplets |
| `/sleep-tracker` | Sleep Tracker | Moon |
| `/growth` | Growth Tracker | Ruler |
| `/time-management` | Activity Dashboard | Clock |
| `/questions` | Q&A Center | HelpCircle |
| `/join` | Join Baby (invite link landing, no nav entry) | — |
| `/settings` | Settings (via user menu, no nav entry) | Settings |

### 3.2 Feature Details

#### Home Page
- Hero section with value proposition
- Statistics row (translation-driven, not hardcoded copy)
- Feature cards linking to each major section
- `TrackerSummaryCards`, `BabyStatusCard`, `CurrentShiftCard`, `RecentTimeline` — at-a-glance dashboard of recent activity

#### Q&A Center
**Purpose:** Provide immediate answers to common newborn care questions

**Components:**
- **Static FAQ only** — there is no AI/chat assistant in the current codebase. (An earlier PRD draft described a Gemini-powered chat; that never shipped or was removed — no `parenting-chat` edge function exists.)
- **FAQ Database:** 19 pre-defined questions across 6 categories: Feeding, Sleep, Health, Development, Safety, Emotional (`src/data/faq.ts`)
- **Search & Filter:** Real-time filtering by category and text search

#### Sleep Tracker
**Purpose:** Log and analyze baby's sleep patterns

**Features:**
- Log sleep sessions with start/end times, voice input support
- Automatic duration calculation (handles overnight sleep)
- Today's total sleep summary, sleep history with delete
- Analytics chart: daily sleep hours, week/month toggle, 14h reference line
- Realtime sync across caregivers

#### Diaper Tracker
**Purpose:** Track diaper changes and monitor baby's health patterns

**Features:**
- Log changes with time and status (Wet, Dirty, Mixed, Dry), voice input support
- Today's summary with breakdown by type, color-coded indicators
- Change history with delete functionality
- Realtime sync across caregivers

#### Feeding Tracker
**Purpose:** Log feedings and track intake patterns

**Features:**
- Log feedings with time, type (Breastmilk, Formula, Ready-to-Feed), volume, and duration; voice input support
- Feedings can draw from a milk stash entry (auto-deducted via `use_milk_stash` RPC)
- Analytics with period filters (Day/Week/Month): total intake, average per feeding, feeding count, bar chart
- Realtime sync across caregivers

#### Pumping Tracker
**Purpose:** Log pumping sessions and manage stored milk supply

**Features:**
- Log pumping sessions: time, duration, volume, side (left/right/both), storage destination (fed immediately / fridge / freezer); voice input support
- Milk Stash: tracks stored volume vs. used volume per entry, supports fridge/freezer distinction
- Realtime sync across caregivers

#### Growth Tracker
**Purpose:** Track baby's physical growth over time

**Features:**
- Log weight (kg), height (cm), head circumference (cm) with optional notes; voice input support
- Milestone achievements (keyed, one row per baby per milestone)
- Realtime sync across caregivers

#### Activity Dashboard (formerly "Time Management")
**Purpose:** Automatically surface caregiver workload balance from data that's already being tracked — no manual time-block logging required (that approach was tried and replaced; see [TASKS.md](TASKS.md) Session 3).

**Features:**
- **Workload Summary Cards** — per-caregiver activity counts
- **Workload Balance Bar** — stacked bar showing % split between caregivers
- **Activity Breakdown Chart** — grouped bar chart (feedings, diapers, sleep put-downs, household tasks)
- **Household Task Logger** — quick-log grid across 9 task types + recent history
- **Mom Recovery Card** — postpartum "standing time" timer for a designated recovering caregiver (`babies.recovering_caregiver_id`), with a rest recommendation once daily standing time crosses 30 minutes
- **Date Range Filter** — Today / This Week / This Month
- Dynamically supports any number of caregivers (no hardcoded cap)
- Demo mode shows 3 mock caregivers with sample data

**Task Types:** change_diapers, feeding (auto-tracked baby care) + cooking, cleaning, laundry, doctor_visit, shopping, bathing, sterilizing, playtime, other (household, shown in the UI logger — see `HOUSEHOLD_TASK_TYPES` in `src/types/index.ts`)

#### Voice Input (cross-cutting feature)
**Purpose:** Let a caregiver log an entry by speaking instead of filling a form — useful one-handed while holding a baby.

**How it works:**
- Web Speech API captures a transcript client-side (`useVoiceInput` hook), language-aware (`en-US` / `zh-CN`)
- Transcript + tracker type + timezone + local time sent to the `parse-voice-input` Supabase Edge Function
- Function returns structured, tracker-specific fields (sleep/feeding/diaper/growth/pumping) with a confidence level (high/medium/low) that the UI uses to decide whether to auto-fill or ask for confirmation
- Graceful degradation: feature checks `browserSupported`; surfaces distinct errors for mic-permission-denied, rate-limited, and parse-failed states

#### Settings Page
**Purpose:** Manage baby profiles, caregivers, and notification preferences

**Features:**
- Baby management: rename, delete (with confirmation dialog)
- `CaregiverManager`: invite generation/copy-link, caregiver list, remove caregiver (primary only)
- `EmailSettings`: opt-in daily summary email, timezone selection

#### Join Baby Page (`/join?code=ABC123`)
- Shareable invite link landing page; redeems a `baby_invites` code via the `redeem_invite` RPC
- Handles both logged-in and not-yet-signed-up users (see Authentication below)

---

## 4. Multi-Caregiver System

### 4.1 Architecture

**Baby Profiles:**
- Users can create multiple baby profiles
- Each baby has a name, optional birth date, and an optional `recovering_caregiver_id` (drives the Mom Recovery card)
- Baby selector in navigation for switching between profiles

**Caregiver Roles:**
- **Primary:** Full access, can invite others, can delete the baby, can remove caregivers
- **Member:** Standard access, cannot invite or delete

**Invite System:**
- Primary caregiver generates a 6-character invite code
- Codes use a secure character set (excludes confusing chars: 0, O, I, 1) generated via the Web Crypto API
- Codes expire after 7 days, single-use (`used_by`/`used_at` on redemption)
- Shareable as a direct link: `/join?code=ABC123`
- New caregiver provides a display name when joining

### 4.2 Data Access

**Row Level Security (RLS):**
- All tables protected with RLS
- Helper functions (all `SECURITY DEFINER` to sidestep RLS chicken-and-egg problems on insert):
  - `is_baby_caregiver(_baby_id, _user_id)`
  - `is_primary_caregiver(_baby_id, _user_id)`
  - `shares_baby_with(_profile_user_id, _viewer_id)`
- Two atomic RPCs bypass RLS for multi-step operations: `create_baby_with_caregiver()` and `redeem_invite()`

**Database Tables** (see `supabase/schema.sql`, 786 lines):
```text
profiles, babies, baby_caregivers, baby_invites
sleep_sessions, diaper_changes, feedings
time_blocks, care_tasks, standing_sessions
pumping_sessions, milk_stash
growth_records, milestones
email_preferences
```

---

## 5. Authentication

### 5.1 Authentication Flow
- Email/password authentication via Supabase Auth
- **Unified sign-up**: user picks "New Baby" or "Join Existing Baby" during sign-up itself (role + baby name / invite code collected in one form)
- Because email confirmation can delay session availability, the intended post-signup action (create baby / redeem invite) is persisted to `localStorage` and executed once a session appears (`usePendingSignupAction` hook) — bridges the async gap without losing user intent
- Password reset: request → email link → `PASSWORD_RECOVERY` auth event detected → `UpdatePasswordModal` forces a new password before continuing
- Auth modal accessible from navigation

### 5.2 Demo Mode
- Unauthenticated users can use trackers locally
- Data stored in component state (not persisted)
- Visual indicator showing "Demo mode - data will not be saved"
- Login prompt on each tracker page

---

## 6. Technical Architecture

### 6.1 Frontend Stack
- **Framework:** React 19 with TypeScript, React Router DOM v7
- **Build Tool:** Vite 7 (`tsc -b && vite build`)
- **Styling:** Tailwind CSS v4
- **UI Components:** Radix UI primitives (shadcn/ui)
- **State Management:** React Context (Auth, Baby, Language) + TanStack Query v5
- **Charts:** Recharts v3

### 6.2 Backend
- **Database:** PostgreSQL via Supabase
- **Authentication:** Supabase Auth
- **Edge Functions (Deno runtime):**
  - `parse-voice-input` — transcript → structured tracker data
  - `daily-summary` — CSV email digest, scheduled via `pg_cron`, sent through Resend
- **Realtime:** Supabase Realtime enabled on nearly every tracker table (sleep_sessions, diaper_changes, feedings, time_blocks, care_tasks, standing_sessions, pumping_sessions, milk_stash, growth_records, milestones) via a shared `useRealtimeSync` hook

There is no third-party AI chat integration (Gemini/Lovable AI Gateway) in the current app — that was in an earlier draft of this PRD and does not reflect shipped code.

---

## 7. Internationalization (i18n)

### Supported Languages
- English (default)
- Chinese Simplified (中文)

### Implementation
- `LanguageContext` provider
- `src/translations/en.ts` defines the `TranslationKey` type (`as const`); `src/translations/zh.ts` implements `Record<TranslationKey, string>` — TypeScript enforces full coverage, so a missing Chinese key is a build error, not a silent gap
- Currently 599 lines per translation file
- Language selector in navigation

### Coverage
- Navigation labels, page titles/subtitles, form labels/placeholders, error/success messages, tips, Q&A content (19 questions × 2 languages)

---

## 8. User Experience

### 8.1 Design System
- Cream/off-white background (`#fdfcf8`), violet accent (`#a78bfa`)
- Rounded corners (xl for cards, full for pills), soft shadows
- Color-coded status indicators
- Responsive, mobile-first; nav collapses to icon-only + horizontal scroll on small screens

### 8.2 Navigation
- Fixed top navigation bar
- Desktop: full labels with icons; Mobile: icons only, horizontally scrollable
- Active state highlighting
- Baby selector (authenticated users only)
- Language selector
- User menu (settings, sign out) when authenticated; sign-in button in demo mode

### 8.3 Feedback
- Toast notifications (sonner) for actions
- Loading states, empty states with helpful messaging
- Real-time updates across devices on realtime-enabled tables

---

## 9. Security Considerations

### Implemented
- Row Level Security on all data tables, backed by `SECURITY DEFINER` helper functions
- Secure invite code generation (Web Crypto API), 7-day expiry, single-use
- User data isolated by caregiver relationships; no cross-user data access
- JWT-backed Supabase session handling

### Notable Gaps / Not Yet Reviewed
- No explicit rate limiting has been verified on the `parse-voice-input` or `daily-summary` edge functions (the earlier PRD's "rate limiting on AI endpoint" referred to the since-removed AI chat feature)
- CORS policy on edge functions has not been re-verified against current deployment origins

---

## 10. Known Issues / Inconsistencies

1. **Branding split:** UI shows "BabyOS" (`Navigation.tsx`, `index.html` title) but `AuthModal.tsx` still hardcodes the string `'BabyStep'`, and the repo/GitHub org/deployment URL (`baby-first-iota.vercel.app`) all use the old name.
2. **CLAUDE.md drift:** Prior instruction blocks appended below this PRD assert the stack is "Next.js" — it is not; this is a Vite + React Router SPA. Should be corrected or removed to avoid misleading future work.

---

## 11. Future Considerations

### Potential Enhancements (not yet built)
1. **Export Data:** CSV/PDF export from the Activity Dashboard or trackers
2. **Push Notifications:** Shift handoff reminders, feeding reminders
3. **Night Duty Rotation Planner:** Structured overnight shift scheduling (time_blocks table exists but the old manual UI was removed in favor of the Activity Dashboard — could resurface for this specific use case)
4. **Offline Support:** PWA with service worker caching
5. **Dark Mode:** Theme toggle support
6. **Code splitting:** JS bundle is currently >1MB in a single chunk

---

## 12. Current Status Summary

| Feature | Status | Data Persistence | Realtime |
|---------|--------|------------------|----------|
| Authentication (incl. unified signup) | Complete | Yes | N/A |
| Multi-Caregiver / Invites | Complete | Yes | N/A |
| Baby Profiles | Complete | Yes | N/A |
| Q&A (static FAQ) | Complete | N/A | N/A |
| Sleep Tracker | Complete | Yes | Yes |
| Diaper Tracker | Complete | Yes | Yes |
| Feeding Tracker | Complete | Yes | Yes |
| Pumping Tracker + Milk Stash | Complete | Yes | Yes |
| Growth Tracker + Milestones | Complete | Yes | Yes |
| Activity Dashboard | Complete | Yes (derived) | Partial (task/timeblock tables realtime; aggregation is query-time) |
| Mom Recovery (standing sessions) | Complete | Yes | Yes |
| Voice Input | Complete | N/A (feeds forms) | N/A |
| Daily Email Summary | Complete | N/A | N/A |
| Settings (baby/caregiver/email mgmt) | Complete | Yes | N/A |

---

When working with external services, follow these resilience rules autonomously: 1) If an image processing call fails with a media type error, use Bash to run `file --mime-type` on the image, then convert it to the correct format with ImageMagick or sharp before retrying. 2) If any API call fails with a rate limit (429) or quota error, implement exponential backoff (1s, 2s, 4s) with a max of 3 retries, then if still failing, cache/mock the response and continue building other parts. 3) If a third-party API (Alpha Vantage, Gmail SMTP, etc.) has credential or billing issues, stop retrying after 2 failures, clearly document what credentials/config I need to fix manually, and continue building everything else that doesn't depend on that service. 4) Use TodoWrite to checkpoint completed work every 15 minutes so rate-limit interruptions don't lose progress. Never spend more than 3 attempts on the same external error — adapt or move on.

Add under a new ## Common Mistakes to Avoid section at the top of CLAUDE.md\n\nAlways verify you are targeting the correct repository, branch, and file/tab before making changes. When the user references a specific component (e.g., 'pumping tab'), confirm the exact file path before editing.
Add under ## Build & Deploy section in CLAUDE.md\n\nAfter every code edit, run `npx tsc --noEmit` and check for unused variables, type errors, and import issues before committing. Never push code that hasn't passed a TypeScript type check.
Add under ## Project Overview section at the very top of CLAUDE.md\n\nThis project uses TypeScript with Next.js deployed on Vercel with a Supabase backend. All code must be TypeScript. Translations are in Chinese (zh). All users are in PST timezone — do not assume timezone ambiguity.
Add under ## Build & Deploy section in CLAUDE.md\n\nWhen deploying to production, verify the deployment actually succeeded by checking Vercel dashboard status or running a curl against the live URL. Do not assume a git push triggers a successful deploy.
