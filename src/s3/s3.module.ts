import { Module } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";

@Module({
    providers: [
        {
            provide: "S3_CLIENT",
            useFactory: () =>
                new S3Client({
                    region: "auto",
                    endpoint: process.env.R2_ENDPOINT,
                    credentials: {
                        accessKeyId: process.env.R2_ACCESS_KEY!,
                        secretAccessKey: process.env.R2_SECRET_KEY!,
                    },
                }),
        },
    ],
    exports: ["S3_CLIENT"],
})
export class S3Module {}
