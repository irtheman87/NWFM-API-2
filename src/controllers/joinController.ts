import { Request, Response } from "express";
import Crew from "../models/Crew";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import Company from "../models/Company";
import CrewCompany from "../models/CrewCompany";
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import mongoose from "mongoose";
import sendEmail from "../utils/sendEmail";

import EmailList from "../models/EmailList";

// Initialize S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Configure multer-S3 for file uploads
const storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME || "",
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

// Configure Multer for handling multiple file fields
const upload = multer({ storage }).fields([
  { name: "file", maxCount: 1},
  { name: "doc", maxCount: 1 },
  { name: "rateCard", maxCount: 1 },
]);

const multerMiddleware = multer().none();

// Create Crew Member Function
export const createCrewMember = async (req: Request, res: Response) => {
  try {
    // Use Multer to handle file uploads
    upload(req, res, async function (err) {
      if (err) {
        return res.status(500).json({
          message: "Error uploading files to S3",
          error: err.message,
        });
      }

      // Extract files from request
      const files = req.files as {
        [fieldname: string]: Express.MulterS3.File[];
      };

      // Validate required files
      if (!files?.file?.[0] || !files?.doc?.[0]) {
        return res.status(400).json({
          message: "Both profile picture and document are required.",
        });
      }

      const profilePic = files.file[0].location;
      const document = files.doc[0].location;

      const {
        firstName,
        lastName,
        email,
        userId,
        mobile,
        dob,
        bio,
        department,
        role,
        works,
        fee,
        location,
        verificationDocType,
        idNumber,
      } = req.body;

      // Validate required fields
      if (
        !firstName ||
        !lastName ||
        !email ||
        !userId ||
        !mobile ||
        !dob ||
        !department ||
        !role ||
        !verificationDocType ||
        !idNumber
      ) {
        return res
          .status(400)
          .json({ message: "All required fields must be provided." });
      }

      // Create a new Crew instance
      const newCrew = new Crew({
        firstName,
        lastName,
        email,
        userId,
        mobile,
        dob,
        bio,
        propic: profilePic,
        department,
        role,
        works,
        fee,
        location,
        verificationDocType,
        document,
        idNumber,
        apiVetting: false,
        verified: false,
      });

      // Save Crew to the database
      const savedCrew = await newCrew.save();

      try {
        await sendEmail({
          to: email,
          subject: 'Welcome to the Nollywood Filmmaker Database – Verification in Progress',
          text: `Dear ${firstName} ${lastName},
                 Thank you for joining the Nollywood Filmmaker Database, the most comprehensive network of industry professionals dedicated to connecting talent and opportunities.
                 We have received your submission, and our team is currently reviewing your documents as part of the verification process. You will be notified once your profile has been successfully verified.
                 As a member of this database, you’ll be positioned to connect with filmmakers seeking your expertise. Our goal is to make it easier for industry professionals like you to collaborate and thrive in Nollywood.
                 We look forward to having you as part of this growing community!
                 Best,
                 Nollywood Filmmaker Database
          `,
          html: `
          <!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Nollywood Filmmaker Database</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f4f4;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 600px;
      background: #ffffff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      margin: auto;
    }
    .header img {
      width: 100%;
      max-width: 600px;
      border-radius: 8px;
    }
    h1 {
      color: #333;
    }
    p {
      font-size: 16px;
      line-height: 1.5;
    }
    .footer {
      margin-top: 20px;
      font-size: 14px;
      color: #777;
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="header">
      <a href="https://nollywoodfilmmaker.com">
        <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
             alt="Nollywood Filmmaker Database">
      </a>
    </div>

    <h1>Hello ${firstName} ${lastName},</h1>

    <p>Dear ${firstName},</p>

    <p>Thank you for joining the <strong>Nollywood Filmmaker Database</strong>, the most comprehensive network of industry professionals dedicated to connecting talent and opportunities.</p>

    <p>We have received your submission, and our team is currently reviewing your documents as part of the verification process. You will be notified once your profile has been successfully verified.</p>

    <p>As a member of this database, you’ll be positioned to connect with filmmakers seeking your expertise. Our goal is to make it easier for industry professionals like you to collaborate and thrive in Nollywood.</p>

    <p>We look forward to having you as part of this growing community!</p>

    <p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
  </div>

</body>
</html>

          `,
        });

        console.log('Email sent successfully.');

        return res
          .status(201)
          .json({ message: "Crew member created successfully.", data: savedCrew });

      } catch (emailError) {
        console.error("Error sending email:", emailError);
        return res
          .status(500)
          .json({ message: "Crew member created, but email notification failed.", data: savedCrew });
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "An error occurred.", error: error });
  }
};



// Create Company Function
export const createCompany = async (req: Request, res: Response) => {
  try {
    // Use Multer to handle file uploads
    upload(req, res, async (err) => {
      if (err) {
        return res.status(500).json({
          message: "Error uploading files to S3",
          error: err.message,
        });
      }

      // Extract files from request
      const files = req.files as {
        [fieldname: string]: Express.MulterS3.File[];
      };

      // Validate required files
      if (!files?.file?.[0]?.location || !files?.doc?.[0]?.location) {
        return res.status(400).json({
          message: "Both profile picture and document are required.",
        });
      }

      const profilePic = files.file[0].location;
      const document = files.doc[0].location;

      let rateCard = "";
      const {
        name,
        email,
        userId,
        mobile,
        website,
        bio,
        type,
        clientele,
        useRateCard,
        fee,
        location,
        verificationDocType,
        idNumber,
        cacNumber,
      } = req.body;

      // Validate useRateCard and check for the rate card file if required
      if (useRateCard === "true") {
        if (!files?.rateCard?.[0]?.location) {
          return res
            .status(400)
            .json({ message: "Rate card file is required when useRateCard is true." });
        }
        rateCard = files.rateCard[0].location;
      }

      // Validate required fields
      if (
        !name ||
        !email ||
        !userId ||
        !mobile ||
        !type ||
        !verificationDocType ||
        !idNumber ||
        !cacNumber
      ) {
        return res.status(400).json({ message: "All required fields must be provided." });
      }

      // Create a new Company instance
      const newCompany = new Company({
        name,
        email,
        userId,
        mobile,
        website,
        bio,
        propic: profilePic,
        type,
        clientele,
        useRateCard,
        rateCard,
        fee,
        location,
        verificationDocType,
        document,
        idNumber,
        cacNumber,
        apiVetting: false,
        verified: false,
      });

      // Save Company to the database
      const savedCompany = await newCompany.save();

      try {
        await sendEmail({
          to: email,
          subject: 'Welcome to the Nollywood Filmmaker Database – Verification in Progress',
          text: `Dear ${name},

                 Thank you for joining the Nollywood Filmmaker Database, the most comprehensive network of industry professionals dedicated to connecting talent and opportunities.
                 We have received your submission, and our team is currently reviewing your documents as part of the verification process. You will be notified once your profile has been successfully verified.
                 As a member of this database, you’ll be positioned to connect with filmmakers seeking your expertise. Our goal is to make it easier for industry professionals like you to collaborate and thrive in Nollywood.
                 We look forward to having you as part of this growing community!
                 Best,
                 Nollywood Filmmaker Database
          `,
          html: `
          <!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Nollywood Filmmaker Database</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f4f4;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 600px;
      background: #ffffff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      margin: auto;
    }
    .header img {
      width: 100%;
      max-width: 600px;
      border-radius: 8px;
    }
    h1 {
      color: #333;
    }
    p {
      font-size: 16px;
      line-height: 1.5;
    }
    .footer {
      margin-top: 20px;
      font-size: 14px;
      color: #777;
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="header">
      <a href="https://nollywoodfilmmaker.com">
        <img src="https://ideaafricabucket.s3.eu-north-1.amazonaws.com/nwfm_header_image.jpg" 
             alt="Nollywood Filmmaker Database">
      </a>
    </div>

    <h1>Hello ${name},</h1>

    <p>Dear ${name},</p>

    <p>Thank you for joining the <strong>Nollywood Filmmaker Database</strong>, the most comprehensive network of industry professionals dedicated to connecting talent and opportunities.</p>

    <p>We have received your submission, and our team is currently reviewing your documents as part of the verification process. You will be notified once your profile has been successfully verified.</p>

    <p>As a member of this database, you’ll be positioned to connect with filmmakers seeking your expertise. Our goal is to make it easier for industry professionals like you to collaborate and thrive in Nollywood.</p>

    <p>We look forward to having you as part of this growing community!</p>

    <p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
  </div>

</body>
</html>
          `,
        });

        console.log("Email sent successfully.");

        return res.status(201).json({ 
          message: "Company created successfully.", 
          data: savedCompany 
        });

      } catch (emailError) {
        console.error("Error sending email:", emailError);
        return res.status(500).json({ 
          message: "Company created, but email notification failed.", 
          data: savedCompany 
        });
      }
    });

  } catch (error) {
    console.error("Error in createCompany:", error);
    return res.status(500).json({ message: "An error occurred.", error });
  }
};


export const createCrewCompany = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Validate request body
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check if email or username already exists
    const existingUser = await CrewCompany.findOne({ 
      $or: [{ username }, { email }] 
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Username or email already exists." });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new CrewCompany
    const newCrewCompany = new CrewCompany({
      username,
      email,
      password: hashedPassword,
    });

    // Save to the database
    const savedCrewCompany = await newCrewCompany.save();

    await sendEmail({
      to: email,
      subject: "You Joined Our Database",
      text: `Thanks ${username} for joining our database.`,
      html: `<p>Thanks <strong>${username}</strong> for joining our database.</p>`,
    });
    

    // Respond with success
    return res.status(201).json({
      message: "CrewCompany created successfully.",
      crewCompany: {
        id: savedCrewCompany._id,
        username: savedCrewCompany.username,
        email: savedCrewCompany.email,
      },
    });
  } catch (error) {
    console.error("Error creating CrewCompany:", error);
    return res.status(500).json({ message: "Internal server error.", error });
  }
};

export const loginCrewCompany = async (req: Request, res: Response) => {
  try {
    const { usernameOrEmail, password } = req.body;

    // Validate request body
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: "Username/Email and password are required." });
    }

    // Find the CrewCompany by username or email
    const crewCompany = await CrewCompany.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!crewCompany) {
      return res.status(401).json({ message: "Invalid username/email or password." });
    }

    // Compare the password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, crewCompany.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid username/email or password." });
    }

    // Generate a JWT token
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret key is not configured." });
    }

    const token = jwt.sign(
      { id: crewCompany._id, username: crewCompany.username },
      JWT_SECRET,
      { expiresIn: "1h" } // Token expires in 1 hour
    );

    // Check if the user exists in Crew or Company collections and get their verified status
    const crew = await Crew.findOne({ userId: crewCompany._id });
    const company = await Company.findOne({ userId: crewCompany._id });

    // Ensure verified is always a boolean
    const verified = crew?.verified ?? company?.verified ?? false;

    // Respond with the token and verification status
    return res.status(200).json({
      message: "Login successful.",
      token,
      crewCompany: {
        id: crewCompany._id,
        username: crewCompany.username,
        email: crewCompany.email,
        verified, // Always returns a boolean
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ message: "Internal server error.", error });
  }
};


