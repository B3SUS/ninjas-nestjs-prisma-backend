import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { SuperheroesModule } from './superheroes/superheroes.module';

@Module({
  imports: [DatabaseModule, SuperheroesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
