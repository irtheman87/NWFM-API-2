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
// ✅ Create an S3 Client with Transfer Acceleration Enabled
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  endpoint: `https://s3-accelerate.amazonaws.com`, // ✅ Enables Transfer Acceleration
});

// ✅ Configure Multer-S3 for optimized upload
const storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME || "",
  contentType: multerS3.AUTO_CONTENT_TYPE, // ✅ Sets the correct Content-Type automatically
  acl: "private", // ✅ Faster than "public-read"
  cacheControl: "max-age=31536000", // ✅ Improves CDN caching if used
  key: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `uploads/${uniqueSuffix}-${file.originalname}`);
  },
});

// ✅ Use Multer Memory Storage to Avoid Disk Writes
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // ✅ Limit to 10MB for speed
}).fields([
  { name: "file", maxCount: 1 },
  { name: "doc", maxCount: 1 },
  { name: "rateCard", maxCount: 1 },
  { name: "cacdoc", maxCount: 1 },
]);

const multerMiddleware = multer().none();

// Create Crew Member Function
export const createCrewMember = async (req: Request, res: Response) => {
  try {
    // ✅ Validate Required Fields Before Uploading Files
    const {
      firstName, lastName, email, userId, mobile, dob, bio, department, role,
      works, fee, location, verificationDocType, idNumber
    } = req.body;

    const missingFields: string[] = [];

    if (!firstName?.trim()) missingFields.push("firstName");
    if (!lastName?.trim()) missingFields.push("lastName");
    if (!email?.trim()) missingFields.push("email");
    if (!userId?.trim()) missingFields.push("userId");
    if (!mobile?.trim()) missingFields.push("mobile");
    if (!dob?.trim()) missingFields.push("dob");
    if (!department?.trim()) missingFields.push("department");
    if (!role?.trim()) missingFields.push("role");
    if (!verificationDocType?.trim()) missingFields.push("verificationDocType");
    if (!idNumber?.trim()) missingFields.push("idNumber");
    
    if (missingFields.length > 0) {
      console.error(`❌ Missing required fields: ${missingFields.join(", ")}`);
      return res.status(400).json({
        message: "All required fields must be provided.",
        missingFields, // Include missing fields in the response
      });
    }
    
    // ✅ Handle File Uploads
    upload(req, res, async (err) => {
      if (err) {
        console.error("File upload error:", err);
        return res.status(500).json({ message: "Error uploading files to S3", error: err.message });
      }

      const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };

      // ✅ Validate Uploaded Files
      if (!files?.file?.[0]?.location || !files?.doc?.[0]?.location) {
        return res.status(400).json({ message: "Both profile picture and document are required." });
      }

      // ✅ Extract File Locations
      const profilePic = files.file[0].location;
      const document = files.doc[0].location;

      // ✅ Create and Save Crew Member in Database
      const newCrew = new Crew({
        firstName, lastName, email, userId, mobile, dob, bio, propic: profilePic,
        department, role, works, fee, location, verificationDocType, document,
        idNumber, apiVetting: false, verified: false,
      });

      const savedCrew = await newCrew.save();

      // ✅ Send Email Notification Asynchronously (Prevents Delayed API Response)
      sendEmail({
        to: email,
        subject: "Welcome to the Nollywood Filmmaker Database – Verification in Progress",
        text: `Dear ${firstName} ${lastName},

Thank you for joining the Nollywood Filmmaker Database, the most comprehensive network of industry professionals dedicated to connecting talent and opportunities.
We have received your submission, and our team is currently reviewing your documents as part of the verification process. You will be notified once your profile has been successfully verified.
As a member of this database, you’ll be positioned to connect with filmmakers seeking your expertise. Our goal is to make it easier for industry professionals like you to collaborate and thrive in Nollywood.
We look forward to having you as part of this growing community!

Best regards,
Nollywood Filmmaker Database
        `,
        html: `
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; color: #333; }
              .container { max-width: 600px; background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin: auto; }
              h1 { color: #333; }
              p { font-size: 16px; line-height: 1.5; }
              .footer { margin-top: 20px; font-size: 14px; color: #777; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Hello ${firstName} ${lastName},</h1>
              <p>Thank you for joining the <strong>Nollywood Filmmaker Database</strong>. Your submission is under review.</p>
              <p>We will notify you once your profile is verified. Welcome aboard!</p>
              <p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
            </div>
          </body>
          </html>
        `,
      }).catch((emailError) => console.error("Error sending email:", emailError));

      return res.status(201).json({ message: "Crew member created successfully.", data: savedCrew });
    });

  } catch (error) {
    console.error("Error in createCrewMember:", error);
    return res.status(500).json({ message: "An unexpected error occurred.", error: error });
  }
};



