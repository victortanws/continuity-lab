CREATE TABLE `repository_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`owner` text NOT NULL,
	`repository` text NOT NULL,
	`canonical_url` text NOT NULL,
	`requested_ref` text,
	`active_snapshot_id` text,
	`sync_status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_connections_project_repo_unique` ON `repository_connections` (`project_id`,`provider`,`owner`,`repository`);--> statement-breakpoint
CREATE INDEX `repository_connections_project_idx` ON `repository_connections` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `repository_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`path` text NOT NULL,
	`blob_sha` text NOT NULL,
	`content_sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`content_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `repository_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_entries_snapshot_path_unique` ON `repository_entries` (`snapshot_id`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `repository_entries_r2_key_unique` ON `repository_entries` (`r2_key`);--> statement-breakpoint
CREATE INDEX `repository_entries_snapshot_idx` ON `repository_entries` (`snapshot_id`,`path`);--> statement-breakpoint
CREATE TABLE `repository_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`commit_sha` text NOT NULL,
	`tree_sha` text NOT NULL,
	`requested_ref` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`coverage_complete` integer DEFAULT false NOT NULL,
	`tree_truncated` integer DEFAULT false NOT NULL,
	`selected_file_count` integer DEFAULT 0 NOT NULL,
	`skipped_file_count` integer DEFAULT 0 NOT NULL,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`policy_version` text NOT NULL,
	`manifest_r2_key` text,
	`packet_r2_key` text,
	`packet_source_id` text,
	`index_status` text DEFAULT 'stored' NOT NULL,
	`index_error` text,
	`failure_code` text,
	`failure_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `repository_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_snapshots_commit_policy_unique` ON `repository_snapshots` (`connection_id`,`commit_sha`,`policy_version`);--> statement-breakpoint
CREATE INDEX `repository_snapshots_project_created_idx` ON `repository_snapshots` (`project_id`,`created_at`);