export const getCrewById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;

    // Validate the provided ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID provided" });
    }

    // Fetch the user's email via their ID
    const user = await CrewCompany.findById(id).exec();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { email } = user;

    // Fetch the crew member using their email
    const crew = await Crew.findOne({ email }).exec();
    if (!crew) {
      return res.status(404).json({ message: "Crew member not found" });
    }

    // Return the crew member details
    return res.status(200).json({
      message: "Crew member fetched successfully",
      crew,
    });
  } catch (error) {
    console.error("Error fetching crew member:", error);
    return res.status(500).json({
      message: "Failed to fetch crew member",
      error: error,
    });
  }
};


export const getCompanyById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;

    // Validate the provided ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID provided" });
    }

    // Fetch the company email using its ID
    const companyRecord = await CrewCompany.findById(id).exec();
    if (!companyRecord) {
      return res.status(404).json({ message: "Company not found" });
    }

    const { email } = companyRecord;

    // Fetch the company details using the email
    const company = await Company.findOne({ email }).exec();
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Return the company details
    return res.status(200).json({
      message: "Company fetched successfully",
      company,
    });
  } catch (error) {
    console.error("Error fetching company:", error);
    return res.status(500).json({
      message: "Failed to fetch company",
      error: error,
    });
  }
};


