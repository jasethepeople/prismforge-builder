CREATE TABLE `appRuntimeLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` varchar(32) NOT NULL,
	`userId` int NOT NULL,
	`event` varchar(64) NOT NULL,
	`level` enum('info','warn','error') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appRuntimeLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaceMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(32) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspaceMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` varchar(32) NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `generatedApps` ADD `workspaceId` varchar(32);--> statement-breakpoint
ALTER TABLE `appRuntimeLogs` ADD CONSTRAINT `appRuntimeLogs_appId_generatedApps_id_fk` FOREIGN KEY (`appId`) REFERENCES `generatedApps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appRuntimeLogs` ADD CONSTRAINT `appRuntimeLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceMembers` ADD CONSTRAINT `workspaceMembers_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceMembers` ADD CONSTRAINT `workspaceMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appRuntimeLogs_app_created_idx` ON `appRuntimeLogs` (`appId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `appRuntimeLogs_user_idx` ON `appRuntimeLogs` (`userId`);--> statement-breakpoint
CREATE INDEX `workspaceMembers_workspace_user_idx` ON `workspaceMembers` (`workspaceId`,`userId`);--> statement-breakpoint
CREATE INDEX `workspaceMembers_user_idx` ON `workspaceMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `workspaces_owner_idx` ON `workspaces` (`ownerId`);--> statement-breakpoint
ALTER TABLE `generatedApps` ADD CONSTRAINT `generatedApps_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `generatedApps_workspace_idx` ON `generatedApps` (`workspaceId`);