import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin';
import crypto from 'crypto';
import Extension, {IExtension} from '../models/Extension';
import RequestModel from '../models/Request';
import Consultant from '../models/consultant';
import AppointmentModel from '../models/Appointment';
import User from '../models/User';
import Transaction from '../models/SetTransaction';
import { createNotification } from '../utils/UtilityFunctions';
import sendEmail from '../utils/sendEmail';
import Task from '../models/task'; // Ensure this path points to your Task model file
import { format, parseISO, add } from 'date-fns';
import moment from 'moment-timezone';
import Issue from '../models/Issuess';
import IssuesThread from '../models/Issuess' 
import Feedback from '../models/Feedback';
import mongoose from 'mongoose';
import MusingModel from '../models/Musing';

// Generate Access Token
export const generateAccessToken = (userId: string, role: string) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
  );
};

// Generate Refresh Token
export const generateRefreshToken = (userId: string) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
  );
};

// Register Admin
export const registerAdmin = async (req: Request, res: Response) => {
  const { fname, lname, phone, email, password, expertise} = req.body;

  try {
    // Check for duplicate email
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      fname,
      lname,
      phone,
      email,
      password: hashedPassword,
      role: 'admin',
      expertise
    });

    await newAdmin.save();

    const accessToken = generateAccessToken(String(newAdmin._id), newAdmin.role);
    const refreshToken = generateRefreshToken(String(newAdmin._id));

    const adminInfo = {
      id: newAdmin._id,
      email: newAdmin.email,
      phone: newAdmin.phone,
      fname: newAdmin.fname,
      lname: newAdmin.lname,
      role: newAdmin.role,
      expertise: newAdmin.expertise
    };

    // const verificationLink = `${process.env.BASE_URL}/api/admin/verify/${verificationToken}`;
    // Optionally send verification email
    // await sendEmail(email, 'Verify your email', `Click here to verify your email: ${verificationLink}`);

    res.status(201).json({ accessToken, refreshToken, admin: adminInfo, message: 'Admin Registered Successfully.'});
  } catch (error) {
    if (isMongoError(error) && error.code === 11000) {
      res.status(400).json({ message: 'Admin with this email already exists' });
    } else if (error instanceof Error) {
      res.status(500).json({ message: 'Error registering admin', error: error.message });
    } else {
      res.status(500).json({ message: 'An unknown error occurred' });
    }
  }
};

function isMongoError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

// Login Admin
export const loginAdmin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    const admin = await Admin.findOne({ email });
    if (!admin || admin.role !== 'admin') {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const accessToken = generateAccessToken(String(admin._id), admin.role);
    const refreshToken = generateRefreshToken(String(admin._id));

    const adminInfo = {
      id: admin._id,
      fname: admin.fname,
      lname: admin.lname,
      phone: admin.phone,
      email: admin.email,
      role: admin.role,
      expertise: admin.expertise
    };

    // fetchAndUpdateRequests();

    res.json({ accessToken, refreshToken, admin: adminInfo });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
};

// Refresh Admin Token
export const refreshAdminToken = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  const refreshToken = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { userId: string };
    const accessToken = generateAccessToken(decoded.userId, 'admin');

    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const createExtension = async (req: Request, res: Response): Promise<Response> => {
  const { length, price } = req.body;

  // Validate the input fields
  if (typeof length !== 'number' || typeof price !== 'number') {
    return res.status(400).json({ message: 'Length and price must be numbers' });
  }

  try {
    const newExtension = new Extension({ length, price });
    const savedExtension = await newExtension.save();
    
    return res.status(201).json({
      message: 'Extension created successfully',
      extension: savedExtension,
    });
  } catch (error) {
    console.error('Error creating new extension:', error);

    // Type check for error to access the message
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    return res.status(500).json({
      message: 'Failed to create new extension',
      error: errorMessage,
    });
  }
};


