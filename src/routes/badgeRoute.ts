import express, { Request, Response } from "express";
import {generateUserBadge} from "../utils/badgeUtil";
import sendEmail from "../utils/sendEmail";


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

module.exports = router;