export const updateCompanyDetails = async (req: Request, res: Response): Promise<Response> => {
  // Use the middleware to handle multipart/form-data (file uploads and form fields)
  return new Promise((resolve) => {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(500).json({
          message: "Error uploading files.",
          error: err.message,
        });
      }

      try {
        const { userId } = req.body; // Parse userId from form-data
        console.log(req.body);

        if (!userId) {
          return res.status(400).json({ message: "User ID is required to update company details." });
        }

        // Allowed fields for update (excluding rateCard, which is handled separately as a file)
        const allowedUpdates = [
          "mobile",
          "website",
          "bio",
          "clientele",
          "useRateCard",
          "fee",
          "location",
        ];

        // Extract only the allowed fields from req.body
        const updates = Object.keys(req.body).reduce((acc, key) => {
          if (allowedUpdates.includes(key)) {
            acc[key] = req.body[key];
          }
          return acc;
        }, {} as { [key: string]: any });

        // Extract files
        const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };

        // Ensure there is a file for the rateCard (if required)
        if (files && files['rateCard'] && files['rateCard'].length > 0) {
          const rateCard = files['rateCard'][0]?.location;
          if (rateCard) {
            updates['rateCard'] = rateCard; // Assuming S3 and multer for uploading
          }
        }

        // Ensure valid fields are provided
        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ message: "No valid fields provided for update." });
        }

        // Update company details by userId
        const company = await Company.findOneAndUpdate({ userId }, updates, {
          new: true, // Return the updated document
          runValidators: true, // Apply validation rules
        });

        if (!company) {
          return res.status(404).json({ message: "Company not found or invalid userId." });
        }

        return res.status(200).json({
          message: "Company details updated successfully.",
          company,
        });

      } catch (error) {
        console.error("Error updating company details:", error);
        return res.status(500).json({
          message: "An error occurred while updating company details.",
          error: error,
        });
      }
    });
  });
};

