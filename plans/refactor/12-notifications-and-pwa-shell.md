# 12 — Notifications from the action wrapper; PWA shell

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| E1, G5   |  4  |   4   |  5   |  S   | 02         |

## Goal

Push notifications stay. Two changes:

1. Sending a notification becomes a declarative option on `runAction` (like `audit`) instead of a
   40-line block inside `attendance/actions.ts`, so any action can notify with one line and the
   410-cleanup logic lives in one place.
2. The service worker precaches the **app shell** (the Next.js static chunks the current build
   emits, plus fonts/CSS it already caches) so a repeat visit on a poor connection paints the sidebar
   and skeletons from cache while the HTML/RSC payload loads. Page HTML stays network-only (it
   contains student data — current policy is correct and unchanged).

## Decisions already made

- New module `src/lib/notify.ts` (server-only):
  ```ts
  export type Notification = { title: string; body: string; url: `/${string}` }
  /** Fire-and-forget: never awaited by the caller, never throws. Removes 410/404 subscriptions. */
  export function notifyAdmins(
    n: Notification,
    opts?: { excludeStaffId?: string },
  ): void
  export function notifyStaff(staffIds: string[], n: Notification): void
  ```
  Implementation = today's block from `attendance/actions.ts` (`getAdminSubscriptions`,
  `Promise.allSettled`, `sendPushNotification`, `deletePushSubscription` on 410/404), with
  `logError('notify', err)` for anything else.
- `runAction` gains `notify?: (result, input, ctx) => Notification | { to: 'admins' | string[];
notification: Notification } | undefined` evaluated after the audit step. Returning `undefined`
  sends nothing. Default recipient is admins excluding the actor.
- No queue, no cron, no third-party push service. Web Push via `web-push` stays.
- Service worker: keep hand-written `public/sw.js` (no `next-pwa`/Serwist). Precache list is
  generated at build time into `public/sw-manifest.json` by a small Node script
  (`scripts/build-sw-manifest.mjs`) that runs after `next build` (`"build": "next build && node
scripts/build-sw-manifest.mjs"`) and lists `/_next/static/chunks/**` + `/_next/static/css/**`
  under `.next/static` (both content-hashed; safe to cache-first). `sw.js` fetches the manifest on
  `install`, adds its URLs to the cache, and `activate` deletes old caches as today. Bump
  `CACHE_NAME` via the manifest's hash rather than by hand.
- The `offline.html` fallback stays; add the sidebar's brand header to it so the page looks like
  the portal.

## Implementation steps

1. Create `src/lib/notify.ts` + spec (mock `@/db` and `@/lib/push`; assert 410 deletes the
   subscription, actor excluded, errors logged not thrown).
2. Add `notify` to `runAction` (`src/lib/action.ts`) + spec cases.
3. `attendance/actions.ts`: replace the inline block with
   `notify: (_r, _i, { actor }) => ({ title: 'Attendance Saved', body: \`Attendance for ${cls.name} has been ${isUpdate ? 'updated' : 'saved'}\`, url: '/reports' })`.
Delete the direct `sendPushNotification`, `getAdminSubscriptions`, `deletePushSubscription`
   imports from the action.
4. `scripts/build-sw-manifest.mjs`; update `package.json` `build`; `sw.js` reads the manifest.
   Ensure `netlify.toml` build command is `npm run build` (unchanged) so the script runs in
   production.
5. `public/offline.html` header tweak.
6. Verify in Chrome DevTools → Application → Cache Storage after one visit that static chunks are
   present; then throttle to "Offline" and reload: the offline page appears instantly; throttle to
   "Slow 3G" and navigate: the sidebar skeleton paints before the RSC payload arrives.

## Files

**Create:** `src/lib/notify.ts` + spec, `scripts/build-sw-manifest.mjs`.
**Modify:** `src/lib/action.ts` + spec, `src/app/attendance/actions.ts` + spec, `public/sw.js`,
`public/offline.html`, `package.json`, `.gitignore` (`public/sw-manifest.json`).

## Acceptance criteria

- `rg "sendPushNotification" src --glob '!*.spec.*'` returns only `src/lib/notify.ts`.
- `rg "notify:" src/app/**/actions.ts` finds the attendance action.
- `public/sw-manifest.json` is git-ignored and produced by `npm run build`.
- DevTools checks in step 6 pass; note the before/after "first paint on Slow 3G repeat visit" in
  the PR.
- `npm run pipeline:check` green.

## Deliberate UX changes

- Faster repeat-visit shell paint on slow connections. No visible change otherwise.
