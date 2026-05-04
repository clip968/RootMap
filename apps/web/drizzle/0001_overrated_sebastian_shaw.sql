CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`aliases` text NOT NULL,
	`domain` text,
	`short_description` text,
	`explanation` text,
	`difficulty` integer,
	`examples` text NOT NULL,
	`common_misconceptions` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concepts_slug_unique` ON `concepts` (`slug`);--> statement-breakpoint
CREATE INDEX `concepts_normalized_title_idx` ON `concepts` (`normalized_title`);--> statement-breakpoint
ALTER TABLE `learning_nodes` ADD `concept_id` text REFERENCES concepts(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `learning_nodes` ADD `is_reused_concept` integer;--> statement-breakpoint
CREATE TABLE `concept_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`from_concept_id` text NOT NULL,
	`to_concept_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`strength` real DEFAULT 1 NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`from_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_edges_from_to_type_uidx` ON `concept_edges` (`from_concept_id`,`to_concept_id`,`relation_type`);--> statement-breakpoint
CREATE TABLE `learning_tree_concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`tree_id` text NOT NULL,
	`learning_node_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`role_in_tree` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tree_id`) REFERENCES `learning_trees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`learning_node_id`) REFERENCES `learning_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_tree_concepts_tree_node_concept_uidx` ON `learning_tree_concepts` (`tree_id`,`learning_node_id`,`concept_id`);--> statement-breakpoint
CREATE TABLE `concept_merge_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`source_concept_id` text NOT NULL,
	`target_concept_id` text NOT NULL,
	`similarity_score` real NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_merge_candidates_source_target_uidx` ON `concept_merge_candidates` (`source_concept_id`,`target_concept_id`);--> statement-breakpoint
CREATE TABLE `user_concept_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_concept_progress_user_concept_uidx` ON `user_concept_progress` (`user_id`,`concept_id`);
