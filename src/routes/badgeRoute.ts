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
  <style>
    /* Reset margins and prevent horizontal scroll */
    html, body {
      margin: 0;
      padding: 0;
      overflow-x: hidden;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      background-color: #ffffff;
      color: #000000;
    }
    .container {
      width: 100%;
      max-width: 700px;
      margin: 0 auto;
      border: 1px solid #ccc;
    }
    .header {
      background-image: url('https://ideaafricabucket.s3.eu-north-1.amazonaws.com/email_header2.jpg?auto=format&fit=crop&w=1400&q=80');
      background-size: cover;
      background-position: center;
      position: relative;
      height: 14rem;
      color: #ffffff;
      padding: 0;
    }
    /* Mobile adjustment for header background */
    @media (max-width: 600px) {
      .header {
        /* Use contain to ensure the full image is visible */
        background-size: contain;
        background-repeat: no-repeat;
        height: auto;
        min-height: 14rem; /* Ensures header remains visible */
      }
    }
    .header .title {
      font-size: 2rem;
      font-weight: bold;
      position: absolute;
      top: 1rem;
      left: 1rem;
    }
    .header-buttons {
      position: absolute;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-wrap: nowrap; /* force buttons to remain on one line */
      justify-content: space-between;
      gap: 0.5rem;
      width: 90%;  /* adjust container width as needed */
      max-width: 500px;
    }
    .header-buttons a {
      background-color: #ffd700;
      color: #000;
      padding: 0.6rem 1rem;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
      text-align: center;
      flex: 1;
      min-width: 120px;
    }
    /* For desktop, increase button min-width so text stays on one line */
    @media (min-width: 601px) {
      .header-buttons a {
        min-width: 200px;
      }
    }
    .grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      padding: 0;
      margin-bottom: 0; /* Remove extra margin at bottom of grid */
    }
    .card {
      width: 100%;
      max-width: 320px;
      padding: 1rem;
      margin-bottom: 0.5rem;
      box-sizing: border-box;
      display: flex;
      align-items: flex-start;
      border-radius: 8px;
    }
    .thumb-img {
      width: 30%;
      height: 60px;
      margin-right: 1rem;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .card-text {
      width: 70%;
    }
    .card-title {
      font-weight: bold;
      margin-bottom: 0.5rem;
    }
    .card-body {
      font-size: 0.9rem;
      line-height: 1.4;
    }
    .badge-section {
      width: 100%;
      text-align: center;
      margin-top: 0; /* Remove extra space above badge-section */
    }
    .badge-box {
      width: 100%;
      color: #000000;
      font-size: 1.1rem;
    }
    /* Ensure images fit within their containers */
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .badge-box img {
      width: auto;
      height: auto;
      max-width: 100%;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title"></div>
      <div class="header-buttons">
        <a href="https://nollywoodfilmmaker.com/get-started">Get Started</a>
        <a href="https://www.youtube.com/playlist?list=PL9Rc2I3KoJiiNUO3zv9o161C3u-rDd5cp">Watch Tutorials</a>
      </div>
    </div>

    <h1 style="text-align: center; margin-top: 1rem;">Hello ${userName},</h1>

    <div class="grid">
      <div class="card" style="background-color: #FAE6D4">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/chat+with+a+pro.png"></div>
        <div class="card-text">
          <div class="card-title"><a href="https://nollywoodfilmmaker.com/get-started/chat" style="color: inherit; text-decoration: underline;">Chat with a Professional</a></div>
          <div class="card-body">Book a one-on-one session with an industry expert to get guidance, access verified crew, or troubleshoot any part of your filmmaking process.</div>
        </div>
      </div>
      <div class="card" style="background-color: #E6DDF1">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/read+my+script.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/read-my-script" style="color: inherit; text-decoration: underline;">Read my Script and advise</a></div>
          <div class="card-body">Get professional feedback on your script to improve story, structure, and production readiness.</div>
        </div>
      </div>
      <div class="card" style="background-color: #DCE8F6">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/watch+my+film.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/watch-final-cut" style="color: inherit; text-decoration: underline;">Watch my Film and advise</a></div>
          <div class="card-body">Receive expert notes on your film edit at different stages, from pacing to clarity and overall impact.</div>
        </div>
      </div>
      <div class="card" style="background-color: #FFF7D4">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/create+pitch+deck.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/create-pitch-deckt" style="color: inherit; text-decoration: underline;">Create my Pitch Deck</a></div>
          <div class="card-body">Let professionals craft a compelling pitch deck to present your project to investors or collaborators.</div>
        </div>
      </div>
      <div class="card" style="background-color: #E9F6D0">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/create+film+budget.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/production-budget" style="color: inherit; text-decoration: underline;">Create my Film Budget</a></div>
          <div class="card-body">Get a detailed, flexible and realistic budget tailored to your film’s scope and resources.</div>
        </div>
      </div>
      <div class="card" style="background-color: #e5f8fc">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/create+trailer.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/trailers" style="color: inherit; text-decoration: underline;">Create my Film Trailers</a></div>
          <div class="card-body">Create an amazing Teaser and Trailer suitable for all social media platforms and displays.</div>
        </div>
      </div>
      <div class="card" style="background-color: #EFE2F9">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/create+schedule.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/create-movie-schedule" style="color: inherit; text-decoration: underline;">Create my Film Schedule</a></div>
          <div class="card-body">Receive a professional shooting schedule that keeps your production organized and on track.</div>
        </div>
      </div>
      <div class="card" style="background-color: #FFE9D6">
        <div class="thumb-img"><img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/create+legal.png"></div>
        <div class="card-text">
            <div class="card-title"><a href="https://nollywoodfilmmaker.com/services/draft-legal-documents" style="color: inherit; text-decoration: underline;">Create my Legal Docs</a></div>
          <div class="card-body">Access essential legal documents—customized for your film project—to protect your work and team.</div>
        </div>
      </div>
    </div>

    <div class="badge-section">
      <div class="badge-box">
        <p><strong><a href="${badgeUrl}">SAVE AND SHARE THESE WORDS OF AFFIRMATION</a></strong></p>
        <img src="${badgeUrl}" alt="Cool Badge" />
      </div>
    </div>
  </div>
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
