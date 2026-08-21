CREATE TABLE `workspaceInvites` (
	`id` varchar(32) NOT NULL,
	`workspaceId` varchar(32) NOT NULL,
	`invitedBy` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('editor','viewer') NOT NULL DEFAULT 'viewer',
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspaceInvites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workspaceInvites` ADD CONSTRAINT `workspaceInvites_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceInvites` ADD CONSTRAINT `workspaceInvites_invitedBy_users_id_fk` FOREIGN KEY (`invitedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `workspaceInvites_workspace_idx` ON `workspaceInvites` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `workspaceInvites_email_idx` ON `workspaceInvites` (`email`);