export const fetchRequestsWithPagination = async (req: Request, res: Response): Promise<Response> => {
  const { page = 1, limit = 10, sort = 'createdAt', order = 'desc', status, type } = req.query;

  try {
    // Validate the Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);

    let filter: Record<string, any>;

    if (!status) {
      filter = {
        stattusof: { $in: ['pending', 'ongoing', 'completed'] }, // Match status from the list
      };
    } else {
      filter = {
        stattusof: { $in: [status] }, // Match status from the provided value
      };
    }
    
    if (type) {
      filter.type = type; // Add type filter only if provided
    }

    // Fetch paginated and sorted requests
    const requests = await RequestModel.find(filter)
      .sort({ [sort as string]: order === 'desc' ? -1 : 1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    // Fetch associated user and transaction details, filter transactions with status "completed"
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const transaction = await Transaction.findOne(
          { orderId: request.orderId, status: 'completed' }, // Match by orderId and status
          'orderId status price title' // Fetch specific fields
        );

        if (!transaction) return null; // Exclude requests with no "completed" transactions

        const user = await User.findById(request.userId, 'fname lname email profilepics'); // Fetch specific user details

        return {
          ...request.toObject(),
          user,
          transaction, // Include transaction details
        };
      })
    );

    // Filter out null values (requests with no completed transactions)
    const filteredRequests = requestsWithDetails.filter((request) => request !== null);

    const totalDocuments = await RequestModel.countDocuments(filter);

    return res.status(200).json({
      message: 'Requests fetched successfully.',
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments: filteredRequests.length,
      },
      requests: filteredRequests,
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch requests',
      error,
    });
  }
};



export const fetchConsultantsByExpertise = async (req: Request, res: Response): Promise<Response> => {
  const { expertise } = req.query;

  try {
    // Validate the expertise parameter
    if (!expertise || typeof expertise !== 'string') {
      return res.status(400).json({ message: 'Invalid or missing expertise parameter' });
    }

    // Fetch consultants with matching expertise and active status
    const consultants = await Consultant.find({ 
      expertise: expertise, 
      status: 'active' // Only include consultants with active status 
    }).select('fname lname _id expertise status'); // Only select the required fields

    if (consultants.length === 0) {
      return res.status(404).json({ message: 'No active consultants found with the specified expertise' });
    }

    return res.status(200).json({
      message: 'Active consultants fetched successfully',
      consultants,
    });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
};


export const fetchConsultants = async (req: Request, res: Response): Promise<Response> => {
  try {
    let consultants;
      // Fetch all consultants if expertise is not provided
      consultants = await Consultant.find().select('fname lname _id expertise');

    if (consultants.length === 0) {
      return res.status(404).json({ message: 'No consultants found' });
    }

    return res.status(200).json({
      message: 'Consultants fetched successfully',
      consultants,
    });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
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


export const fetchUserEmail = async (uid: string): Promise<string | null> => {
  try {
    // Find the consultant by ID and fetch only the email field
    const user = await User.findById(uid, 'email');
    return user?.email || null;
  } catch (error) {
    console.error('Error fetching consultant email:', error);
    throw new Error('Failed to fetch consultant email');
  }
};

export const createAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Extract and validate the Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;

    try {
      decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string); // Ensure JWT_ACCESS_SECRET is set
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract appointment details from the request body
    const { date, time, uid, cid, orderId, expertise } = req.body;

    // Validate the request body
    if (!date || !time || !uid || !cid || !orderId || !expertise) {
      return res.status(400).json({ message: 'Missing required appointment details' });
    }

    // Check if an appointment with the same `cid` and `date` already exists
 // Check if the count of appointments with the consultant on the given date is already 3
 const existingAppointmentsCount = await AppointmentModel.countDocuments({
  cid,
  date,
});

if (existingAppointmentsCount >= 3) {
  return res.status(409).json({
    message: 'The maximum number of appointments with this consultant on this date has been reached.',
  });
}

    // Create the new appointment
    const newAppointment = new AppointmentModel({
      date,
      time,
      uid,
      cid,
      orderId,
      expertise,
    });

    // Save the appointment to the database
    const savedAppointment = await newAppointment.save();

    // Consultant Notification Created
    createNotification(cid.toString(), uid.toString(), 'consultant', 'Chat', orderId.toString(), 'New Order', 'You have a New Order Match');
    // User Notification Created
    createNotification(uid.toString(), cid.toString(), 'user', 'Chat', orderId.toString(), 'Chat Assigned', 'Your Chat Request Has Been Assigned to a Consultant');

    const email = await fetchConsultantEmail(cid);
    if (email) {
      (async () => {
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
      })();
    } else {
      console.log('Consultant not found');
    }

    // Update the corresponding request with the same orderId and set its status to "ongoing"
    const updatedRequest = await RequestModel.findOneAndUpdate(
      { orderId }, // Match the orderId
      { stattusof: 'ongoing' }, // Update the stattusof field to "ongoing"
      { new: true } // Return the updated document
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'Request not found with the provided orderId.' });
    }

    return res.status(201).json({
      message: 'Appointment created successfully, and request status updated.',
      appointment: savedAppointment,
      updatedRequest,
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({
      message: 'Failed to create appointment',
      error,
    });
  }
};


export const fetchAllUsers = async (req: Request, res: Response): Promise<Response> => {
  const { page = 1, limit = 10, email } = req.query;

  try {
    // Extract and validate the Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Validate pagination parameters
    const pageNumber = Math.max(Number(page), 1);
    const pageSize = Math.max(Number(limit), 1);

    // Build the filter query
    const filter: Record<string, any> = {};
    if (email) {
      filter.email = { $regex: email, $options: 'i' }; // Case-insensitive search by email
    }

    // Fetch the total count of documents
    const totalDocuments = await User.countDocuments(filter);

    // Fetch paginated user details, excluding password
    const users = await User.find(filter)
      .select('-password') // Exclude the password field
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.status(200).json({
      message: 'Users fetched successfully.',
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalDocuments / pageSize),
        totalDocuments,
      },
      users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      message: 'Failed to fetch users',
      error,
    });
  }
};


