CREATE TABLE `learning_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`tree_id` text NOT NULL,
	`node_key` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`difficulty` integer,
	`prerequisites` text NOT NULL,
	`children` text NOT NULL,
	`detail_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tree_id`) REFERENCES `learning_trees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_nodes_tree_id_node_key_uidx` ON `learning_nodes` (`tree_id`,`node_key`);--> statement-breakpoint
CREATE TABLE `learning_trees` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`summary` text,
	`tree_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_node_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tree_id` text NOT NULL,
	`node_id` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tree_id`) REFERENCES `learning_trees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `learning_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_node_progress_user_id_node_id_uidx` ON `user_node_progress` (`user_id`,`node_id`);