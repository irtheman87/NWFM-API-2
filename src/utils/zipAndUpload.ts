import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const zipAndUploadFiles = async (files: Express.Multer.File[]): Promise<string | null> => {
  if (files.length === 0) return null;

  const zipFolderName = path.parse(files[0].originalname).name;
  const zipFilePath = path.join(__dirname, `../uploads/${zipFolderName}.zip`);

  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  for (const file of files) {
    archive.file(file.path, { name: file.originalname });
  }

  await archive.finalize();

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });

  const zipFileBuffer = fs.readFileSync(zipFilePath);
  const key = `zipped/${Date.now()}-${zipFolderName}.zip`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: zipFileBuffer,
    ContentType: 'application/zip',
  }));

  // Clean up local files
  for (const file of files) fs.unlinkSync(file.path);
  fs.unlinkSync(zipFilePath);

  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};