export const createTask = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check if the Bearer token is provided
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { date, uid, cid, orderId, expertise, nameofservice, status, type } = req.body;

    // Validate required fields
    if (!date || !uid || !cid || !orderId || !expertise || !nameofservice || !status) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Check if the orderId is unique in the Task model
    const existingTask = await Task.findOne({ orderId });
    if (existingTask) {
      return res.status(400).json({ message: 'A task with this orderId already exists' });
    }

    // Create a new task
    const task = new Task({
      date,
      uid,
      cid,
      orderId,
      expertise,
      nameofservice,
      status,
      type: type || 'request', // Default to 'request' if type is not provided
    });

    // Save the task to the database
    const savedTask = await task.save();
    // Consultant Notification Created
    createNotification(cid.toString(), uid.toString(), 'consultant', 'Request', orderId.toString(), 'New Order', 'You have a New Order Match');
    // User Notification Created
    createNotification(uid.toString(),cid.toString(), 'user', 'Request', orderId.toString(), 'Request Assigned', 'Your Request Has Been Assigned to a Consultant');
    const email = await fetchConsultantEmail(cid);
    if (email) {
      (async () => {
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
      })();
  
    } else {
      console.log('Consultant not found');
    }

    // Update the `stattusof` field to "ongoing" for the matching `orderId` in the RequestModel
    const updatedRequest = await RequestModel.findOneAndUpdate(
      { orderId },
      { $set: { stattusof: 'ongoing' } },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'No request found with the provided orderId to update' });
    }

    return res.status(201).json({
      message: 'Task created successfully and request status updated to ongoing',
      task: savedTask,
      updatedRequest,
    });
  } catch (error) {
    console.error('Error creating task:', error);
    return res.status(500).json({ message: 'Failed to create task', error });
  }
};


// export async function fetchAndUpdateRequests() {
//   try {
//     const requests = await RequestModel.find({});