export const updateCrewDetails = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required to update crew details." });
    }

    // Define fields allowed for updates
    const allowedUpdates = [
      "firstName",
      "lastName",
      "mobile",
      "dob",
      "bio",
      "department",
      "role",
      "works",
      "fee",
      "location",
    ];

    // Extract allowed fields from the request body
    const updates = Object.keys(req.body).reduce((acc, key) => {
      if (allowedUpdates.includes(key)) {
        acc[key] = req.body[key];
      }
      return acc;
    }, {} as { [key: string]: any });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update." });
    }

    // Find the crew member and update the allowed fields
    const crew = await Crew.findOneAndUpdate({ userId }, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validation rules are applied
    });

    if (!crew) {
      return res.status(404).json({ message: "Crew member not found or invalid userId." });
    }

    return res.status(200).json({
      message: "Crew details updated successfully.",
      crew,
    });
  } catch (error) {
    console.error("Error updating crew details:", error);
    return res.status(500).json({
      message: "An error occurred while updating crew details.",
      error: error,
    });
  }
};

export const updateCompanyProfilePicture = async (req: Request, res: Response) => {
  try {
    // Use Multer-S3 middleware to process the incoming files
    upload(req, res, async (err) => {
      if (err) {
        return res.status(500).json({
          message: "Error uploading files to S3.",
          error: err.message,
        });
      }

      // Extract userId from `req.body`
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required to update the profile picture." });
      }

      // Extract uploaded files from the request
      const files = req.files as {
        [fieldname: string]: Express.MulterS3.File[];
      };

      // Validate profile picture file
      if (!files?.file || files.file.length === 0) {
        return res.status(400).json({ message: "Profile picture file is required." });
      }

      // Get the file location URL from S3
      const profilePic = files.file[0]?.location;

      if (!profilePic) {
        return res.status(400).json({ message: "Unable to retrieve uploaded profile picture location." });
      }

      // Update the crew member's profile picture
      const company = await Company.findOneAndUpdate(
        { userId },
        { propic: profilePic },
        { new: true, runValidators: true }
      );

      if (!company) {
        return res.status(404).json({ message: "Company not found or invalid userId." });
      }

      return res.status(200).json({
        message: "Profile picture updated successfully.",
        company,
      });
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    return res.status(500).json({
      message: "An error occurred while updating the profile picture.",
      error: error,
    });
  }
};

export const updateProfilePicture = async (req: Request, res: Response) => {
  try {
    // Use Multer-S3 middleware to process the incoming files
    upload(req, res, async (err) => {
      if (err) {
        return res.status(500).json({
          message: "Error uploading files to S3.",
          error: err.message,
        });
      }

      // Extract userId from `req.body`
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required to update the profile picture." });
      }

      // Extract uploaded files from the request
      const files = req.files as {
        [fieldname: string]: Express.MulterS3.File[];
      };

      // Validate profile picture file
      if (!files?.file || files.file.length === 0) {
        return res.status(400).json({ message: "Profile picture file is required." });
      }

      // Get the file location URL from S3
      const profilePic = files.file[0]?.location;

      if (!profilePic) {
        return res.status(400).json({ message: "Unable to retrieve uploaded profile picture location." });
      }

      // Update the crew member's profile picture
      const crew = await Crew.findOneAndUpdate(
        { userId },
        { propic: profilePic },
        { new: true, runValidators: true }
      );

      if (!crew) {
        return res.status(404).json({ message: "Crew member not found or invalid userId." });
      }

      return res.status(200).json({
        message: "Profile picture updated successfully.",
        crew,
      });
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    return res.status(500).json({
      message: "An error occurred while updating the profile picture.",
      error: error,
    });
  }
};


export const addEmailToList = async (req: Request, res: Response) => {
  const { name, email } = req.body;

  try {
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required." });
    }

    const newEntry = new EmailList({ name, email });
    await newEntry.save();

    res.status(201).json({ message: "Email successfully added to the list.", data: newEntry });
  } catch (error) {
    console.error("Error adding email:", error);

    if ((error as any).code === 11000) {
      return res.status(400).json({ message: "Email already exists in the list." });
    }

    res.status(500).json({ message: "Internal Server Error" });
  }
};
