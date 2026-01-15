/*
  Warnings:

  - You are about to drop the `ContainerCommandPrefix` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ContainerCommandSettings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `ContainerCommandPrefix`;

-- DropTable
DROP TABLE `ContainerCommandSettings`;

-- CreateTable
CREATE TABLE `CommandPattern` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `pattern` JSON NOT NULL,

    UNIQUE INDEX `CommandPattern_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContainerCommandPatternBinding` (
    `containerId` VARCHAR(191) NOT NULL,
    `patternName` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`containerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContainerCommandPatternBinding` ADD CONSTRAINT `ContainerCommandPatternBinding_patternName_fkey` FOREIGN KEY (`patternName`) REFERENCES `CommandPattern`(`name`) ON DELETE CASCADE ON UPDATE CASCADE;