//     // Update endTime for each request
//     const updates = requests.map(async (request) => {
//       if (request.booktime) {
//         // const booktimeDate = new Date(request.booktime);
//         // const updatedEndTime = new Date(booktimeDate.getTime() + 60 * 60 * 1000); // Add 1 hour

//       const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
     
//       // Calculate `endTime` by adding 1 hour to `booktime`
//       const endDateTime = add(new Date(request.booktime), { hours: 1 });
//       const endTime = moment(endDateTime).utcOffset('+01:00').format(gmtPlusOneFormat);

//         request.endTime = endTime;
//         await request.save();
//       }
//     });

//     await Promise.all(updates);

//     console.log('All requests fetched and updated successfully.');
//     return requests;
//   } catch (error) {
//     console.error('Error fetching and updating requests:', error);
//     throw error;
//   }
// }

export const fetchTransactionStats = async (req: Request, res: Response): Promise<Response> => {
  try {

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Fetch transactions without `originalOrderId` whose status is completed
    const completedTransactions = await Transaction.find({
      originalOrderId: { $exists: false },
      status: 'completed',
    });

    // Total count of completed transactions
    const completedCount = completedTransactions.length;

    // Calculate total price of completed transactions
    const totalCompletedPrice = completedTransactions.reduce((sum, transaction) => {
      return sum + parseFloat(transaction.price);
    }, 0);

    // Fetch all transactions without `originalOrderId`
    const allTransactionsWithoutOriginal = await Transaction.find({
      originalOrderId: { $exists: false },
    });

    // Total count of all transactions without `originalOrderId`
    const totalTransactionsCount = allTransactionsWithoutOriginal.length;

    // Difference as Failed/Pending transactions
    const failedOrPendingCount = totalTransactionsCount - completedCount;

    // Return the stats in the response
    return res.status(200).json({
      completedCount,
      totalTransactionsCount,
      failedOrPendingCount,
      totalCompletedPrice: (totalCompletedPrice/100),
    });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    return res.status(500).json({ message: 'Failed to fetch transaction stats', error });
  }
};

export const fetchUserAndConsultantStats = async (req: Request, res: Response): Promise<Response> => {
  try {

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch total number of users
    const totalUsers = await User.countDocuments();

    // Fetch total number of consultants
    const totalConsultants = await Consultant.countDocuments();

    return res.status(200).json({
      totalUsers,
      totalConsultants,
    });
  } catch (error) {
    console.error('Error fetching user and consultant stats:', error);
    return res.status(500).json({
      message: 'Failed to fetch user and consultant stats',
      error,
    });
  }
};

export const fetchTopNewestUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check for admin role in the token payload
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch the top 5 newest user accounts sorted by creation date in descending order
    const newestUsers = await User.find({})
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(5) // Limit the result to the top 5
      .select('fname lname email profilepics createdAt') // Only fetch selected fields

    // Send the result
    return res.status(200).json({
      message: 'Top 5 newest user accounts retrieved successfully',
      data: newestUsers,
    });
  } catch (error) {
    console.error('Error fetching top 5 newest users:', error);
    return res.status(500).json({
      message: 'Failed to fetch top 5 newest users',
      error,
    });
  }
};

