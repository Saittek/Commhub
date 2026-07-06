DELETE FROM forum_post_comments WHERE post_id IN (
  SELECT id FROM forum_posts WHERE channel_id IN (
    SELECT id FROM channels WHERE type IN ('forum', 'announcement', 'stage')
  )
);

DELETE FROM forum_posts WHERE channel_id IN (
  SELECT id FROM channels WHERE type IN ('forum', 'announcement', 'stage')
);

DELETE FROM channels WHERE type IN ('forum', 'announcement', 'stage');
