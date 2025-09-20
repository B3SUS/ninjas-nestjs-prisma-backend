import {Injectable, BadRequestException} from '@nestjs/common';
import {UpdateSuperheroDto} from './dto/update-superhero.dto';
import {DatabaseService} from "../database/database.service";
import {Prisma} from "@prisma/client";

@Injectable()
export class SuperheroesService {

    constructor(private readonly databaseService: DatabaseService) {
    }

    // create superhero
    async create(createSuperheroDto: Prisma.SuperheroCreateInput) {
        return this.databaseService.superhero.create({
            data: createSuperheroDto
        })
    }

    // return all superheroes and take only first image with highest order
    findAll() {
        return this.databaseService.superhero.findMany({
            include: {
                images: {
                    orderBy: { order: 'asc' as const },
                    take: 1
                }
            }
        });
    }

    // return exact superhero taking all images
    findOne(id: number) {
        return this.databaseService.superhero.findUnique({
            where: {
                id
            },
            include: {
                images: { orderBy: { order: 'asc' as const } }
            }
        })
    }

    async update(id: number, updateSuperheroDto: UpdateSuperheroDto) {
        const { removeImageIds, imageOrders, ...data } = updateSuperheroDto as any;

        // delete selected images if requested
        if (removeImageIds && Array.isArray(removeImageIds) && removeImageIds.length > 0) {
            // Ensure images belong to this superhero
            const images = await this.databaseService.superheroImage.findMany({
                where: { id: { in: removeImageIds }, superheroId: id },
                select: { id: true },
            });

            if (images.length !== removeImageIds.length) {
                throw new BadRequestException('Some images do not belong to this superhero');
            }

            await this.databaseService.superheroImage.deleteMany({
                where: { id: { in: removeImageIds }, superheroId: id },
            });
        }

        // Update image orders if provided
        if (imageOrders && Array.isArray(imageOrders) && imageOrders.length > 0) {
            // Verify all images belong to this superhero
            const imageIds = imageOrders.map(item => item.id);
            const images = await this.databaseService.superheroImage.findMany({
                where: { id: { in: imageIds }, superheroId: id },
                select: { id: true },
            });

            if (images.length !== imageIds.length) {
                throw new BadRequestException('Some images do not belong to this superhero');
            }

            // Update each image's order
            for (const { id: imageId, order } of imageOrders) {
                await this.databaseService.superheroImage.update({
                    where: { id: imageId },
                    data: { order },
                });
            }
        }

        return this.databaseService.superhero.update({
            where: { id },
            data: data as Prisma.SuperheroUpdateInput,
        });
    }

    remove(id: number) {
        return this.databaseService.superhero.delete({
            where: {
                id,
            }
        })
    }
}
