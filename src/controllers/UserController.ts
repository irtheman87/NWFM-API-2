import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, {IUser} from '../models/User';
import * as crypto from 'crypto';
import mongoose from 'mongoose';
import sendEmail from '../utils/sendEmail'; // A function to handle sending emails
import Preference, {IPreference} from '../models/PreferenceModel';
import multer from 'multer';
import Issue, { IIssue } from '../models/Issuess';
import AvailabilityModel from '../models/Availability';
import { Time } from '../types';
import AppointmentModel from '../models/Appointment';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, GetObjectAclCommand} from '@aws-sdk/client-s3';
import Transaction from '../models/SetTransaction';
import RequestModel from '../models/Request';
import Notification from '../models/Notification';
import { format, parseISO, add } from 'date-fns';
import moment from 'moment-timezone';
import { createNotification } from '../utils/UtilityFunctions';
import Consultant from '../models/consultant';


// Define the storage engine
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
export const upload = multer({ storage }).single('file');


export const generateAccessToken = (userId: string, role: string) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
  );
};

export const generateRefreshToken = (userId: string) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
  );
};

export const fetchConsultantEmail = async (cid: string): Promise<string | null> => {
  try {
    // Find the consultant by ID and fetch only the email field
    const consultant = await Consultant.findById(cid, 'email');
    return consultant?.email || null;
  } catch (error) {
    console.error('Error fetching consultant email:', error);
    throw new Error('Failed to fetch consultant email');
  }
};

function getDayOfWeek(date: Date | string): string {
  // Convert date string to Date object if necessary
  const dayDate = typeof date === 'string' ? new Date(date) : date;

  // Array of day names
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Get day of week index and return corresponding name
  const dayIndex = dayDate.getDay();
  return daysOfWeek[dayIndex];
}

// Register Regular User
export const registerUser = async (req: Request, res: Response) => {
  const { fname, lname, phone, email, password, expertise } = req.body;

  try {
    // Check for duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a random token for email verification
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const newUser = new User({
      fname,
      lname,
      phone,
      email,
      password: hashedPassword,
      role: 'user',
      expertise,
      verificationToken,
      profilepics: 'https://nwfm-api.onrender.com/uploads/account.png'
    });

    await newUser.save();

    createDefaultPreference(newUser._id as string);

    const accessToken = generateAccessToken(String(newUser._id), newUser.role);
    const refreshToken = generateRefreshToken(String(newUser._id));
    // Generate JWT for authentication
    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const userinfo = {
      userId : newUser._id,
      email: newUser.email,
      phone: newUser.phone,
      fname: newUser.fname,
      lname: newUser.lname,
      role: newUser.role,
      isVerified : newUser.isVerified,
      expertise : newUser.expertise
    }

    // Send a verification email
    
    const verificationLink = `http://nollywood-filmaker-deploy.vercel.app/auth/verify?vtoken=${verificationToken}`;
    // const verificationLink = `${process.env.BASE_URL}/api/users/verify/${verificationToken}`;
    // await sendEmail(email, `Verify your email`, `Click here to verify your email: ${verificationLink}`);

    (async () => {
      try {
        await sendEmail({
          to: email,
          subject: 'Verify your Account',
          text: `Click here to verify your email: ${verificationLink}`,
        });
        console.log('Email sent successfully.');
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    })();

    res.status(201).json({ accessToken: accessToken, refreshToken : refreshToken, user: userinfo, message: 'Please check your email to verify your account.', verLink : verificationLink });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error });
  }
};

