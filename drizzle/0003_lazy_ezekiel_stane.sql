CREATE TABLE `project_revisions` (
	`project_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`parent_revision_id` text,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_revisions_project_revision_unique` ON `project_revisions` (`project_id`,`revision_id`);--> statement-breakpoint
CREATE INDEX `project_revisions_project_created_idx` ON `project_revisions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `revision_source_versions` (
	`project_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_version_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revision_sources_membership_unique` ON `revision_source_versions` (`project_id`,`revision_id`,`source_version_id`);--> statement-breakpoint
CREATE INDEX `revision_sources_revision_idx` ON `revision_source_versions` (`project_id`,`revision_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `project_revisions` (`project_id`, `revision_id`, `parent_revision_id`, `reason`)
SELECT `id`, `active_revision`, NULL, 'migration-backfill' FROM `projects`;--> statement-breakpoint
INSERT OR IGNORE INTO `revision_source_versions` (`project_id`, `revision_id`, `source_id`, `source_version_id`)
SELECT s.`project_id`, p.`active_revision`, s.`id`, s.`version_id`
FROM `sources` s JOIN `projects` p ON p.`id` = s.`project_id`;
