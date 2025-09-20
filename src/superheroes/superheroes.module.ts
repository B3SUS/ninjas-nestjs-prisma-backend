import { Module } from '@nestjs/common';
import { SuperheroesService } from './superheroes.service';
import { SuperheroesController } from './superheroes.controller';
import { S3Module } from '../s3/s3.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [S3Module, DatabaseModule],
  controllers: [SuperheroesController],
  providers: [SuperheroesService],
})
export class SuperheroesModule {}