// Login Regular User
export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Fetch the user by email
    const user = await User.findOne({ email });

    // Check if the user exists and has the role 'user'
    if (!user || user.role !== 'user') {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Ensure the user is verified
    if (!user.isVerified) {

      const verificationLink = `http://nollywood-filmaker-deploy.vercel.app/auth/verify?vtoken=${user.verificationToken}`;
      // await sendEmail(email, `Verify your email`, `Click here to verify your email: ${verificationLink}`);
  
      (async () => {
        try {
          await sendEmail({
            to: email,
            subject: 'Verify your Account',
            text: `Click here to verify your email: ${verificationLink}`,
          });
          console.log('Email sent successfully.');
        } catch (error) {
          console.error('Failed to send email:', error);
        }
      })();

      return res.status(403).json({ message: 'Account is not verified. Please verify your account before logging in.' , isverified: false});
    }

    // Validate the password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate tokens
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '6h' }
    );
    const accessToken = generateAccessToken(String(user._id), user.role);
    const refreshToken = generateRefreshToken(String(user._id));

    // Prepare user information for the response
    const userinfo = {
      id: user._id,
      fname: user.fname,
      lname: user.lname,
      phone: user.phone,
      email: user.email,
      role: user.role,
      expertise: user.expertise,
      isVerified: user.isVerified,
      profilepics: user.profilepics,
    };

    // Respond with tokens and user information
    res.json({ accessToken: accessToken, refreshToken: refreshToken, user: userinfo, isverified: true });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Error logging in', error });
  }
};



export const refreshToken = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  // Check if the Authorization header exists and starts with 'Bearer '
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  const refreshToken = authHeader.split(' ')[1]; // Get the token from the header

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { userId: string };

    // Generate a new access token
    const accessToken = generateAccessToken(decoded.userId, 'user'); // Or fetch role from DB if needed

    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const fetchUserById = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from URL parameters

  try {
    // Validate userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the user by userId
    const user = await User.findById(userId);

    if (!user) {
      console.log(`User with ID ${userId} not found`);
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    
    const userinfo = {
      userId : user._id,
      email: user.email,
      phone: user.phone,
      fname: user.fname,
      lname: user.lname,
      role: user.role,
      expertise : user.expertise,
      bio: user.bio,
      website: user.website,
      profilepic: user.profilepics,
      created: user.createdAt,
      location: {
        country: user.location?.country,
        state: user.location?.state,
        city: user.location?.city,
        postalcode: user.location?.postalcode
      }
    }

    return res.status(200).json(userinfo); // Return the user data in the response
  } catch (error) {
    console.error('Error fetching user by userId:', error);
    return res.status(500).json({ message: 'Failed to fetch user', error });
  }
};

export interface UpdateUserParams {
  fname?: string;
  lname?: string;
  phone?: string;
  email?: string;
  role?: 'user' | 'admin' | 'consult';
  expertise?: string[];
  isVerified?: boolean;
  verificationToken?: string;
  bio?: string;
  website?: string;
  location?: {
    country?: string;
    state?: string;
    city?: string;
    postalcode?: string;
  };
}

// Function to handle the update request
export const updateUserById = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from URL params
  const updates: UpdateUserParams = req.body; // Extract updates from the request body

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find and update the user document
    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure all schema validations run
    });

    if (!user) {
      console.log(`User with ID ${userId} not found`);
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    
    const userinfo = {
      userId : user._id,
      email: user.email,
      phone: user.phone,
      fname: user.fname,
      lname: user.lname,
      role: user.role,
      expertise : user.expertise,
      bio: user.bio,
      website: user.website,
      profilepic: user.profilepics,
      location: {
        country: user.location?.country,
        state: user.location?.state,
        city: user.location?.city,
        postalcode: user.location?.postalcode
      }
    }

    return res.status(200).json(userinfo); // Return updated user data in response
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ message: 'Failed to update user profile', error });
  }
};


export const updateUserProfilePic = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const file = req.file as Express.MulterS3.File | undefined;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // S3 file URL from multer-s3 upload
    const fileUrl = file.location; // S3 URL is available in the 'location' property

    // Update the profilepics field only, adding it if it doesn't exist
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { profilepics: fileUrl } }, // Use $set to add the field if it doesn't exist
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      console.log(`User with ID ${userId} not found`);
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    return res.status(200).json({ message: 'Profile picture updated successfully', profilePicUrl: updatedUser.profilepics });
  } catch (error) {
    console.error('Error updating user profile picture:', error);
    return res.status(500).json({ message: 'Failed to update user profile picture', error });
  }
};