export const fetchMonthlyTransactionTotals = async () => {
  try {
    
    // Get the current year
    const currentYear = new Date().getFullYear();

    // Group transactions by month and calculate totals
    const monthlyTotals = await Transaction.aggregate([
      {
        $match: {
          status: 'completed', // Only completed transactions
          createdAt: {
            $gte: new Date(`${currentYear}-01-01T00:00:00Z`), // Start of the year
            $lte: new Date(`${currentYear}-12-31T23:59:59Z`), // End of the year
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" }, // Group by month
          totalTransactions: { $sum: 1 }, // Count transactions
          totalPrice: { $sum: { $toDouble: "$price" } }, // Sum up the price field
        },
      },
      {
        $sort: { _id: 1 }, // Sort by month (ascending)
      },
    ]);

    // Map month numbers to month names
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    // Convert results to include month names
    const formattedResults = monthlyTotals.map(({ _id, totalTransactions, totalPrice }) => ({
      month: monthNames[_id - 1], // Map the month number to its name (1-based index)
      totalTransactions,
      totalPrice,
    }));

    return formattedResults;
  } catch (error) {
    console.error('Error fetching monthly transaction totals:', error);
    throw new Error('Failed to fetch monthly transaction totals');
  }
};

export const fetchAllConsultants = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Verify Authorization Header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Extract pagination query parameters
    const page = parseInt(req.query.page as string, 10) || 1; // Default to page 1
    const limit = parseInt(req.query.limit as string, 10) || 10; // Default to 10 per page
    const skip = (page - 1) * limit;

    // Fetch consultants with pagination
    const consultants = await Consultant.find(
      { role: 'consultant', status: 'active' },
      'fname lname email phone expertise profilepics location createdAt' // Select specific fields
    )
      .skip(skip)
      .limit(limit);

    const totalConsultants = await Consultant.countDocuments({ role: 'consultant' });

    return res.status(200).json({
      consultants,
      pagination: {
        totalItems: totalConsultants,
        totalPages: Math.ceil(totalConsultants / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return res.status(500).json({ message: 'Failed to fetch consultants', error });
  }
};

export const createConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { fname, lname, email, phone, state, country, expertise } = req.body;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Check if the user is an admin
    // Validate input
    if (!fname || !lname || !email || !phone || !state || !country) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if consultant already exists
    const existingConsultant = await Consultant.findOne({ email });
    if (existingConsultant) {
      return res.status(409).json({ message: 'Consultant with this email already exists' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create the consultant
    const newConsultant = new Consultant({
      fname,
      lname,
      email,
      phone,
      expertise,
      status: 'inactive',
      location: { state, country },
      verificationToken,
    });

    await newConsultant.save();

    // Send verification email
    // const transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: {
    //     user: process.env.EMAIL_USER,
    //     pass: process.env.EMAIL_PASSWORD,
    //   },
    // });

    const verificationLink = `https://nollywood-filmaker-deploy.vercel.app/consultants/auth/set-password?token=${verificationToken}`;
    // const mailOptions = {
    //   to: email,
    //   subject: 'Verify Your Email',
    //   html: `
    //     <h1>Welcome to Our Platform, ${fname}!</h1>
    //     <p>Please click the link below to verify your email and set your password:</p>
    //     <a href="${verificationLink}">${verificationLink}</a>
    //   `,
    // };

    // await transporter.sendMail(mailOptions);

    (async () => {
      try {
        await sendEmail({
          to: email,
          subject: 'Account Created (Verify Your Email)',
          text: `You Consultant Account Has Been Created ${verificationLink}`,
        });
        console.log('Email sent successfully.');
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    })();

    return res.status(201).json({ message: 'Consultant created and verification email sent' });
  } catch (error) {
    console.error('Error creating consultant:', error);
    return res.status(500).json({ message: 'Failed to create consultant', error });
  }
};

export const fetchIssuesWithUserDetails = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Retrieve query parameters for pagination
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (pageNumber <= 0 || limitNumber <= 0) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }

    // Fetch issues with user details
    const issues = await Issue.find()
      .populate({
        path: 'uid',
        select: 'fname lname email profilepics',
        model: User,
      })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .sort({ createdAt: -1 }); // Sort by most recent issues first

    // Total number of issues for pagination
    const totalIssues = await Issue.countDocuments();

    // Prepare and send the response
    return res.status(200).json({
      message: 'Issues fetched successfully',
      totalItems: totalIssues,
      totalPages: Math.ceil(totalIssues / limitNumber),
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      issues: issues.map((issue) => ({
        id: issue._id,
        orderId: issue.orderId,
        title: issue.title,
        complain: issue.complain,
        status: issue.status,
        consultantId: issue.cid,
        createdAt: issue.createdAt,
        user: issue.uid, // Includes fname, lname, email, profilepics from population
      })),
    });
  } catch (error) {
    console.error('Error fetching issues:', error);
    return res.status(500).json({ message: 'Failed to fetch issues', error });
  }
};

export const closeIssue = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Issue ID from route parameters

  try {

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Check if issue exists
    const issue = await Issue.findById(id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    // Check if issue is already closed
    if (issue.status === 'closed') {
      return res.status(400).json({ message: 'Issue is already closed' });
    }

    // Update the status to "closed"
    issue.status = 'closed';
    await issue.save();

    return res.status(200).json({
      message: 'Issue status updated to closed successfully',
      issue,
    });
  } catch (error) {
    console.error('Error updating issue status:', error);
    return res.status(500).json({
      message: 'Failed to update issue status',
      error,
    });
  }
};

export const fetchConsultantById = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Consultant ID from route parameters

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    // Fetch consultant by ID, excluding password
    const consultant = await Consultant.findById(id).select('-password');

    if (!consultant) {
      return res.status(404).json({ message: 'Consultant not found' });
    }

    // Add dummy data
    const stats = {
      alltimerev: Math.floor(Math.random() * 10000) + 1000, // Random number between 1000 and 10999
      alltimependingrev: Math.floor(Math.random() * 5000) + 500, // Random number between 500 and 5499
      alltimeclaimedrev: Math.floor(Math.random() * 3000) + 200, // Random number between 200 and 3199
    };

    return res.status(200).json({
      message: 'Consultant retrieved successfully',
      consultant,
      ...stats,
    });
  } catch (error) {
    console.error('Error fetching consultant:', error);
    return res.status(500).json({ message: 'Failed to fetch consultant', error });
  }
};

