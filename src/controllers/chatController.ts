import { Request, Response } from 'express';
import Message, {IMessage} from '../models/Message';
import path from 'path';
import ChatFile from '../models/ChatFiles';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, GetObjectAclCommand} from '@aws-sdk/client-s3';
import fs from 'fs';
import { Parser } from 'json2csv'; // Import json2csv
import Feedback from '../models/Feedback';
import PDFDocument from 'pdfkit';
import Issue from '../models/Issuess';
import User from '../models/User';
import mongoose, { Schema } from 'mongoose';
import IssuesThread from '../models/IssueThread';
import Consultant from '../models/consultant';
import Notification from '../models/Notification';

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
  
  // Configure multer to use S3 as the storage engine
  const storage = multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME || '',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    },
  });
  
  // Create multer upload function using S3 storage
export const upload = multer({ storage }).single('file');

// Function to save a new message
export const saveMessage = async (req: Request, res: Response) => {
  try {
    const { mid, uid, role, name, room, message, type, replyto, replytoId, replytousertype } = req.body;

    // Create the message object with conditional inclusion for replyto and replytoId
    const newMessageData: any = {
      mid,
      uid,
      role,
      name,
      room,
      message,
      type,
      timestamp: new Date(), // Automatically add the timestamp
    };

    if (replyto) newMessageData.replyto = replyto;
    if (replytoId) newMessageData.replytoId = replytoId;
    if (replytousertype) newMessageData.replytousertype = replytousertype;
    

    const newMessage = new Message(newMessageData);

    const savedMessage = await newMessage.save();
    res.status(201).json({ message: 'Message saved successfully', savedMessage });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ message: 'Error saving message' });
  }
};


