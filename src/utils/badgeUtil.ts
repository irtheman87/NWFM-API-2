import { createCanvas, loadImage, registerFont } from "canvas";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";

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

  registerFont(path.join(__dirname, "fonts/Avenir-Black.ttf"), {
    family: "Avenir Black",
  });

export const generateUserBadge = async (userName: string): Promise<string> => {
  const width = 1080 * 0.75;
  const height = 1350 * 0.75;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Load a background image (Optional)
  const backgroundImageURL = 'https://ideaafricabucket.s3.eu-north-1.amazonaws.com/NF+waitlist+badge+without+name.jpg';
//   const verificationIcon = await loadImage(verificationIconURL);
  const backgroundImage = await loadImage(backgroundImageURL);
  ctx.drawImage(backgroundImage, 0, 0, width, height);

  // Draw text on the badge
  ctx.font = "bold 110px Avenir Black";
  ctx.fillStyle = "#ffc000";
  ctx.fillText(`${userName}`, 120, 400);

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
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: `badges/${userName}-badge.png`,
          Body: fileStream,
          ContentType: "image/png",
        };
        await s3.send(new PutObjectCommand(uploadParams));

        // Get S3 file URL
        const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/badges/${userName}-badge.png`;

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
