import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Inject,
    UseInterceptors,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import {SuperheroesService} from './superheroes.service';
import { CreateSuperheroDto } from './dto/create-superhero.dto';
import { UpdateSuperheroDto } from './dto/update-superhero.dto';
import {FilesInterceptor} from "@nestjs/platform-express";
import {S3Client, PutObjectCommand} from "@aws-sdk/client-s3";
import * as process from "process";
import { DatabaseService } from "../database/database.service";
import { memoryStorage } from "multer";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Prisma } from "@prisma/client";

@Controller('superheroes')
export class SuperheroesController {
    constructor(
        private readonly superheroesService: SuperheroesService,
        private readonly databaseService: DatabaseService,
        @Inject("S3_CLIENT") private s3: S3Client,
    ) {}

    private readonly MAX_IMAGE_BYTES = 2 * 1024 * 1024;

    @Post()
    @UseInterceptors(FilesInterceptor("files", 10, { storage: memoryStorage() }))
    async create(@Body() createSuperheroDto: CreateSuperheroDto, @UploadedFiles() files?: Express.Multer.File[]) {
        const created = await this.superheroesService.create(createSuperheroDto);
        if (files && files.length > 0) {
            this.assertMaxSize(files);
            await this.uploadFilesForHero(created.id, files);
        }
        return this.superheroesService.findOne(created.id);
    }

    @Post(":id/images")
    @UseInterceptors(FilesInterceptor("files", 10, { storage: memoryStorage() }))
    async uploadImages(@Param("id") id: string, @UploadedFiles() files: Express.Multer.File[]) {
        const bucket = process.env.R2_BUCKET!;
        if (!files || files.length === 0) {
            throw new BadRequestException("No files uploaded");
        }
        this.assertMaxSize(files);
        const uploaded: { id: number; url: string }[] = [];

        for (const [index, file] of files.entries()) {
            const key = `heroes/${id}/${Date.now()}-${file.originalname}`;

            await this.s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                })
            );

            const url = `${process.env.R2_PUBLIC_URL}/${key}`;
            const created = await this.databaseService.superheroImage.create({
                data: {
                    url,
                    order: index as unknown as number,
                    Superhero: { connect: { id: Number(id) } },
                } as Prisma.SuperheroImageCreateInput,
            });
            uploaded.push({ id: created.id, url: created.url });
        }
        return uploaded;
    }

    private async uploadFilesForHero(id: number, files: Express.Multer.File[]) {
        const bucket = process.env.R2_BUCKET!;
        for (const [index, file] of files.entries()) {
            const key = `heroes/${id}/${Date.now()}-${file.originalname}`;
            await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
            const url = `${process.env.R2_PUBLIC_URL}/${key}`;
            await this.databaseService.superheroImage.create({
                data: {
                    url,
                    order: index as unknown as number,
                    Superhero: { connect: { id: Number(id) } },
                } as Prisma.SuperheroImageCreateInput,
            });
        }
    }

    // Get All
    @Get()
    findAll() {
        return this.superheroesService.findAll();
    }

    // Get One by id
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.superheroesService.findOne(+id);
    }

    // Updates Hero`s info by id
    @Patch(':id')
    @UseInterceptors(FilesInterceptor("files", 10, { storage: memoryStorage() }))
    async update(
        @Param('id') id: string,
        @Body() updateSuperheroDto: UpdateSuperheroDto | any,
        @UploadedFiles() files?: Express.Multer.File[],
    ) {
        // allow removeImageIds to arrive as JSON string or array
        if (typeof updateSuperheroDto.removeImageIds === 'string') {
            try {
                updateSuperheroDto.removeImageIds = JSON.parse(updateSuperheroDto.removeImageIds);
            } catch {}
        }

        // Delete selected images from R2 as well as DB
        if (Array.isArray(updateSuperheroDto.removeImageIds) && updateSuperheroDto.removeImageIds.length > 0) {
            const images = await this.databaseService.superheroImage.findMany({
                where: { id: { in: updateSuperheroDto.removeImageIds }, superheroId: Number(id) },
            });
            for (const img of images) {
                const key = this.extractKeyFromPublicUrl(img.url);
                if (key) {
                    await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
                }
            }
        }

        await this.superheroesService.update(+id, updateSuperheroDto);
        if (files && files.length > 0) {
            this.assertMaxSize(files);
            await this.uploadFilesForHero(+id, files);
        }

        return this.superheroesService.findOne(+id);
    }

    // Delete by Id
    @Delete(':id')
    async remove(@Param('id') id: string) {
        const hero = await this.superheroesService.findOne(+id);
        if (hero?.images?.length) {
            for (const img of hero.images) {
                const key = this.extractKeyFromPublicUrl(img.url);
                if (key) {
                    await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
                }
            }
        }
        return this.superheroesService.remove(+id);
    }

    private extractKeyFromPublicUrl(url: string): string | null {
        const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
        if (!base) return null;
        const prefix = base + '/';
        return url.startsWith(prefix) ? url.slice(prefix.length) : null;
    }

    // Ensures image size < 2Mb
    private assertMaxSize(files: Express.Multer.File[]): void {
        const tooLarge = files.filter(f => (f.size ?? 0) > this.MAX_IMAGE_BYTES);
        if (tooLarge.length > 0) {
            throw new BadRequestException(`Each file must be 2MB or smaller`);
        }
    }
}
