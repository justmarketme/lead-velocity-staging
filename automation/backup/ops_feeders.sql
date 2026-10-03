-- ops_feeders.sql: nightly feeder for ops.infra_day (I-22). Run by pg_dump_nightly.sh step 5 through psql as
-- the n8n_app role (OPS_FEEDER_DB_URL; migration 07 grants it SELECT/INSERT/UPDATE on ops.*, no DELETE).
-- psql variables:  day      = SAST calendar date to compute (the caller passes yesterday)
--                  monitors = space-separated monitor labels that must get a row even on a quiet day (default "api")
-- Source: W22's own rows in ops.notifications. signal_key uptime_down / uptime_recovered, scope 'monitor:<host>',
-- payload.since = when the monitor saw the outage start. Monitor label = first DNS label of the host (api, app, go, …).
-- Downtime interval = [least(since, created_at), first recovery at/after it, else now()), merged per monitor and clipped
-- to the SAST day. W22 dedupes a signal for 24 h, so two outages on one day merge into one longer interval: the
-- error is always towards MORE downtime (conservative for the 99.5% SLO). The monitor's own dashboard is the tiebreak.
-- Guards: only complete days; only days on/after the date of the first good pg_dump (the VPS stack existed all day), so pre-VPS
-- days never get a fake 100%. Idempotent: ON CONFLICT (day, monitor) DO UPDATE.
WITH d AS (
  SELECT (:'day')::date AS day,
         tstzmultirange(tstzrange(((:'day')::date)::timestamp AT TIME ZONE 'Africa/Johannesburg',
                                  ((:'day')::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg', '[)')) AS win
),
sig AS (
  SELECT n.signal_key, split_part(substr(n.scope, 9), '.', 1) AS m, n.created_at,
         CASE WHEN n.payload->>'since' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
              THEN least((n.payload->>'since')::timestamptz, n.created_at) ELSE n.created_at END AS t0
    FROM ops.notifications n
   WHERE n.signal_key IN ('uptime_down', 'uptime_recovered') AND n.scope LIKE 'monitor:%'
),
mon AS (
  SELECT DISTINCT m FROM (
    SELECT unnest(string_to_array(coalesce(nullif(:'monitors', ''), 'api'), ' ')) AS m
    UNION ALL
    SELECT s.m FROM sig s WHERE s.created_at > now() - interval '35 days'
  ) x WHERE m <> ''
),
iv AS (
  SELECT dn.m,
         tstzrange(dn.t0, greatest(dn.t0, coalesce(
           (SELECT min(r.created_at) FROM sig r WHERE r.signal_key = 'uptime_recovered' AND r.m = dn.m AND r.created_at >= dn.t0),
           now())), '[)') AS r
    FROM sig dn WHERE dn.signal_key = 'uptime_down'
),
mins AS (
  SELECT a.m, coalesce(sum(extract(epoch FROM upper(u) - lower(u))), 0) / 60.0 AS dm
    FROM (SELECT iv.m, range_agg(iv.r) * (SELECT win FROM d) AS mr FROM iv GROUP BY iv.m) a
    LEFT JOIN LATERAL unnest(a.mr) u ON true
   GROUP BY a.m
)
INSERT INTO ops.infra_day (day, monitor, uptime_pct, down_minutes, source)
SELECT d.day, mon.m,
       round(greatest(0, 100 - coalesce(mins.dm, 0) / 14.4), 3),
       round(coalesce(mins.dm, 0))::integer,
       'w22_notifications'
  FROM d CROSS JOIN mon LEFT JOIN mins ON mins.m = mon.m
 WHERE d.day < (now() AT TIME ZONE 'Africa/Johannesburg')::date
   AND d.day >= (SELECT (min(b.started_at) AT TIME ZONE 'Africa/Johannesburg')::date
                   FROM ops.backup_runs b WHERE b.kind = 'pg_dump' AND b.ok)
ON CONFLICT (day, monitor) DO UPDATE
   SET uptime_pct = EXCLUDED.uptime_pct, down_minutes = EXCLUDED.down_minutes, source = EXCLUDED.source
RETURNING day, monitor, uptime_pct, down_minutes;