export const updateUserPassword = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from URL params
  const { currentPassword, newPassword } = req.body; // Extract currentPassword and newPassword from the request body

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the user by userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    // Compare current password with stored password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Ensure the new password is different from the current password
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password cannot be the same as the current password' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password field only
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { password: hashedPassword },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    return res.status(200).json({
      message: 'Successfully updated password',
      status: 'completed',
    });

  } catch (error) {
    console.error('Error updating user password:', error);
    return res.status(500).json({ message: 'Failed to update user password', error });
  }
};


const createDefaultPreference = async (userId: string): Promise<IPreference> => {
  try {
    // Create a new preference entry with default settings for the user
    const defaultPreference = new Preference({
      userId,
      newRequestOrder: 'off',
      updateOnMyOrders: 'off',
      recommendation: 'off',
      currency: 'NGN', // Default currency for new users
      timezone: 'GMT+1', // Default timezone for new users
    });

    // Save the preference in the database
    const savedPreference = await defaultPreference.save();

    console.log(`Default preferences created for user ID: ${userId}`);
    return savedPreference;
  } catch (error) {
    console.error('Error creating default preferences:', error);
    throw new Error('Failed to create default preferences');
  }
};

export const fetchUserPreferences = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from URL params

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the user's preferences by userId
    const preferences = await Preference.findOne({ userId });

    if (!preferences) {
      return res.status(404).json({ message: `Preferences not found for user ID ${userId}` });
    }

    return res.status(200).json({ preferences });

  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return res.status(500).json({ message: 'Failed to fetch user preferences', error });
  }
};

export const updatePreference = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params; // Extract userId from the URL params
  const { newRequestOrder, updateOnMyOrders, recommendation, currency, timezone } = req.body; // Extract the preference data from the request body

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the existing preference document for the user
    const preference = await Preference.findOne({ userId });

    if (!preference) {
      // If no preference document exists, create a new one with the provided data
      const newPreference = new Preference({
        userId,
        newRequestOrder,
        updateOnMyOrders,
        recommendation,
        currency,
        timezone,
      });

      await newPreference.save();

      return res.status(201).json({ message: 'Preference created successfully', preference: newPreference });
    }

    // If the preference document exists, update it with the new values
    preference.newRequestOrder = newRequestOrder ?? preference.newRequestOrder;
    preference.updateOnMyOrders = updateOnMyOrders ?? preference.updateOnMyOrders;
    preference.recommendation = recommendation ?? preference.recommendation;
    preference.currency = currency ?? preference.currency;
    preference.timezone = timezone ?? preference.timezone;

    const updatedPreference = await preference.save();

    return res.status(200).json({ message: 'Preference updated successfully', preference: updatedPreference });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    return res.status(500).json({ message: 'Failed to update user preferences', error });
  }
};


export const fetchUserProfilePic = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

  try {
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Find the user and select only the profile picture field
    const user = await User.findById(userId); // 'profilepics' is the field name in the model

    if (!user) {
      return res.status(404).json({ message: `User with ID ${userId} not found` });
    }

    return res.status(200).json({ profilePicUrl: user.profilepics });
  } catch (error) {
    console.error('Error fetching user profile picture:', error);
    return res.status(500).json({ message: 'Failed to fetch user profile picture', error });
  }
};


