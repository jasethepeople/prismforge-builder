CREATE TABLE `appSchemaMigrations` (
	`id` varchar(32) NOT NULL,
	`appId` varchar(32) NOT NULL,
	`fromVersion` int NOT NULL,
	`toVersion` int NOT NULL,
	`migrationDocument` json NOT NULL,
	`status` enum('applied','rolled_back') NOT NULL DEFAULT 'applied',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`rolledBackAt` timestamp,
	CONSTRAINT `appSchemaMigrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mcpApiKeys` ADD `revokedAt` timestamp;--> statement-breakpoint
ALTER TABLE `appSchemaMigrations` ADD CONSTRAINT `appSchemaMigrations_appId_generatedApps_id_fk` FOREIGN KEY (`appId`) REFERENCES `generatedApps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appSchemaMigrations_app_created_idx` ON `appSchemaMigrations` (`appId`,`createdAt`);