// Create Company Function
export const createCompany = async (req: Request, res: Response) => {
  try {
    // ✅ Validate Required Fields Before Uploading Files
    const {
      name, email, userId, mobile, website, bio, type, clientele,
      useRateCard, fee, location, verificationDocType, idNumber, cacNumber
    } = req.body;

    const missingFields: string[] = [];

    if (!name?.trim()) missingFields.push("name");
    if (!email?.trim()) missingFields.push("email");
    if (!userId?.trim()) missingFields.push("userId");
    if (!mobile?.trim()) missingFields.push("mobile");
    if (!type?.trim()) missingFields.push("type");
    if (!verificationDocType?.trim()) missingFields.push("verificationDocType");
    if (!idNumber?.trim()) missingFields.push("idNumber");
    if (!cacNumber?.trim()) missingFields.push("cacNumber");
    if (!location?.trim()) missingFields.push("location");
    if (!bio?.trim()) missingFields.push("bio");
    
    if (missingFields.length > 0) {
      console.error(`❌ Missing required fields: ${missingFields.join(", ")}`);
      return res.status(400).json({
        message: "All required fields must be provided.",
        missingFields, // Include missing fields in the response
      });
    }
    

    // ✅ Handle File Uploads
    upload(req, res, async (err) => {
      if (err) {
        console.error("File upload error:", err);
        return res.status(500).json({ message: "Error uploading files to S3", error: err.message });
      }

      const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };

      // ✅ Validate Uploaded Files
      if (!files?.file?.[0]?.location || !files?.doc?.[0]?.location || !files?.cacdoc?.[0]?.location) {
        return res.status(400).json({ message: "Profile picture, document, and CAC document are required." });
      }

      // ✅ Extract File Locations
      const profilePic = files.file[0].location;
      const document = files.doc[0].location;
      const cacdoc = files.cacdoc[0].location;
      let rateCard = "";

      // ✅ Validate and Process Rate Card
      if (useRateCard === "true") {
        if (!files?.rateCard?.[0]?.location) {
          return res.status(400).json({ message: "Rate card file is required when useRateCard is true." });
        }
        rateCard = files.rateCard[0].location;
      }

      // ✅ Create and Save Company in Database
      const newCompany = new Company({
        name, email, userId, mobile, website, bio, propic: profilePic,
        type, clientele, useRateCard, rateCard, fee, location,
        verificationDocType, document, idNumber, cacdoc,
        apiVetting: false, verified: false,
      });

      const savedCompany = await newCompany.save();

      // ✅ Send Email Notification Asynchronously (Prevents Delayed API Response)
      sendEmail({
        to: email,
        subject: "Welcome to the Nollywood Filmmaker Database – Verification in Progress",
        text: `Dear ${name},

Thank you for joining the Nollywood Filmmaker Database, the most comprehensive network of industry professionals dedicated to connecting talent and opportunities.
We have received your submission, and our team is currently reviewing your documents as part of the verification process. You will be notified once your profile has been successfully verified.
As a member of this database, you’ll be positioned to connect with filmmakers seeking your expertise. Our goal is to make it easier for industry professionals like you to collaborate and thrive in Nollywood.
We look forward to having you as part of this growing community!

Best regards,
Nollywood Filmmaker Database
        `,
        html: `
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; color: #333; }
              .container { max-width: 600px; background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); margin: auto; }
              h1 { color: #333; }
              p { font-size: 16px; line-height: 1.5; }
              .footer { margin-top: 20px; font-size: 14px; color: #777; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Hello ${name},</h1>
              <p>Thank you for joining the <strong>Nollywood Filmmaker Database</strong>. Your submission is under review.</p>
              <p>We will notify you once your profile is verified. Welcome aboard!</p>
              <p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
            </div>
          </body>
          </html>
        `,
      }).catch((emailError) => console.error("Error sending email:", emailError));

      return res.status(201).json({ message: "Company created successfully.", data: savedCompany });
    });

  } catch (error) {
    console.error("Error in createCompany:", error);
    return res.status(500).json({ message: "An unexpected error occurred.", error: error });
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

    // await sendEmail({
    //   to: email,
    //   subject: "You Joined Our Database",
    //   text: `Thanks ${username} for joining our database.`,
    //   html: `<p>Thanks <strong>${username}</strong> for joining our database.</p>`,
    // });
    

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
