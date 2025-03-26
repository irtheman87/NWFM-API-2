import express, { Request, Response } from "express";
import {generateUserBadge} from "../utils/badgeUtil";
import sendEmail from "../utils/sendEmail";
import cors from "cors"; // Import CORS
import multer from "multer";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import dotenv from "dotenv";

const upload = multer({ dest: "uploads/" }); // ✅ Define Multer here

let totalSent = 0;
let delivered = 0;
let failed = 0;

const router = express.Router();

// Route to generate a user badge
router.post("/generate-badge", async (req: Request, res: Response) => {
  try {
    const { userName, email } = req.body;

    if (!userName) {
      return res.status(400).json({ message: "User name is required" });
    }

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
    }

    // Generate badge and upload to S3
    const badgeUrl = await generateUserBadge(userName);

    // Send email with badge
    await sendEmail({
        to : email,
        subject: "Badge Generated",
        text: "Your badge has been generated successfully",
        html: `<img src="${badgeUrl}" alt="User Badge" />`,
    });

    return res.status(200).json({ message: "Badge created successfully", badgeUrl });
  } catch (error) {
    console.error("Error generating badge:", error);
    return res.status(500).json({ message: "Failed to generate badge" });
  }
});

// Upload CSV and process emails
router.post("/send-bulk-emails", upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ message: "CSV file is required" });
    }

    const filePath = path.join(__dirname, req.file.path);
    const users: { userName: string; email: string }[] = [];

    fs.createReadStream(filePath)
        .pipe(csvParser())
        .on("data", (row) => {
            if (row.userName && row.email) {
                users.push({ userName: row.userName.trim(), email: row.email.trim() });
            }
        })
        .on("end", async () => {
            fs.unlinkSync(filePath); // Delete temp file after reading

            totalSent = 0;
            delivered = 0;
            failed = 0;

            for (let i = 0; i < users.length; i++) {
                const { userName, email } = users[i];

                try {
                    const badgeUrl = await generateUserBadge(userName);

                    await sendEmail({
                        to: email,
                        subject: "Your Custom Badge",
                        text: `Hello ${userName}, your badge has been created!`,
                        html: `<p>Here is your badge:</p><img src="${badgeUrl}" alt="User Badge">`,
                    });

                    delivered++;
                } catch (error) {
                    console.error(`Failed to send to ${email}:`, error);
                    failed++;
                }

                totalSent++;
                if (i < users.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10-second delay
                }
            }

            res.json({ message: "Emails sent successfully", totalSent, delivered, failed });
        });
});

// API to get real-time stats
router.get("/email-stats", (req: Request, res: Response) => {
    res.json({ totalSent, delivered, failed });
});

module.exports = router;
