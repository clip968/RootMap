CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`page_start` integer,
	`page_end` integer,
	`section_title` text,
	`text` text NOT NULL,
	`token_count` integer,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_chunks_document_index_uidx` ON `document_chunks` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `document_concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`concept_id` text,
	`concept_title` text NOT NULL,
	`concept_type` text NOT NULL,
	`importance` integer,
	`difficulty` integer,
	`source_type` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_concepts_document_concept_type_uidx` ON `document_concepts` (`document_id`,`concept_id`,`concept_type`);--> statement-breakpoint
CREATE TABLE `document_learning_trees` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`tree_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tree_id`) REFERENCES `learning_trees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_learning_trees_document_tree_uidx` ON `document_learning_trees` (`document_id`,`tree_id`);--> statement-breakpoint
CREATE TABLE `document_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`text` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_pages_document_page_uidx` ON `document_pages` (`document_id`,`page_number`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`original_filename` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size_bytes` integer NOT NULL,
	`page_count` integer,
	`extracted_text_length` integer,
	`processing_status` text DEFAULT 'uploaded' NOT NULL,
	`processing_error` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
