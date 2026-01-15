-- CreateTable
CREATE TABLE `ContainerCommandSettings` (
    `containerId` VARCHAR(191) NOT NULL,
    `mode` ENUM('RAW', 'ARGS', 'SHELL', 'BASH') NOT NULL,
    `login` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`containerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
