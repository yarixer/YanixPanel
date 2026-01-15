-- CreateTable
CREATE TABLE `ContainerCommandPrefix` (
    `containerId` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`containerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