export const fetchUserDetails = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // User ID from route parameters

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    const user = await User.findById(id).select('-password -verificationToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate the total number of successful transactions
    const successfulTransactions = await Transaction.find({
      userId: id,
      status: 'completed',
    });
    const totalTransactions = successfulTransactions.length;

    // Calculate the total price of successful transactions
    const totalPrice = successfulTransactions.reduce(
      (sum, transaction) => sum + parseFloat(transaction.price),
      0
    );

    // Fetch feedback and calculate the average ratings
    const feedbacks = await Feedback.find({ userId: id });
    const totalFeedbacks = feedbacks.length;

    const averageRatings = feedbacks.reduce(
      (averages, feedback) => {
        averages.quality += feedback.quality;
        averages.speed += feedback.speed;
        return averages;
      },
      { quality: 0, speed: 0 }
    );

    const averageQuality =
      totalFeedbacks > 0 ? averageRatings.quality / totalFeedbacks : 0;
    const averageSpeed =
      totalFeedbacks > 0 ? averageRatings.speed / totalFeedbacks : 0;

    // Fetch total number of chats with specified conditions
    const totalChats = await RequestModel.countDocuments({
      userId: id,
      type: 'Chat',
      stattusof: { $in: ['ongoing', 'completed'] },
    });

    return res.status(200).json({
      message: 'User details fetched successfully',
      user,
      metrics: {
        totalTransactions,
        totalPrice: (totalPrice/100),
        averageRatings: {
          quality: averageQuality,
          speed: averageSpeed,
        },
        totalChats,
      },
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    return res.status(500).json({ message: 'Failed to fetch user details', error });
  }
};

export const fetchCompletedUserRequests = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10 if not provided

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
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

export const getActiveRequestForConsultant = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Consultant ID
  const { page = 1, limit = 10, sort = 'desc' } = req.query;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Parse page and limit to integers
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;

    // Fetch all appointments and tasks for the given consultant ID
    const appointments = await AppointmentModel.find({ cid: id }, 'orderId');
    const tasks = await Task.find({ cid: id }, 'orderId');

    // Combine orderIds from appointments and tasks
    const combinedOrderIds = [
      ...appointments.map((appointment) => appointment.orderId),
      ...tasks.map((task) => task.orderId),
    ];

    // Fetch requests and user details for the combined orderIds
    const requestsWithDetails = await Promise.all(
      combinedOrderIds.map(async (orderId) => {
        const request = await RequestModel.findOne({
          orderId,
          stattusof: { $nin: ['pending', 'completed'] }, // Exclude 'pending' and 'completed'
        });

        if (request) {
          // Fetch user details by userId, excluding sensitive fields
          const user = await User.findById(request.userId).select('-password -isVerified -verificationToken -createdAt -updatedAt -expertise');

          if (user) {
            return {
              orderId,
              request: request.toObject(),
              user: user.toObject(), // Include user details
            };
          }
        }

        return null; // Exclude invalid or unmatched records
      })
    );

    // Filter out null values
    const validRequests = requestsWithDetails.filter((entry) => entry !== null);

    if (!validRequests.length) {
      return res.status(200).json({ message: 'No active requests found for this consultant' });
    }

    // Apply pagination to valid requests
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedRequests = validRequests.slice(startIndex, startIndex + limitNumber);

    // Return the list of requests with valid details
    return res.status(200).json({
      message: 'Active requests fetched successfully',
      page: pageNumber,
      limit: limitNumber,
      total: validRequests.length,
      requests: paginatedRequests,
    });
  } catch (error) {
    console.error('Error fetching active requests:', error);
    return res.status(500).json({ message: 'Failed to fetch active requests', error });
  }
};


