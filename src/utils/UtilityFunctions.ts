import mongoose from 'mongoose';
import AssignmentModel, { IAssignment } from '../models/Assignment';
import AvailabilityModel, { IAvailability } from '../models/Availability';
import RequestModel, { IRequest } from '../models/Request';
import Service from '../models/Service';
import User from '../models/User';
import Extension, {IExtension} from '../models/Extension';
import Notification from '../models/Notification';
import { io, users } from '..';
import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import AdminNotificationModel from '../models/AdminNotification';

// Define the Time type
type Time = {
  hours: number;
  minutes: number;
  seconds: number;
};

// Helper function to check if request time is within availability time range
function isTimeMatch(requestTime: Time, otime: Time, ctime: Time): boolean {
  const requestMinutes = requestTime.hours * 60 + requestTime.minutes;
  const openingMinutes = otime.hours * 60 + otime.minutes;
  const closingMinutes = ctime.hours * 60 + ctime.minutes;

  return requestMinutes >= openingMinutes && requestMinutes <= closingMinutes;
}

// Main function to match requests to open availability slots
export const matchRequestToAvailabilityAndCreateAssignment = async (requestId: string) => {
  try {
    // Retrieve the request data
    const userRequest = await RequestModel.findById(requestId) as IRequest;
    if (!userRequest) {
      throw new Error('Request not found');
    }

    const { expertise, time: requestTime, userId, day } = userRequest;

    console.log(`${expertise} ${requestTime} ${userId} ${day} Printed`);

    // Find an available consultant with a matching day, open status, and expertise
    const matchingAvailability = await AvailabilityModel.findOne({
      expertise: { $in: [expertise] }, // Checks if requested expertise exists in expertise array
      day,
      status: 'open',
    }) as IAvailability;

    if (
      matchingAvailability && 
      matchingAvailability.otime && 
      matchingAvailability.ctime && 
      isTimeMatch(requestTime as Time, matchingAvailability.otime, matchingAvailability.ctime)
    ) {
      console.log(`${requestTime} ${matchingAvailability.otime} ${matchingAvailability.ctime} Matching`);

      // Create a new assignment with default status of 'pending'
      const newAssignment: IAssignment = new AssignmentModel({
        uid: userId,
        cid: matchingAvailability.cid,
        expertise: expertise,
        type: userRequest.type,
        orderId: userRequest.orderId,
        createdDate: new Date(),
        status: 'pending', // Default status for new assignments
      });

      await newAssignment.save();
      
      if (userRequest.type) {
        createNotification(matchingAvailability.cid.toString(), userId, 'consultant', 'Assignment', userRequest.orderId, 'New Order', 'You have a New Order Match');
      } else {
        // Handle the case where orderId is undefined
        console.error('orderId is required but not provided');
      }
      return { message: 'Assignment created successfully', assignment: newAssignment };
    } else {
      return { message: 'No available consultant matches the request criteria' };
    }
  } catch (error) {
    console.error('Error matching request to availability:', error);
    throw error;
  }
};


export const fetchRequestByOrderId = async (orderId: string): Promise<IRequest | null> => {
    try {
      const request = await RequestModel.findOne({ orderId });
      if (!request) {
        console.log(`No request found for orderId: ${orderId}`);
        return null;
      }

      // console.log(request);
      // console.log(request._id);

      matchRequestToAvailabilityAndCreateAssignment(request._id as string);
      return request;
    } catch (error) {
      console.error('Error fetching request by orderId:', error);
      throw new Error('Failed to fetch request by orderId');
    }
  }

  export const getServicePriceByName = async (name: string): Promise<string> => {
    try {
      // Find the service by name
      const service = await Service.findOne({ name });
  
      // Check if the service exists and return its price as a string
      const reqPrice = service?.price.toString();
      if (service) {
        return `${service.price.toString()}00`;
      } else {
        throw new Error('Service not found');
      }
    } catch (error) {
      console.error('Error fetching service price:', error);
      throw error;
    }
  };

  export const fetchUserEmailById = async (userId: string): Promise<string | null> => {
    try {
      // Check if the userId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid user ID format');
      }
  
      // Fetch the user by _id and select only the email field
      const user = await User.findById(userId).select('email');
      return user ? user.email : null;
    } catch (error) {
      console.error('Error fetching user email:', error);
      throw new Error('Failed to fetch user email');
    }
  };

  export const fetchExtensionPriceByLength = async (length: number): Promise<number | null> => {
    try {
      // Find the extension with the specified length
      const extension: IExtension | null = await Extension.findOne({ length });
  
      // Append "00" to the price and return it if the extension exists, otherwise return null
      return extension ? Number(`${extension.price}00`) : null;
    } catch (error) {
      console.error('Error fetching extension price:', error);
      throw new Error('Failed to fetch extension price');
    }
  };
  
  export const createNotification = async (
    userId: string, 
    senderId: string, 
    role: string, 
    type: string, 
    relatedId: string, 
    title: string, 
    message: string
  ): Promise<void> => {
    try {
      const notification = new Notification({
        userId,
        senderId,
        role,
        type,
        relatedId,
        title,
        message,
      });
  
      await notification.save();

      const userSocketId = users[userId];
      // const userSocketId = users[userId];
      if (userSocketId) {
        io.to(userSocketId).emit('newNotification', notification);
        console.log(`Notification sent to user ${userId}`);
      }

      console.log('Notification created:', notification);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  };

  export const createAdminNotification = async (
    type: string, 
    orderId: string, 
    title: string, 
  ): Promise<void> => {
    try {
      const notification = new AdminNotificationModel({
        title,
        type,
        orderId,
      });
  
      await notification.save();

      // const userSocketId = users[userId];
      // const userSocketId = users[userId];
     
      io.emit('adminNotification', notification);

      console.log('Admin Notification created:', notification);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  };


  export function convertToGMTPlusOne(
    timestamp: string | Date
  ): { hours: number; minutes: number; seconds: number; gmtPlusOneTime: Date } {
    try {
      // Ensure timestamp is a Date object
      const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date input");
      }
  
      // Calculate the GMT+1 offset in minutes (GMT+1 is +60 minutes)
      const gmtPlusOneOffset = 60;
  
      // Get the UTC time of the timestamp in milliseconds
      const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  
      // Apply the GMT+1 offset
      const gmtPlusOneTime = new Date(utcTime + gmtPlusOneOffset * 60000);
  
      // Extract hours, minutes, and seconds
      const hours = gmtPlusOneTime.getHours();
      const minutes = gmtPlusOneTime.getMinutes();
      const seconds = gmtPlusOneTime.getSeconds();
  
      return { hours, minutes, seconds, gmtPlusOneTime };
    } catch (error) {
      console.error("Error in convertToGMTPlusOne:", error);
      throw new Error("Failed to convert timestamp to GMT+1");
    }
  }

// S3 client configuration
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Configure multer to use multer-s3 as the storage engine
const storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    // Define a unique filename pattern for the uploaded files
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

// Create the multer upload function using the S3 storage configuration
export const uploads = multer({ storage }).array('files', 10); // Accept up to 10 files

  
  