export const fetchMessagesByRoom = async (req: Request, res: Response) => {
    try {
      const { room } = req.params;
  
      const messages: IMessage[] = await Message.find({ room }).sort({ timestamp: 1 });
      res.status(200).json({ messages });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Error fetching messages' });
    }
  };

  export const uploadChatFile = async (req: Request, res: Response) => {
    try {
      upload(req, res, async function (err) {
        if (err) {
          return res.status(500).json({ message: 'Error uploading file to S3', error: err.message });
        }
  
        const { mid, uid, role, name, room, type, replyto, replytoId, replytousertype } = req.body;
  
        // Check if file exists in the request
        if (!req.file) {
          return res.status(400).json({ message: 'File is required.' });
        }
  
        // Prepare message data and conditionally include replyto and replytoId
        const newMessageData: any = {
          mid,
          uid,
          role,
          name,
          room,
          message: (req.file as any).location,
          type,
          filename: (req.file as any).originalname,
          timestamp: new Date(), // Automatically add the timestamp
        };
  
        if (replyto) newMessageData.replyto = replyto;
        if (replytoId) newMessageData.replytoId = replytoId;
        if (replytousertype) newMessageData.replytousertype = replytousertype;
  
        const newMessage = new Message(newMessageData);
  
        const savedMessage = await newMessage.save();
  
        // Save file metadata to ChatFile model
        const chatFile = new ChatFile({
          uid,
          role,
          name,
          room,
          path: (req.file as any).location,
          filename: (req.file as any).originalname,
          filesize: (req.file as any).size, // The file size
          timestamp: new Date(),
        });
  
        await chatFile.save();
  
        console.log(`${chatFile.filename} ${chatFile.filesize} ${savedMessage.filename}`);
  
        res.status(201).json({ message: 'File uploaded successfully', file: chatFile });
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ message: 'Server error, unable to upload file' });
    }
  };
  
  // Fetch files by room
  export const getFilesByRoom = async (req: Request, res: Response) => {
    try {
      const { room } = req.params;
  
      // Find files by room
      const files = await ChatFile.find({ room });
  
      if (!files || files.length === 0) {
        return res.status(404).json({ message: 'No files found for this room' });
      }
  
      res.status(200).json({ files });
    } catch (error) {
      console.error('Error fetching files:', error);
      res.status(500).json({ message: 'Server error, unable to fetch files' });
    }
  };

  export const fetchMessagesAndExportCSV = async (req: Request, res: Response): Promise<Response> => {
    const { room } = req.params; // Room from request parameters
  
    try {
      // Fetch messages for the given room
      const messages = await Message.find({ room });
  
      if (!messages || messages.length === 0) {
        return res.status(404).json({ message: 'No messages found for this room' });
      }
  
      // Transform messages to set name as "Consultant" if role is consultant
      const transformedMessages = messages.map((message) => ({ 
        ...message.toObject(),
        name: (message.role as string) === 'consultant' ? 'Consultant' : message.name, 
      }));
  
      // Convert messages to CSV format
      const fields = ['uid', 'role', 'name', 'room', 'message', 'timestamp'];
      const json2csvParser = new Parser({ fields });
      const csvData = json2csvParser.parse(transformedMessages);
  
      // Create a temporary file path for the CSV file
      const filePath = path.join(__dirname, 'messages.csv');
  
      // Write CSV data to the file
      fs.writeFileSync(filePath, csvData);
  
      // Send the file as a download response
      res.download(filePath, 'messages.csv', (err) => {
        if (err) {
          console.error('Error downloading the file:', err);
          res.status(500).json({ message: 'Error downloading the file' });
        }
  
        // Optionally remove the file after download
        fs.unlinkSync(filePath);
      });
  
      return res; // Return response here for TypeScript compatibility
    } catch (error) {
      console.error('Error fetching messages:', error);
      return res.status(500).json({ message: 'Failed to fetch messages and generate CSV', error });
    }
  };
  


  export const fetchMessagesAndExportPDF = async (req: Request, res: Response): Promise<Response> => {
    const { room } = req.params; // Room from request parameters

    try {
        // Fetch messages for the given room
        const messages = await Message.find({ room });

        if (!messages || messages.length === 0) {
            return res.status(404).json({ message: 'No messages found for this room' });
        }

        // Filter messages by type and transform messages
        const transformedMessages = messages
            .filter((message) => message.type === 'text') // Omit non-text messages
            .map((message) => ({
                ...message.toObject(),
                name: (message.role as string) === 'consultant' ? 'Consultant' : message.name,
            }));

        if (!transformedMessages || transformedMessages.length === 0) {
            return res.status(404).json({ message: 'No text messages found for this room' });
        }

        // Create a new PDF document
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        // Define the file path for the PDF
        const filePath = path.join(__dirname, 'messages.pdf');

        // Create a write stream to the file
        const pdfStream = doc.pipe(fs.createWriteStream(filePath));

        // Title and spacing
        doc
            .font('Helvetica-Bold')
            .fontSize(18)
            .text(`Chat Messages for Room: ${room}`, { align: 'center' })
            .moveDown(2); // Add spacing between the header and the table

        // Add table headers
        const tableHeaderHeight = 100; // Start table headers lower
        const tableRowHeight = 25;
        const columnPositions = {
            index: 40,
            userId: 100,
            role: 250,
            name: 350,
            message: 450,
        };

        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('#', columnPositions.index, tableHeaderHeight)
            .text('User ID', columnPositions.userId, tableHeaderHeight)
            .text('Role', columnPositions.role, tableHeaderHeight)
            .text('Name', columnPositions.name, tableHeaderHeight)
            .text('Message', columnPositions.message, tableHeaderHeight);

        // Draw line under headers
        doc.moveTo(30, tableHeaderHeight + 15).lineTo(570, tableHeaderHeight + 15).stroke();

        // Add messages as rows
        transformedMessages.forEach((message, index) => {
            const yPosition = tableHeaderHeight + 20 + index * tableRowHeight;

            // Ensure new page if space runs out
            if (yPosition > 750) {
                doc.addPage();
            }

            doc
                .font('Helvetica')
                .fontSize(10)
                .text(String(index + 1), columnPositions.index, yPosition)
                .text(message.uid, columnPositions.userId, yPosition, { width: 140, ellipsis: true })
                .text(message.role, columnPositions.role, yPosition)
                .text(message.name, columnPositions.name, yPosition)
                .text(message.message, columnPositions.message, yPosition, { width: 100, ellipsis: true });
        });

        // Finalize the PDF
        doc.end();

        // Handle the download response after PDF generation
        pdfStream.on('finish', () => {
            res.download(filePath, 'messages.pdf', (err) => {
                if (err) {
                    console.error('Error downloading the file:', err);
                    res.status(500).json({ message: 'Error downloading the file' });
                }

                // Optionally remove the file after download
                fs.unlinkSync(filePath);
            });
        });

        return res; // Return response here for TypeScript compatibility
    } catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({ message: 'Failed to fetch messages and generate PDF', error });
    }
};

