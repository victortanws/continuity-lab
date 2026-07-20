CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_revision` text NOT NULL,
	`question` text NOT NULL,
	`answer_json` text NOT NULL,
	`mode` text NOT NULL,
	`model` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analyses_project_created_idx` ON `analyses` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`active_revision` text DEFAULT 'rev-1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`internal_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`invalidated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_bindings_internal_unique` ON `provider_bindings` (`project_id`,`internal_id`,`provider`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_bindings_external_unique` ON `provider_bindings` (`provider`,`kind`,`external_id`);--> statement-breakpoint
CREATE INDEX `provider_bindings_project_idx` ON `provider_bindings` (`project_id`,`provider`,`kind`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`logical_name` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`authority` text DEFAULT 'reference' NOT NULL,
	`valid_from` text,
	`supersedes_source_id` text,
	`index_status` text DEFAULT 'stored' NOT NULL,
	`index_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_version_id_unique` ON `sources` (`version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sources_project_sha256_unique` ON `sources` (`project_id`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `sources_r2_key_unique` ON `sources` (`r2_key`);--> statement-breakpoint
CREATE INDEX `sources_project_created_idx` ON `sources` (`project_id`,`created_at`);