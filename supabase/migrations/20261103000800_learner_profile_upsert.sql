-- An upsert through PostgREST also sets the conflict column, so saving learner preferences needs
-- update permission on user_id. The row-level policy still requires it to be the caller's own id.
grant update (user_id) on learning.learner_profiles to authenticated;
