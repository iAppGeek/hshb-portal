-- Builds the cleaned contact list for the Microsoft 365 sync.
-- Run by fetch-contacts.sh; returns a single JSON document (see README.md).
-- Read-only: selects only names and email addresses.

with
-- =========================================================================
-- CONFIG: roles and tags
--   tag              value written to CustomAttribute1 / the role attribute
--                    (letters and digits only; must also be in config.psd1)
--   priority         lower wins: sets CustomAttribute1 and whose name is used
--                    when one email belongs to several roles
--   tag_user_account also tag the person's Microsoft 365 account
--                    (account_email) with CustomAttribute1
-- =========================================================================
roles (tag, priority, tag_user_account) as (
  values
    ('Teacher', 1, true),
    ('Parent', 2, false)
),

-- One SELECT per role. Columns: tag, source_id, first_name, last_name,
-- email (the external address for the mail contact), account_email.
source_rows as (
  -- Teachers (including the headteacher). personal_email becomes the mail
  -- contact; email is their school Microsoft 365 account.
  select 'Teacher' as tag, s.id::text as source_id, s.first_name, s.last_name,
         s.personal_email as email, s.email as account_email
  from staff s
  where s.role in ('teacher', 'headteacher')

  union all

  -- Parents: primary and secondary guardians of active students.
  -- Additional (emergency) contacts are deliberately excluded.
  select 'Parent', g.id::text, g.first_name, g.last_name, g.email, null
  from guardians g
  where exists (
    select 1 from students st
    where st.active and g.id in (st.primary_guardian_id, st.secondary_guardian_id)
  )
),
-- ============================ end of config ==============================

cleaned as (
  select r.tag, r.priority, r.tag_user_account, sr.source_id,
         btrim(coalesce(sr.first_name, '')) as first_name,
         btrim(coalesce(sr.last_name, '')) as last_name,
         lower(btrim(coalesce(sr.email, ''))) as email,
         lower(btrim(coalesce(sr.account_email, ''))) as account_email
  from source_rows sr
  join roles r using (tag)
),

checked as (
  select c.*,
         case
           when c.email = '' then 'missing email'
           when c.email !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
             then 'invalid email'
           when c.first_name = '' and c.last_name = '' then 'missing name'
         end as skip_reason,
         c.account_email !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
           as account_invalid
  from cleaned c
),

valid as (
  select * from checked where skip_reason is null
),

-- One name per email: the highest-priority row wins, then a stable order.
names as (
  select distinct on (email) email, first_name, last_name
  from valid
  order by email, priority, last_name, first_name, source_id
),

tag_lists as (
  select email, json_agg(tag order by priority) as tags
  from (select email, tag, min(priority) as priority from valid group by email, tag) t
  group by email
),

accounts as (
  select distinct on (account_email) account_email as email, tag
  from checked
  where tag_user_account and not account_invalid
  order by account_email, priority
),

skipped as (
  select tag as role, skip_reason as reason, count(*) as n
  from checked where skip_reason is not null
  group by tag, skip_reason
  union all
  select tag, 'missing or invalid user account email', count(*)
  from checked where tag_user_account and account_invalid
  group by tag
),

role_counts as (
  select r.tag, r.priority, count(c.tag) as row_count
  from roles r
  left join cleaned c using (tag)
  group by r.tag, r.priority
)

select json_build_object(
  'version', 1,
  'generatedAt', now(),
  'roles', (select json_agg(json_build_object('tag', tag, 'rows', row_count) order by priority) from role_counts),
  'contacts', coalesce((
    select json_agg(json_build_object(
      'email', n.email, 'firstName', n.first_name, 'lastName', n.last_name, 'tags', t.tags
    ) order by n.email)
    from names n join tag_lists t using (email)
  ), '[]'::json),
  'accounts', coalesce((select json_agg(json_build_object('email', email, 'tag', tag) order by email) from accounts), '[]'::json),
  'skipped', coalesce((select json_agg(json_build_object('role', role, 'reason', reason, 'count', n) order by role, reason) from skipped), '[]'::json),
  'mergedRows', (select count(*) from valid) - (select count(distinct email) from valid)
) as data;
