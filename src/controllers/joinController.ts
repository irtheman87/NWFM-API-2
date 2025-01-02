import { Request, Response } from "express";
import Crew from "../models/Crew";
import Company from "../models/Company";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";

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

// Multer upload configurations
const upload = multer({ storage }).single("file");
const docupload = multer({ storage }).single("doc");

// Create Crew Member Function
export const createCrewMember = async (req: Request, res: Response) => {
  try {
    // Handle document upload
    docupload(req, res, async function (docError) {
      if (docError) {
        return res.status(500).json({
          message: "Error uploading document to S3",
          error: docError.message,
        });
      }

      // Ensure document upload exists
      if (!req.file) {
        return res.status(400).json({ message: "Document is required." });
      }

      // Handle profile picture upload
      upload(req, res, async function (fileError) {
        if (fileError) {
          return res.status(500).json({
            message: "Error uploading profile picture to S3",
            error: fileError.message,
          });
        }

        // Ensure profile picture exists
        if (!req.file) {
          return res.status(400).json({ message: "Profile picture is required." });
        }

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
          !location ||
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
          propic: (req.file as any).location,
          department,
          role,
          works,
          fee,
          location,
          verificationDocType,
          document: (req.file as any).location,
          idNumber,
        });

        // Save Crew to database
        const savedCrew = await newCrew.save();

        return res
          .status(201)
          .json({ message: "Crew member created successfully.", data: savedCrew });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred.", error: error });
  }
};

// Create Company Function
export const createCompany = async (req: Request, res: Response) => {
  try {
    // Handle document upload
    docupload(req, res, async function (docError) {
      if (docError) {
        return res.status(500).json({
          message: "Error uploading document to S3",
          error: docError.message,
        });
      }

      // Ensure document exists
      if (!req.file) {
        return res.status(400).json({ message: "Document is required." });
      }

      // Handle profile picture upload
      upload(req, res, async function (fileError) {
        if (fileError) {
          return res.status(500).json({
            message: "Error uploading profile picture to S3",
            error: fileError.message,
          });
        }

        // Ensure profile picture exists
        if (!req.file) {
          return res
            .status(400)
            .json({ message: "Profile picture is required." });
        }

        const {
          name,
          email,
          mobile,
          website,
          bio,
          type,
          clientele,
          useRateCard,
          rateCard,
          fee,
          location,
          verificationDocType,
          idNumber,
          cacNumber,
        } = req.body;

        // Validate required fields
        if (
          !name ||
          !email ||
          !mobile ||
          !type ||
          !useRateCard ||
          !location ||
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
          propic: (req.file as any).location,
          type,
          clientele,
          useRateCard,
          rateCard,
          fee,
          location,
          verificationDocType,
          document: (req.file as any).location,
          idNumber,
          cacNumber,
        });

        // Save Company to the database
        const savedCompany = await newCompany.save();

        return res
          .status(201)
          .json({ message: "Company created successfully.", data: savedCompany });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred.", error: error });
  }
};
