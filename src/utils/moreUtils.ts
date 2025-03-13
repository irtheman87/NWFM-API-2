import multer from 'multer';
import path from 'path';
import fs from 'fs';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, GetObjectAclCommand} from '@aws-sdk/client-s3';

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

const localStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    },
  });
  
  export const uploadLocalFiles = multer({ storage: localStorage }).fields([
    { name: 'files', maxCount: 10 }
  ]);
  
  // Direct S3 upload for 'characterbible'
  const storage = multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || '',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    },
  });
  
  export const uploadCharacterBible = multer({ storage: storage }).fields([
    { name: 'characterbible', maxCount: 1 },
    { name: 'keyart', maxCount: 10 }
  ]);