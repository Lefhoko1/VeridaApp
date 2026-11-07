-- Appendix A: the project owner chose a 90-day retention period, in place of the proposed 30.
alter table platform.retention_settings alter column deletion_grace_days set default 90;
update platform.retention_settings set deletion_grace_days = 90, updated_at = now();
