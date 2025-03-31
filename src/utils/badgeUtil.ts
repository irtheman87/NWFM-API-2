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
    const width = 1080;
    const height = 1350;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
  
    // Load a background image (Optional)
    const backgroundImageURL = 'https://ideaafricabucket.s3.eu-north-1.amazonaws.com/NF+waitlist+badge+without+name2.jpg';
    const backgroundImage = await loadImage(backgroundImageURL);
    ctx.drawImage(backgroundImage, 0, 0, width, height);
  
    // Format display name
    const nameParts = userName.split(" ");
    const displayName = nameParts.slice(0, 2).join(" ").toUpperCase(); // Take first two words & uppercase
  
    // Adjust font size based on length of `displayName`
    let fontSize = displayName.length > 17 ? 65 : displayName.length > 13 ? 80 : 105;
    ctx.font = `italic bold ${fontSize}px Avenir Black`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(displayName, 120, 410);
  
    // Generate unique filename using timestamp
    const timestamp = Date.now(); // Get current timestamp
    const uniqueFileName = `${userName.replace(/\s+/g, "_")}-${timestamp}-badge.png`;
    const filePath = path.join(__dirname, uniqueFileName);
  
    // Save the badge as a file
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
  
    return new Promise((resolve, reject) => {
      out.on("finish", async () => {
        try {
          // Upload to S3 with unique filename
          const fileStream = fs.createReadStream(filePath);
          const uploadParams = {
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: `badges/${uniqueFileName}`, // Use unique filename
            Body: fileStream,
            ContentType: "image/png",
          };
          await s3.send(new PutObjectCommand(uploadParams));
  
          // Get S3 file URL
          const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/badges/${uniqueFileName}`;
  
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
  