export const createNewIssue = async (req: Request, res: Response): Promise<Response> => {
  const { uid, orderId, title, complain } = req.body;

  try {
    // Validate IDs
    if (typeof uid !== 'string' || uid.trim() === '') {
      return res.status(400).json({ message: 'Invalid user ID or consultant ID' });
    }
    

    // Create a new Issue instance
    const newIssue = new Issue({
      uid: uid,
      orderId,
      title,
      complain,
      status: 'pending', // Default status
    });

    // Save the new issue to the database
    const savedIssue = await newIssue.save();
    return res.status(201).json({ message: 'Issue created successfully', issue: savedIssue });
  } catch (error) {
    console.error('Error creating new issue:', error);
    return res.status(500).json({ message: 'Failed to create new issue', error });
  }
};
// Initialize the upload middleware for a single file
export const getAvailableHoursCount = async (req: Request, res: Response): Promise<Response> => {
  const { expertise, date } = req.query;

  const day = getDayOfWeek(date as string);

  if (!expertise || !day) {
    return res.status(400).json({ message: 'Expertise and day are required' });
  }

  // Parse the date query parameter into a Date object
  const parsedDate = parseDateFromQuery(date as string);
  if (!parsedDate) {
    return res.status(400).json({ message: 'Invalid date format' });
  }

  try {
    // Find all availability entries for the given expertise and day
    const availabilities = await AvailabilityModel.find({
      expertise: { $in: [expertise] },
      day,
      status: 'open',
    });

    if (!availabilities.length) {
      return res.status(404).json({ message: 'No available consultants found for the given expertise and day' });
    }

    const availableHoursArray: { time: string; available: number; isAvailable: boolean }[] = [];

    // Initialize available hours spaced by 2 hours (9:00, 11:00, 13:00, etc.)
    for (let hour = 9; hour <= 23; hour += 2) {
      availableHoursArray.push({
        time: `${hour}:00`,
        available: 0,
        isAvailable: false,
      });
    }

    // Loop through all the available entries
    for (const availability of availabilities) {
      const { otime, ctime, cid } = availability;

      for (let hour = 9; hour <= 23; hour += 2) {
        if (
          (otime.hours <= hour && ctime.hours > hour) ||
          (otime.hours === hour && otime.minutes === 0)
        ) {
          // Check if an appointment already exists for this consultant at this time slot
          const existingAppointment = await AppointmentModel.findOne({
            cid,
            date: parsedDate,
            'time.hours': hour,
            'time.minutes': 0,
          });

          // Only increment if no appointment exists for this time slot
          if (!existingAppointment) {
            const hourEntry = availableHoursArray.find((entry) => entry.time === `${hour}:00`);
            if (hourEntry) {
              hourEntry.available += 1;
            }
          }
        }
      }
    }

    // Determine availability for each 2-hour time slot
    for (let hour = 9; hour <= 23; hour += 2) {
      const time = { hours: hour, minutes: 0, seconds: 0 };
      const appointmentCount = await checkAppointmentsByDateAndTime(parsedDate, time);

      const hourEntry = availableHoursArray.find((entry) => entry.time === `${hour}:00`);
      if (hourEntry && hourEntry.available > appointmentCount) {
        hourEntry.isAvailable = true;
      }
    }

    return res.status(200).json({
      message: 'Available hours calculated successfully',
      availableHoursCount: availableHoursArray,
    });
  } catch (error) {
    console.error('Error fetching availability hours:', error);
    return res.status(500).json({ message: 'Error fetching available hours', error });
  }
};



export const checkAppointmentsByDateAndTime = async (date: Date, time: Time): Promise<number> => {
  if (!date || !time) {
    throw new Error('Date and time are required');
  }

  try {
    // Query appointments by date
    const appointments = await AppointmentModel.find({
      date: date, // Match the exact date
    });

    // Filter appointments based on the time object (hour, minute, second)
    const matchingAppointments = appointments.filter((appointment) => 
      isTimeMatch(time, appointment.time) // Check if time matches
    );

    // Return the number of matching appointments
    return matchingAppointments.length;
  } catch (error) {
    console.error('Error fetching appointments:', error);
    throw new Error('Error checking appointments');
  }
};

