import { Request, Response } from 'express';
import moment from 'moment';
import RequestModel from '../models/Request';
import User from '../models/User';
import sendEmail from '../utils/sendEmail'; // Ensure this function is correctly implemented
import Transaction from '../models/SetTransaction';
import { credit } from '../utils/UtilityFunctions';
import AppointmentModel from '../models/Appointment';

export const updateExpiredRequests = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Get current time in GMT+1 and subtract 5 minutes
    const currentTime = moment().utcOffset('+01:00').subtract(5, 'minutes').toISOString();

    // Find all `Chat` requests that are `ongoing` and have an expired `endTime`
    const expiredRequests = await RequestModel.find({
      type: 'Chat',
      stattusof: 'ongoing',
      endTime: { $lte: currentTime }, // Requests where endTime is at least 5 min in the past
    });

    if (expiredRequests.length === 0) {
      return res.status(200).json({ message: 'No expired requests found.' });
    }

    // Loop through each request and process it
    for (const request of expiredRequests) {

      const transaction = await Transaction.findOne({ orderId: request.orderId }).exec();
        
      if (!transaction) {
        return res.status(404).json({ message: `Transaction with orderId ${request.orderId} not found` });
      }

      const appointment = await AppointmentModel.findOne({ orderId: request.orderId }).exec();
      if (!appointment) {
        return res.status(404).json({ message: `Appointment with orderId ${request.orderId} not found` });
      }
  
      if(request.stattusof === 'ongoing') {
        const price = transaction.price;
  
        const actualIncome = parseFloat(price) * 0.6;
            // Here you would perform the credit or debit operation (credit/cid, price or amount depending on your logic)
        credit(appointment.cid, actualIncome, request.orderId); // Example: assuming 'credit' needs `cid` and `price`
      }
      
      // Update the request status to `completed`
      await RequestModel.updateOne({ _id: request._id }, { $set: { stattusof: 'completed' } });

      // Fetch user details
      const user = await User.findById(request.userId);
      if (!user) {
        console.warn(`User not found for request ID: ${request._id}`);
        continue; // Skip if user not found
      }

      // Send email notification
      await sendEmail({
        to: user.email,
        subject: 'Chat Completed',
        text: `Thanks ${user.fname} ${user.lname} for using our chat service.

        <p>Hope you had a great session with your consultant. If you wish to continue chatting with the same consultant, 
        click on the continue existing chat button on your next request.</p>

        <p>If you had any issues regarding your last chat, open chat click on the action dropdown and click make a report.</p>

        <p>Looking forward to your next chat request.</p>
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
  <p>Thanks ${user.fname} ${user.lname} for using our chat service.</p>

<p>Hope you had a great session with your consultant. If you wish to continue chatting with the same consultant, 
        click on the continue chat button on your next request.</p>

        <p>If you had any issues regarding your last chat, open chat click on the action dropdown and click make a report.</p>

        <p>Looking forward to your next chat request.</p>
        </div>
        </body>
        </html>`,
      });

      console.log(`Email sent to ${user.email} for request ID: ${request._id}`);
    }

    return res.status(200).json({
      message: 'Expired requests updated and emails sent successfully',
      updatedCount: expiredRequests.length,
    });
  } catch (error) {
    console.error('Error updating requests:', error);
    return res.status(500).json({
      message: 'Failed to update requests',
      error: error,
    });
  }
};
