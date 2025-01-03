import { Request, Response } from "express";
import Crew from "../models/Crew";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import Company from "../models/Company";

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
