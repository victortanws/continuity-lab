CREATE TABLE `usage_windows` (
	`scope_key` text NOT NULL,
	`operation` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_seconds` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_windows_scope_operation_window_unique` ON `usage_windows` (`scope_key`,`operation`,`window_start`,`window_seconds`);--> statement-breakpoint
CREATE INDEX `usage_windows_updated_idx` ON `usage_windows` (`updated_at`);