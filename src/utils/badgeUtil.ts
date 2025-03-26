import { createCanvas, loadImage } from "canvas";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import fetch from "node-fetch";

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function loadImageFromUrl(url: string) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return await loadImage(Buffer.from(buffer));
  }

export const generateUserBadge = async (userName: string): Promise<string> => {
  const width = 400;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Load a background image (Optional)
  const backgroundImage = await loadImage("https://ideaafricabucket.s3.eu-north-1.amazonaws.com/badge-template.png");
  ctx.drawImage(backgroundImage, 0, 0, width, height);

  // Draw text on the badge
  ctx.font = "bold 24px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`User: ${userName}`, 50, 120);

  // Save the badge as a file
  const filePath = path.join(__dirname, `${userName}-badge.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", async () => {
      try {
        // Upload to S3
        const fileStream = fs.createReadStream(filePath);
        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: `badges/${userName}-badge.png`,
          Body: fileStream,
          ContentType: "image/png",
        };
        await s3.send(new PutObjectCommand(uploadParams));

        // Get S3 file URL
        const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/badges/${userName}-badge.png`;

        // Delete local file after upload
        fs.unlinkSync(filePath);
        resolve(s3Url);
      } catch (err) {
        reject(err);
      }
    });

    out.on("error", reject);
  });
};
