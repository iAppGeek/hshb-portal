# Role Permissions Summary

Four roles exist: **teacher**, **admin**, **headteacher**, **secretary**.

## CRUD Permissions

| Action                  | teacher | admin | headteacher | secretary |
| ----------------------- | ------- | ----- | ----------- | --------- |
| Create students         | -       | Yes   | -           | -         |
| Edit students           | -       | Yes   | -           | -         |
| Create staff            | -       | Yes   | -           | -         |
| Edit staff              | -       | Yes   | -           | -         |
| Create classes          | -       | Yes   | Yes         | -         |
| Edit classes            | -       | Yes   | Yes         | -         |
| Edit guardians          | -       | Yes   | -           | -         |
| Create incidents        | Yes     | Yes   | Yes         | Yes       |
| Edit incidents          | -       | Yes   | Yes         | -         |
| Create lesson plans     | Yes     | Yes   | Yes         | -         |
| Edit lesson plans       | Yes     | Yes   | Yes         | -         |
| Update attendance       | Yes     | Yes   | Yes         | -         |
| Manage staff attendance | -       | Yes   | Yes         | -         |

## Data Visibility

| Capability               | teacher | admin | headteacher | secretary |
| ------------------------ | ------- | ----- | ----------- | --------- |
| See all data             | -       | Yes   | Yes         | Yes       |
| See staff contact info   | -       | Yes   | Yes         | Yes       |
| See student medical info | -       | Yes   | Yes         | Yes       |

## Feature Access

| Feature                             | teacher | admin | headteacher | secretary |
| ----------------------------------- | ------- | ----- | ----------- | --------- |
| Access reports                      | -       | Yes   | Yes         | Yes       |
| Receive push notifications          | -       | Yes   | Yes         | -         |
| Review registrations                | -       | Yes   | Yes         | Yes       |
| Approve/reject/delete registrations | -       | Yes   | -           | -         |
| Manage finance (payroll, fees)      | -       | Yes   | -           | -         |

## Other Rules

| Rule                   | teacher | admin | headteacher | secretary |
| ---------------------- | ------- | ----- | ----------- | --------- |
| Shows on sign-in sheet | Yes     | -     | Yes         | Yes       |
| Is teaching staff      | Yes     | -     | Yes         | -         |

- Every server action goes through `runAction()` in `src/lib/action.ts`, which
  resolves the actor and applies the `permission` check before `run` is called.
  The proxy allowlist for `/register` means middleware cannot be relied on as
  the only gate. The public `/register` actions are the only ones allowed to
  pass `public: true`, which skips both checks. `src/security.spec.ts` enforces
  both rules.
- Pages get the actor from `requireSession()` / `requireRole()` /
  `requireRouteAccess()` in `src/auth/require.ts` rather than calling `auth()`
  directly. `requireRouteAccess(pathname)` reuses the route's own permission
  from `src/lib/routes.ts` — the same list `proxy.ts` and the sidebar read —
  for pages whose access rule matches the route exactly; pages with a finer
  rule (e.g. guardians redirecting to `/students` instead of `/dashboard`)
  keep an explicit `requireRole()`/`redirect()` check.

## Notes

- Teachers can only create/edit lesson plans for their own classes.
- Any signed-in staff member can record an incident against any student
  (`saveIncidentAction` with no id has no `permission`): any member of staff may
  witness one, so the new-incident page offers every active student to every
  role, identified by name and class. Editing an incident still needs
  `canEditIncidents`.
- Teachers and secretaries can sign themselves in/out but cannot sign in/out other staff.
- Admins and headteachers can sign in/out any staff member.
- Secretaries can save new attendance but cannot update existing attendance records.
- All permission functions are defined in `permissions.ts` alongside this file.