export const registerFeedback = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { orderId, userId, quality, speed, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid UID format' });
    }

    const objectIdUid = new mongoose.Types.ObjectId(userId);


    // Validate required fields
    if (!orderId || !userId || quality === undefined || speed === undefined) {
      return res.status(400).json({ message: 'orderId, userId, quality, and speed are required' });
    }

    // Create a new feedback record
    const feedback = new Feedback({
      orderId,
      userId: objectIdUid,
      quality,
      speed,
      reason,
    });

    // Save the feedback to the database
    await feedback.save();

    return res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback,
    });
  } catch (error) {
    console.error('Error registering feedback:', error);
    return res.status(500).json({
      message: 'Failed to submit feedback',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const fetchFeedbacksWithUsers = async (req: Request, res: Response): Promise<Response> => {
  const { orderId } = req.query; // Optional filter for feedbacks by orderId

  try {
      const query = orderId ? { orderId } : {}; // Filter feedbacks by orderId if provided

      // Fetch feedbacks and populate user details based on `userId`
      const feedbacks = await Feedback.find(query).populate({
          path: 'userId',
          model: User, // Link to the User model
          select: 'fname lname email phone role profilepics', // Select specific user fields to return
      });

      if (!feedbacks || feedbacks.length === 0) {
          return res.status(404).json({ message: 'No feedbacks found' });
      }

      return res.status(200).json({ message: 'Feedbacks retrieved successfully', feedbacks });
  } catch (error) {
      console.error('Error fetching feedbacks with users:', error);
      return res.status(500).json({ message: 'Failed to fetch feedbacks with users', error });
  }
};


export const fetchSingleFeedbackWithUser = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params; // Feedback ID from route parameters

  try {
      // Fetch feedback by ID and populate user details based on `userId`
      const feedback = await Feedback.findById(id).populate({
          path: 'userId',
          model: User, // Link to the User model
          select: 'fname lname email phone role profilepics', // Select specific user fields to return
      });

      if (!feedback) {
          return res.status(404).json({ message: 'Feedback not found' });
      }

      return res.status(200).json({ message: 'Feedback retrieved successfully', feedback });
  } catch (error) {
      console.error('Error fetching single feedback with user:', error);
      return res.status(500).json({ message: 'Failed to fetch feedback with user', error });
  }
};



export const reportIssue = async (req: Request, res: Response): Promise<Response> => {
  const { uid, orderId, title, complain, cid } = req.body;

  try {
    // Ensure uid is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(uid)) {
      return res.status(400).json({ message: 'Invalid UID format' });
    }

    const objectIdUid = new mongoose.Types.ObjectId(uid);

    const newIssue = await Issue.create({
      uid: objectIdUid, // Convert uid to ObjectId
      orderId,
      title,
      complain,
      status: 'pending', // Default status is 'pending'
      cid,
    });

    return res.status(201).json({ message: 'Issue reported successfully', issue: newIssue });
  } catch (error) {
    console.error('Error reporting issue:', error);
    return res.status(500).json({ message: 'Failed to report issue', error });
  }
};


export const fetchIssuesWithUsers = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.query; // Optional filter for issue status

  try {
      const query = status ? { status } : {}; // Filter issues by status if provided

      // Fetch issues and populate user details based on `uid`
      const issues = await Issue.find(query).populate({
          path: 'uid',
          model: User, // Link to the User model
          select: 'fname lname email phone role profilepics', // Select specific user fields to return
      });

      if (!issues || issues.length === 0) {
          return res.status(404).json({ message: 'No issues found' });
      }

      return res.status(200).json({ message: 'Issues retrieved successfully', issues });
  } catch (error) {
      console.error('Error fetching issues with users:', error);
      return res.status(500).json({ message: 'Failed to fetch issues with users', error });
  }
};


