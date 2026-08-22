CREATE TABLE `organization_branding` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`favicon_url` text,
	`primary_color` text DEFAULT '#111827' NOT NULL,
	`secondary_color` text DEFAULT '#374151' NOT NULL,
	`accent_color` text DEFAULT '#E2B002' NOT NULL,
	`background_color` text DEFAULT '#F8F8F8' NOT NULL,
	`heading_font` text DEFAULT 'Inter' NOT NULL,
	`body_font` text DEFAULT 'Inter' NOT NULL,
	`catalog_cover_url` text,
	`catalog_title` text,
	`catalog_description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
