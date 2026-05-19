CREATE TABLE `llm_provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_type` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text,
	`json_mode` text DEFAULT 'auto' NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`api_key_tag` text NOT NULL,
	`api_key_hint` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_provider_settings_active_idx` ON `llm_provider_settings` (`is_active`);--> statement-breakpoint
CREATE INDEX `llm_provider_settings_provider_type_idx` ON `llm_provider_settings` (`provider_type`);