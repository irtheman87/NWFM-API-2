import express, { Request, Response } from "express";
import {generateUserBadge} from "../utils/badgeUtil";
import sendEmail from "../utils/sendEmail";
import cors from "cors"; // Import CORS
import multer from "multer";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import dotenv from "dotenv";

const uploadDir = path.join(__dirname, "..", "..", "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir }); 

let totalSent = 0;
let delivered = 0;
let failed = 0;

const router = express.Router();

router.post("/send-bulk-emails", upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ message: "CSV file is required" });
    }

    const filePath = req.file.path;
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
                        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>One Strip Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff; color: #000000;">

  <!-- Main Container -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="700" cellspacing="0" cellpadding="0" border="0" style="max-width: 700px; width: 100%; border: 1px solid #ccc;">
          
          <!-- Header with Image -->
          <tr>
            <td align="center" style="background-color: #000;">
              <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/email_header2.jpg" alt="Header Image" width="700" style="display: block; max-width: 100%; height: auto;">
            </td>
          </tr>

          <!-- Header Buttons -->
          <tr>
            <td align="center" style="padding: 15px;">
              <a href="https://nollywoodfilmmaker.com/get-started" style="display: inline-block; background-color: #ffd700; color: #000; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-right: 10px;">Get Started</a>
              <a href="https://www.youtube.com/playlist?list=PL9Rc2I3KoJiiNUO3zv9o161C3u-rDd5cp" style="display: inline-block; background-color: #ffd700; color: #000; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Watch Tutorials</a>
            </td>
          </tr>

          <!-- Service Cards (8 Cards) -->
          <tr>
            <td align="center" style="padding: 10px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                
                <!-- Row 1 -->
                <tr>
                  <td style="padding: 15px; background-color: #FAE6D4;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/chat+with+a+pro.png" alt="Chat with a Pro" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/get-started/chat" style="color: #000; text-decoration: underline;">Chat with a Professional</a></strong></p>
                    <p>Book a one-on-one session with an industry expert.</p>
                  </td>
                  <td style="padding: 15px; background-color: #E6DDF1;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/read+my+script.png" alt="Read my Script" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/read-my-script" style="color: #000; text-decoration: underline;">Read My Script</a></strong></p>
                    <p>Get expert feedback to improve your script.</p>
                  </td>
                </tr>

                <!-- Row 2 -->
                <tr>
                  <td style="padding: 15px; background-color: #D4F0F4;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/prepare+for+funding.png" alt="Prepare for Funding" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/funding" style="color: #000; text-decoration: underline;">Prepare for Funding</a></strong></p>
                    <p>Package your film for funding success.</p>
                  </td>
                  <td style="padding: 15px; background-color: #F4E6D4;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/verified+crew.png" alt="Verified Crew" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/verified-crew" style="color: #000; text-decoration: underline;">Verified Crew</a></strong></p>
                    <p>Hire top professionals for your project.</p>
                  </td>
                </tr>

                <!-- Row 3 -->
                <tr>
                  <td style="padding: 15px; background-color: #E6F4D4;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/film+distribution.png" alt="Film Distribution" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/distribution" style="color: #000; text-decoration: underline;">Film Distribution</a></strong></p>
                    <p>Find the right channels for your film.</p>
                  </td>
                  <td style="padding: 15px; background-color: #F0D4E6;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/legal+contracts.png" alt="Legal Contracts" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/legal-contracts" style="color: #000; text-decoration: underline;">Legal Contracts</a></strong></p>
                    <p>Get professionally drafted contracts.</p>
                  </td>
                </tr>

                <!-- Row 4 -->
                <tr>
                  <td style="padding: 15px; background-color: #D4E6F4;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/script+breakdown.png" alt="Script Breakdown" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/script-breakdown" style="color: #000; text-decoration: underline;">Script Breakdown</a></strong></p>
                    <p>Plan every scene with precision.</p>
                  </td>
                  <td style="padding: 15px; background-color: #F4D4E6;">
                    <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/budgeting+and+scheduling.png" alt="Budgeting & Scheduling" width="60">
                    <p><strong><a href="https://nollywoodfilmmaker.com/services/budgeting" style="color: #000; text-decoration: underline;">Budgeting & Scheduling</a></strong></p>
                    <p>Stay on track and on budget.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Badge Section -->
 <div class="badge-section">
      <div class="badge-box">
        <p><strong><a href="${badgeUrl}">SAVE AND SHARE THESE WORDS OF AFFIRMATION</a></strong></p>
        <img src="${badgeUrl}" alt="Cool Badge" />
      </div>
    </div>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`,
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

// API to get real-time stats
router.get("/email-stats", (req: Request, res: Response) => {
    res.json({ totalSent, delivered, failed });
});

module.exports = router;