export const checkTransactionStatus = async (req: Request, res: Response): Promise<Response> => {
  const { reference} = req.params;
  const { length, orderId }  = req.query;


  try {
    // Find the transaction by its unique reference
    const transaction = await Transaction.findOne({ reference });

    // If the transaction is not found, return a 404 error
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const request = await RequestModel.findOne({ orderId });

    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    const { endTime } = request;
    if (!endTime) {
      return res.status(400).json({ message: 'endTime is missing for the request.' });
    }

    const actlength = Number(length);

    const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
    // Add `length` (in hours) to `booktime` to calculate the new `endTime`
    const endDateTime = add(new Date(endTime), { minutes: actlength });
    const endTimeUpdate = moment(endDateTime).utcOffset('+01:00').format(gmtPlusOneFormat);

    await RequestModel.findOneAndUpdate(
      { orderId: orderId },
      { endTime: endTimeUpdate }, // Update status of the request to 'ongoing'
      { new: true } // Return the updated document
    );
    // Return the status of the transaction
    return res.status(200).json({ status: transaction.status || 'Status not set' });
  } catch (error) {
    console.error('Error fetching transaction status:', error);
    return res.status(500).json({ message: 'Failed to fetch transaction status', error });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist.' });
    }

    // Generate a unique token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Store a hashed version of the token in the user's document for verification
    user.verificationToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    await user.save();

    // Generate the password reset URL
    // const resetUrl = `${req.protocol}://${req.get('host')}/api/users/resetpassword/${resetToken}`;
    const resetUrl = `https://nollywood-filmaker-deploy.vercel.app/auth/reset-password?token=${resetToken}`;
    console.log(resetUrl);
    
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click the following link to reset your password: ${resetUrl}. If you did not request this, please ignore this email.`,
    });

    res.status(200).json({ message: 'Password reset link has been sent to your email.' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Server error, please try again later.' });
  }
};


export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    // Check if token is provided
    if (!token) {
      return res.status(400).json({ message: 'Token is required.' });
    }

    // Hash the token and find the user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      verificationToken: hashedToken,
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    // Update user's password and clear the token
    user.password = await bcrypt.hash(newPassword, 10); // Ensure this is hashed as needed
    user.verificationToken = undefined;
    await user.save();

    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Server error, please try again later.' });
  }
};

export const fetchUserRequests = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Query requests with matching userId and statuses
    const filter = {
      userId, // Match userId
      type: 'Chat', // Specific type
      stattusof: { $in: ['ongoing', 'ready', 'completed'] }, // Match statuses
    };

    // Fetch all matching requests sorted by `booktime` in ascending order
    const requests = await RequestModel.find(
      filter,
      'chat_title stattusof time orderId nameofservice date createdAt booktime endTime'
    ).sort({ booktime: -1 }); // Sort by `booktime` in ascending order

    // Map and validate each request
    const processedRequests = await Promise.all(
      requests.map(async (request) => {
        // Verify the corresponding transaction for the order
        const transaction = await Transaction.findOne({
          orderId: request.orderId,
          status: 'completed', // Ensure the transaction is completed
        });

        if (!transaction) {
          return null; // Skip requests without a valid completed transaction
        }

        // Handle `booktime` formatting and calculate `endTime`
        const { booktime } = request.toObject();
        if (booktime) {
          const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
          const startTime = moment(booktime).utcOffset('+01:00').format(gmtPlusOneFormat);

          const endTime = moment(booktime)
            .utcOffset('+01:00')
            .add(1, 'hour')
            .format(gmtPlusOneFormat);

          return {
            ...request.toObject(),
            startTime,
            endTime,
          };
        }

        return null; // Skip requests with invalid or missing `booktime`
      })
    );

    // Filter out invalid requests (null entries)
    const validRequests = processedRequests.filter(Boolean);

    // Return valid requests
    return res.status(200).json({
      requests: validRequests,
    });
  } catch (error) {
    console.error('Error fetching user requests:', error);
    return res.status(500).json({ message: 'Failed to fetch user requests', error });
  }
};





export const fetchCompletedRequests = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10 if not provided

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Convert query params to numbers
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (pageNumber <= 0 || limitNumber <= 0) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    // Fetch completed requests with pagination and sort by most recent updatedAt
    const requests = await RequestModel.find(
      {
        userId, // Match userId
        stattusof: 'completed', // Match completed status
      },
      'movie_title chat_title stattusof time orderId nameofservice date createdAt updatedAt' // Select specific fields
    )
      .sort({ updatedAt: -1 }) // Sort by most recent updatedAt
      .skip((pageNumber - 1) * limitNumber) // Skip the records for pagination
      .limit(limitNumber); // Limit the number of records per page

    // Fetch the total number of completed requests to calculate the total pages
    const totalRequests = await RequestModel.countDocuments({
      userId,
      stattusof: 'completed',
    });

    const totalPages = Math.ceil(totalRequests / limitNumber);

    return res.status(200).json({
      totalItems: totalRequests,
      totalPages,
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      requests,
    });
  } catch (error) {
    console.error('Error fetching completed requests:', error);
    return res.status(500).json({ message: 'Failed to fetch completed requests', error });
  }
};



const isTimeMatch = (requestTime: Time, appointmentTime: Time): boolean => {
  return (
    requestTime.hours === appointmentTime.hours &&
    requestTime.minutes === appointmentTime.minutes &&
    requestTime.seconds === appointmentTime.seconds
  );
};

const parseDateFromQuery = (dateQuery: string | string[] | undefined): Date | null => {
  if (Array.isArray(dateQuery)) {
    // If it's an array, pick the first value (you can adjust this based on your use case)
    dateQuery = dateQuery[0];
  }

  if (typeof dateQuery === 'string') {
    const parsedDate = new Date(dateQuery);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate; // Return valid Date object
    }
  }

  return null; // Return null if invalid or undefined
};

export const fetchSingleRequest = async (req: Request, res: Response): Promise<Response> => {
  const { orderId } = req.params; // Extract orderId from params

  try {
    // Fetch the request by orderId, selecting specific fields
    const request = await RequestModel.findOne(
      { orderId },
      'chat_title stattusof time userId orderId nameofservice date createdAt booktime endTime'
    );

    // If request is not found
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Fetch user information using userId from the request
    const userinfo = await User.findById(
      new mongoose.Types.ObjectId(request.userId),
      'fname lname email profilepics role expertise'
    );

    if (!userinfo) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch the appointment using the orderId to get the consultant ID (cid)
    const appointment = await AppointmentModel.findOne(
      { orderId },
      'cid date time'
    );

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Extract `booktime` to calculate `startTime` and `endTime`
    const { booktime } = request.toObject(); // Convert Mongoose document to plain JS object
    let startTime: string | null = null;
    let endTime: string | null = null;

    if (booktime) {
      // Ensure `booktime` is formatted in GMT+1
      const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
      startTime = moment(booktime).utcOffset('+01:00').format(gmtPlusOneFormat);

      // Calculate `endTime` by adding 1 hour to `booktime`
      // const endDateTime = add(new Date(booktime), { hours: 1 });
      // endTime = moment(endDateTime).utcOffset('+01:00').format(gmtPlusOneFormat);
    }

    // Send a single response with the updated request and consultant ID
    return res.status(200).json({
      ...request.toObject(),
      startTime,
      userinfo,
      consultantId: appointment.cid, // Include cid in the response
    });
  } catch (error) {
    console.error('Error fetching request:', error);
    return res.status(500).json({ message: 'Failed to fetch request', error });
  }
};

export const fetchNotificationsForUser = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { page = 1, limit = 10, isRead } = req.query; // Pagination and filter options
  const token = req.headers.authorization?.split(' ')[1];

  try {
    // Validate token presence
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Decode and verify the token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as { userId: string; role: string };

    // Check if the role is 'user' and userId matches
    if (decoded.role !== 'user' || decoded.userId !== userId) {
      return res.status(403).json({ message: 'Access denied. User role and matching userId required.' });
    }

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Parse pagination parameters
    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);

    // Build the query filter
    const filter: Record<string, any> = { userId };
    if (typeof isRead === 'string') {
      filter.isRead = isRead === 'true';
    }

    // Fetch notifications with pagination and sorting
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 }) // Most recent notifications first
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    // Get the total count for pagination
    const totalDocuments = await Notification.countDocuments(filter);

    return res.status(200).json({
      message: 'Notifications fetched successfully.',
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments,
      },
      notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications', error });
  }
};

export const fetchUserUpcomingRequest = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query; // Default values for pagination

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Parse pagination parameters
    const pageNumber = Math.max(Number(page), 1); // Ensure page is at least 1
    const pageSize = Math.max(Number(limit), 1); // Ensure limit is at least 1

    // Query requests with matching userId and "ongoing" status
    const filter = {
      userId, // Match userId
      type: 'Chat',
      stattusof: 'ongoing', // Only match "ongoing" status
    };

    // Fetch total number of matching requests for pagination metadata
    const totalDocuments = await RequestModel.countDocuments(filter);

    // Fetch paginated requests sorted by `booktime` in ascending order
    const requests = await RequestModel.find(
      filter,
      'chat_title stattusof time orderId nameofservice date createdAt booktime endTime' // Select specific fields
    )
      .sort({ booktime: 1 }) // Sort by `booktime` in ascending order
      .skip((pageNumber - 1) * pageSize) // Skip requests for previous pages
      .limit(pageSize); // Limit to the specified number of items per page

    // Filter requests to include only those with a `booktime` later than the current date and time
    const validRequests = requests.filter((request) => {
      const { booktime } = request;
      if (booktime) {
        const mydate = new Date(booktime);
        return mydate > new Date(); // Include only future `booktime`
      }
      return false;
    });

    // Send a single response
    return res.status(200).json({
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments,
      },
      requests: validRequests,
    });
  } catch (error) {
    console.error('Error fetching user upcoming requests:', error);
    return res.status(500).json({ message: 'Failed to fetch user upcoming requests', error });
  }
};


export const fetchAwaitingRequests = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;  // Default to page 1 and limit 10 if not provided

  try {
    // Validate the userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Convert query params to numbers
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (pageNumber <= 0 || limitNumber <= 0) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    // Fetch completed requests with pagination
    const requests = await RequestModel.find(
      {
        userId, // Match userId
        stattusof: 'awaiting', // Match completed status
      },
      'movie_title chat_title stattusof time orderId nameofservice date cid booktime createdAt' // Select specific fields
    )
    .skip((pageNumber - 1) * limitNumber)  // Skip the records for pagination
    .limit(limitNumber);  // Limit the number of records per page

    // Fetch the total number of completed requests to calculate the total pages
    const totalRequests = await RequestModel.countDocuments({
      userId,
      stattusof: 'completed',
    });

    const totalPages = Math.ceil(totalRequests / limitNumber);

    return res.status(200).json({
      totalItems: totalRequests,
      totalPages,
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      requests,
    });
  } catch (error) {
    console.error('Error fetching completed requests:', error);
    return res.status(500).json({ message: 'Failed to fetch completed requests', error });
  }
};

export const getDailyAvailability = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params; // Consultant ID
  const { date } = req.query; // Date (YYYY-MM-DD)

  try {
    // Validate input
    if (!cid) {
      return res.status(400).json({ message: 'Consultant ID is required' });
    }

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ message: 'Invalid or missing date. Use YYYY-MM-DD format.' });
    }

    // Validate date format
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD format.' });
    }

    // Get the day of the week from the provided date
    const dayOfWeek = moment(date, 'YYYY-MM-DD').format('dddd');

    // Fetch availability for the specified day
    const availability = await AvailabilityModel.find({
      cid,
      day: dayOfWeek,
      status: 'open',
    });

    if (availability.length === 0) {
      return res.status(404).json({ message: 'No availability found for the given day', availableHours: [] });
    }

    // Create an object to track the availability for each 2-hour slot
    const timeSlots: { [key: string]: { available: number; isAvailable: boolean } } = {};

    availability.forEach(slot => {
      const startTime = moment()
        .hours(slot.otime.hours)
        .minutes(slot.otime.minutes)
        .seconds(slot.otime.seconds);
      const endTime = moment()
        .hours(slot.ctime.hours)
        .minutes(slot.ctime.minutes)
        .seconds(slot.ctime.seconds);

      let currentTime = startTime.clone();

      while (currentTime.isBefore(endTime)) {
        const time = currentTime.format('HH:mm');
        timeSlots[time] = {
          available: 1,
          isAvailable: true,
        };
        currentTime.add(2, 'hours');
      }
    });

    // Convert the time slots object to an array
    const availableHoursCount = Object.keys(timeSlots).map(time => ({
      time,
      available: timeSlots[time].available,
      isAvailable: timeSlots[time].isAvailable,
    }));

    return res.status(200).json({
      message: 'Available hours calculated successfully',
      availableHoursCount,
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return res.status(500).json({ message: 'Failed to fetch daily availability', error });
  }
};


export const updateRequestAndCreateAppointment = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params; // Consultant ID
  const { time, date, orderId } = req.body; // Time, date, and order ID

  try {
    // Validate input
    if (!mongoose.Types.ObjectId.isValid(cid)) {
      return res.status(400).json({ message: 'Invalid consultant ID' });
    }
    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required' });
    }
    if (!time || !moment(time, 'HH:mm:ss', true).isValid()) {
      return res.status(400).json({ message: 'Invalid time format. Use HH:mm:ss.' });
    }
    if (!date || !moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // Check if the request is ongoing
    const existingRequest = await RequestModel.findOne({ orderId });

    if (!existingRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (existingRequest.stattusof === 'ongoing') {
      return res.status(400).json({ message: 'Request is already ongoing' });
    }

    console.log('Consultant_Submitted', cid);

    // Parse `time` string into `Time` object
    const [hours, minutes, seconds] = time.split(':').map(Number);

    // Create a new appointment
    const newAppointment = new AppointmentModel({
      date,
      time: { hours, minutes, seconds }, // Convert time to an object matching the schema
      uid: existingRequest.userId,
      cid: existingRequest.cid,
      orderId,
      expertise: existingRequest.expertise,
    });

    const savedAppointment = await newAppointment.save();

        // Update `stattusof` to "ongoing"
        const updatedRequest = await RequestModel.findOneAndUpdate(
          { orderId },
          { stattusof: 'ongoing' },
          { new: true }
        );
    
        // Handle potential null value for `updatedRequest`
        if (!updatedRequest) {
          return res.status(500).json({ message: 'Failed to update the request status' });
      }

    // Send notifications and email
    createNotification(newAppointment.cid.toString(), newAppointment.uid.toString(), 'consultant', 'Chat', orderId.toString(), 'New Order', 'You have a New Order Match');
    createNotification(newAppointment.uid.toString(), newAppointment.cid.toString(), 'user', 'Chat', orderId.toString(), 'Chat Assigned', 'Your Chat Request Has Been Assigned to a Consultant');

    const email = await fetchConsultantEmail(cid);
    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: 'New Order',
          text: `You Have A New Order`,
        });
        console.log('Email sent successfully.');
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    } else {
      console.log('Consultant not found');
    }

    return res.status(200).json({
      message: 'Request updated to ongoing, and appointment created successfully',
      updatedRequest,
      appointment: savedAppointment,
    });
  } catch (error) {
    console.error('Error processing request and creating appointment:', error);
    return res.status(500).json({ message: 'Failed to process request', error });
  }
};

export const fetchUserSpecificIssues = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.query; // Optional filter for issue status
  const { uid } = req.params; // Extract user ID from request parameters
  const { page = 1, limit = 10 } = req.query; // Default values for page and limit

  try {
    // Ensure UID is valid
    if (!mongoose.Types.ObjectId.isValid(uid)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Convert `page` and `limit` to numbers
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    // Validate pagination parameters
    if (pageNumber <= 0 || limitNumber <= 0) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    // Build the query: Match the UID and optionally filter by status
    const query = { uid, ...(status ? { status } : {}) };

    // Fetch issues with pagination
    const issues = await Issue.find(query)
      .populate({
        path: 'uid',
        model: User, // Link to the User model
        select: 'fname lname email phone role profilepics', // Select specific user fields to return
      })
      .skip((pageNumber - 1) * limitNumber) // Skip records for pagination
      .limit(limitNumber); // Limit the number of records per page

    // Get total count of issues for the user
    const totalIssues = await Issue.countDocuments(query);
    const totalPages = Math.ceil(totalIssues / limitNumber);

    if (!issues || issues.length === 0) {
      return res.status(404).json({ message: 'No issues found for the specified user' });
    }

    return res.status(200).json({
      message: 'User-specific issues retrieved successfully',
      totalItems: totalIssues,
      totalPages,
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      issues,
    });
  } catch (error) {
    console.error('Error fetching user-specific issues:', error);
    return res.status(500).json({
      message: 'Failed to fetch user-specific issues',
      error,
    });
  }
};
