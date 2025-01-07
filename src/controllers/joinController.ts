import { Request, Response } from "express";
import Crew from "../models/Crew";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import Company from "../models/Company";
import CrewCompany from "../models/CrewCompany";
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';

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
      if (!files?.file || !files?.doc) {
        return res.status(400).json({
          message: "Both profile picture and document are required.",
        });
      }

      const profilePic = files.file[0]?.location;
      const document = files.doc[0]?.location;

      const {
        firstName,
        lastName,
        email,
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
        !mobile ||
        !dob ||
        !department ||
        !role ||
        !fee ||
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
      });

      // Save Crew to the database
      const savedCrew = await newCrew.save();

      return res
        .status(201)
        .json({ message: "Crew member created successfully.", data: savedCrew });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred.", error: error });
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
        !mobile ||
        !type ||
        useRateCard === undefined ||
        !verificationDocType ||
        !idNumber ||
        !cacNumber
      ) {
        return res
          .status(400)
          .json({ message: "All required fields must be provided." });
      }

      // Create a new Company instance
      const newCompany = new Company({
        name,
        email,
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
      });

      // Save Company to the database
      const savedCompany = await newCompany.save();

      return res
        .status(201)
        .json({ message: "Company created successfully.", data: savedCompany });
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

    // Respond with the token
    return res.status(200).json({
      message: "Login successful.",
      token,
      crewCompany: {
        id: crewCompany._id,
        username: crewCompany.username,
        email: crewCompany.email,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ message: "Internal server error.", error });
  }
};

export const getCrewByEmail = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.params;

    // Validate email parameter
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email provided" });
    }

    // Find the Crew member by email
    const crewMember = await Crew.findOne({ email });

    if (!crewMember) {
      return res.status(404).json({ message: "Crew member not found" });
    }

    // Return the crew member details
    return res.status(200).json({ 
      message: "Crew member fetched successfully",
      crewMember
    });
  } catch (error) {
    console.error("Error fetching crew member:", error);
    return res.status(500).json({ 
      message: "Failed to fetch crew member",
      error 
    });
  }
};

export const getCompanyByEmail = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.params;

    // Check if email is provided
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Fetch the company details using the email
    const company = await Company.findOne({ email });

    // If the company is not found, return a 404 error
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