export const fetchSingleIssueWithUser = async (req: Request, res: Response): Promise<Response> => { 
  const { id } = req.query; // Issue ID from route parameters

  try {
    // Fetch the issue by ID, populate user (`uid`) details
    const issue = await Issue.findById(id).populate({
      path: 'uid',  // Populate user data
      model: User,  // User model
      select: 'fname lname email phone role profilepics', // User fields to include
    });

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    // Fetch all issue threads (IssuesThread) related to the issue
    const issueThreads = await IssuesThread.find({ isid: id }).sort({ createdAt: 1 });

    // Fetch consultant details based on cid
    let consultant = null;
    if (issue.cid) {
      consultant = await Consultant.findOne({ _id: issue.cid }).select('fname lname email phone profilepics expertise');
    }

    return res.status(200).json({
      message: 'Issue, associated threads, and consultant retrieved successfully',
      issue,
      issueThreads,
      consultant, // Include consultant data
    });
  } catch (error) {
    console.error('Error fetching issue, threads, and consultant:', error);
    return res.status(500).json({ message: 'Failed to fetch issue with threads and consultant', error });
  }
};

export const createIssueThread = async (req: Request, res: Response): Promise<Response> => {
  const { isid, reply, uid, role } = req.body; // Extract data from the request body

  // Input validation
  if (!isid || !reply || !uid || !role) {
    return res.status(400).json({ message: 'All fields (isid, reply, uid, role) are required' });
  }

  try {
    // Check if an IssueThread with the specified `isid` and role "admin" already exists
    const existingThread = await IssuesThread.findOne({ isid, role: 'admin' });

    // Create a new IssueThread
    const newThread = new IssuesThread({
      isid,
      reply,
      uid,
      role,
    });

    if (!existingThread) {
      if (role === 'admin') {
        // If no thread exists with role admin and the current role is admin, update issue status
        const updatedIssue = await Issue.findOneAndUpdate(
          { _id: isid }, // Assuming the `isid` matches the `_id` field in the `Issues` collection
          { status: 'opened' },
          { new: true } // Return the updated issue document
        );

        if (!updatedIssue) {
          return res.status(404).json({ message: 'Associated issue not found, but thread created' });
        }

        const savedThread = await newThread.save();
        return res.status(201).json({
          message: 'Issue thread created successfully and issue status updated to "opened"',
          thread: savedThread,
          issue: updatedIssue,
        });
      }
    }

    // Save the thread regardless of role if a thread already exists or role isn't admin
    const savedThread = await newThread.save();
    return res.status(201).json({
      message: 'Issue thread created successfully',
      thread: savedThread,
    });
  } catch (error) {
    console.error('Error creating issue thread:', error);
    return res.status(500).json({ message: 'Failed to create issue thread', error });
  }
};

export const markNotificationAsRead = async (req: Request, res: Response): Promise<Response> => {
  const { notificationId } = req.params; // ID of the notification to update

  try {
    // Find the notification by ID and update the `isRead` field to `true`
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true } // Return the updated document
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.status(200).json({
      message: 'Notification marked as read successfully',
      notification,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      message: 'Failed to mark notification as read',
      error,
    });
  }
};
