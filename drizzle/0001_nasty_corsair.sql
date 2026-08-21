CREATE TABLE `appArtifacts` (
	`id` varchar(32) NOT NULL,
	`appId` varchar(32) NOT NULL,
	`artifactType` enum('source_bundle','sqlite_database','zip_export') NOT NULL,
	`objectKey` text NOT NULL,
	`objectUrl` text NOT NULL,
	`byteSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appArtifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appSchemaVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` varchar(32) NOT NULL,
	`version` int NOT NULL,
	`schemaDocument` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appSchemaVersions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generatedApps` (
	`id` varchar(32) NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`prompt` text NOT NULL,
	`summary` text,
	`status` enum('queued','building','ready','failed') NOT NULL DEFAULT 'queued',
	`model` varchar(80),
	`schemaVersion` int NOT NULL DEFAULT 1,
	`sourceBundleKey` text,
	`sourceBundleUrl` text,
	`sqliteArtifactKey` text,
	`sqliteArtifactUrl` text,
	`exportArtifactKey` text,
	`exportArtifactUrl` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generatedApps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mcpApiKeys` (
	`id` varchar(32) NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(80) NOT NULL,
	`tokenPrefix` varchar(18) NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mcpApiKeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appArtifacts` ADD CONSTRAINT `appArtifacts_appId_generatedApps_id_fk` FOREIGN KEY (`appId`) REFERENCES `generatedApps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appSchemaVersions` ADD CONSTRAINT `appSchemaVersions_appId_generatedApps_id_fk` FOREIGN KEY (`appId`) REFERENCES `generatedApps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generatedApps` ADD CONSTRAINT `generatedApps_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcpApiKeys` ADD CONSTRAINT `mcpApiKeys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appArtifacts_app_type_idx` ON `appArtifacts` (`appId`,`artifactType`);--> statement-breakpoint
CREATE INDEX `appSchemaVersions_app_version_idx` ON `appSchemaVersions` (`appId`,`version`);--> statement-breakpoint
CREATE INDEX `generatedApps_user_created_idx` ON `generatedApps` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mcpApiKeys_hash_idx` ON `mcpApiKeys` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `mcpApiKeys_user_idx` ON `mcpApiKeys` (`userId`);