export const fetchConsultantHistoryByCid = async (req: Request, res: Response): Promise<Response> => {
  const { cid } = req.params;
  const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token is missing or invalid' });
    }

    // Extract and verify token
    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret key is not configured' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check Admin Role
    const { role } = decodedToken as { role: string };
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Validate cid
    if (!cid || typeof cid !== 'string') {
      return res.status(400).json({ message: 'Invalid consultant ID (cid)' });
    }

    // Ensure page and limit are numbers
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({ message: 'Invalid page or limit parameter' });
    }

    // Fetch appointments and tasks with the given cid
    const appointments = await AppointmentModel.find({ cid }, 'orderId');
    const tasks = await Task.find({ cid }, 'orderId');

    // Combine orderIds and orderIdsss
    const combinedOrderIds = [...appointments.map((appointment) => appointment.orderId), ...tasks.map((task) => task.orderId)];

    // Fetch paginated completed requests
    const completedRequests = await RequestModel.find(
      {
        orderId: { $in: combinedOrderIds }, // Match the combined orderIds
        stattusof: 'completed', // Status must be completed
      },
      'movie_title chat_title stattusof time userId orderId nameofservice date createdAt updatedAt' // Select specific fields
    )
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .sort({ updatedAt: -1 }); // Sort by most recent updatedAt

    // Count total documents for pagination info
    const totalCount = await RequestModel.countDocuments({
      orderId: { $in: combinedOrderIds },
      stattusof: 'completed',
    });

    // Process musings and fetch user info
    const musings = [];
    for (const request of completedRequests) {
      const { userId } = request;

      // Fetch user details
      const user = await User.findById(userId, 'fname lname email profilepics role expertise');

      // Check if a musing already exists for the userId
      let musing = await MusingModel.findOne({ userId });

      // If no musing exists, create a new one with a summary placeholder
      if (!musing) {
        musing = await MusingModel.create({
          userId,
          summary: `Default summary for user: ${user?.fname} ${user?.lname}`,
        });
      }

      musings.push({
        request,
        userInfo: user,
        musing,
      });
    }

    return res.status(200).json({
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      currentPage: pageNumber,
      itemsPerPage: limitNumber,
      completedRequests: musings,
    });
  } catch (error) {
    console.error('Error fetching assignments and requests:', error);
    return res.status(500).json({
      message: 'Failed to fetch assignments and requests',
      error: error,
    });
  }
};
