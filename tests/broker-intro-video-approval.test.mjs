import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const brokerA = '11111111-1111-4111-8111-111111111111';
const brokerB = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const video1 = '33333333-3333-4333-8333-333333333333';
const video2 = '44444444-4444-4444-8444-444444444444';
const videoB = '55555555-5555-4555-8555-555555555555';
const cardA = '66666666-6666-4666-8666-666666666666';
const pendingA = '77777777-7777-4777-8777-777777777777';
const migration = new URL('../supabase/migrations/20261016082457_broker_approve_intro_video.sql', import.meta.url);

test('broker intro video approval: own, ready, audited, idempotent, versioned', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.brokers (
        id uuid PRIMARY KEY, user_id uuid NOT NULL,
        intro_video_url jsonb, onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
        onboarding_last_progress_at timestamptz
      );
      CREATE TABLE public.broker_media (
        id uuid PRIMARY KEY, broker_id uuid NOT NULL REFERENCES public.brokers(id),
        kind text NOT NULL, language text NOT NULL DEFAULT 'en', version integer NOT NULL,
        url text, ai_check jsonb, approved_at timestamptz, approved_by uuid,
        is_current boolean NOT NULL DEFAULT false, updated_at timestamptz,
        state text GENERATED ALWAYS AS (
          CASE WHEN approved_at IS NOT NULL AND is_current THEN 'approved'
               WHEN approved_at IS NOT NULL THEN 'superseded'
               WHEN ai_check->>'state' IN ('processing','ready','rejected') THEN ai_check->>'state'
               WHEN url IS NULL THEN 'processing' ELSE 'ready' END
        ) STORED
      );
      CREATE UNIQUE INDEX one_current ON public.broker_media (broker_id, kind, language) WHERE is_current;
      CREATE TABLE public.broker_compliance_checks (
        broker_id uuid, check_type text, result text, summary text,
        details jsonb, source text, checked_by text, checked_at timestamptz
      );
    `);
    await db.exec(await readFile(migration, 'utf8'));
    await db.query(`INSERT INTO brokers (id,user_id) VALUES ($1,$2),($3,$4)`, [brokerA,userA,brokerB,userB]);
    await db.query(`INSERT INTO broker_media (id,broker_id,kind,language,version,url,ai_check)
      VALUES ($1,$2,'video','en',1,'broker-media/a/video1.mp4','{"state":"ready","source":"whatsapp"}'),
             ($3,$4,'video','en',1,'broker-media/b/video.mp4','{"state":"ready"}'),
             ($5,$2,'card','en',1,'card.png','{"state":"ready"}'),
             ($6,$2,'video','af',1,NULL,'{"state":"processing"}')`,
      [video1,brokerA,videoB,brokerB,cardA,pendingA]);
    const asUser = (id) => db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [id]);
    const approve = (id) => db.query(`SELECT broker_approve_intro_video($1::uuid) AS result`, [id]);

    await asUser(userB);
    await assert.rejects(approve(video1), /not found/i);
    await asUser(userA);
    await assert.rejects(approve(videoB), /not found/i);
    await assert.rejects(approve(cardA), /not found/i);
    await assert.rejects(approve(pendingA), /not ready/i);
    assert.equal((await approve(video1)).rows[0].result.changed, true);
    assert.equal((await approve(video1)).rows[0].result.changed, false);
    let rows = (await db.query(`SELECT state,is_current,approved_by FROM broker_media WHERE id=$1`, [video1])).rows;
    assert.deepEqual(rows.map(({state,is_current,approved_by}) => ({state,is_current,approved_by})),
      [{state:'approved',is_current:true,approved_by:userA}]);
    rows = (await db.query(`SELECT intro_video_url,onboarding_progress FROM brokers WHERE id=$1`, [brokerA])).rows;
    assert.equal(rows[0].intro_video_url.en, undefined, 'private preview key must not enter the client send field');
    assert.equal(rows[0].onboarding_progress.intro_media, 'done');
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM broker_compliance_checks WHERE broker_id=$1`, [brokerA])).rows[0].n, 1);

    await db.query(`INSERT INTO broker_media (id,broker_id,kind,language,version,url,ai_check)
      VALUES ($1,$2,'video','en',2,'https://media.sortmycover.co.za/intro/synthetic/video2.mp4','{"state":"ready"}')`, [video2,brokerA]);
    assert.equal((await approve(video2)).rows[0].result.changed, true);
    rows = (await db.query(`SELECT version,state,is_current FROM broker_media WHERE broker_id=$1 AND kind='video' AND language='en' ORDER BY version`, [brokerA])).rows;
    assert.deepEqual(rows.map(({version,state,is_current}) => ({version,state,is_current})), [
      {version:1,state:'superseded',is_current:false}, {version:2,state:'approved',is_current:true},
    ]);
    assert.equal((await db.query(`SELECT intro_video_url->>'en' AS url FROM brokers WHERE id=$1`, [brokerA])).rows[0].url,
      'https://media.sortmycover.co.za/intro/synthetic/video2.mp4');
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM broker_compliance_checks WHERE broker_id=$1`, [brokerA])).rows[0].n, 2);
  } finally {
    await db.close();
  }
});
