import express, { Request, Response } from 'express';
import { registerUser, loginUser, refreshToken, updateUserById, updateUserPassword, updateUserProfilePic, fetchUserById, 
  upload, fetchUserPreferences, updatePreference, fetchUserProfilePic, 
  getAvailableHoursCount, checkTransactionStatus, fetchUserRequests, fetchCompletedRequests, 
  fetchSingleRequest, fetchAwaitingRequests,
  submitContactForm,
  sendUserMessage,
  getServiceChatMessages} from '../controllers/UserController';
import { isnotAdmin } from '../middleware/authMiddleware';
import { fetchServicesByType } from '../controllers/ServicesController';
import Transaction from '../models/SetTransaction';
import User, { IUser } from '../models/User';
import { ReadScriptTransaction, WatchFinalCutTransaction, BudgetTransaction, CreateBudgetTransaction, CreateMarketBudgetTransaction, createAPitch, createLegal, chatTransaction,
  getParameterHandler, uploadFiles, ExtendMyTime, createPitchDeckRequest,
  updateRequestTime
 } from '../controllers/TransactionController';
import { validateUserRequest, verifyUserToken } from '../middleware/TokenValidator';
import { verifyUserEmail } from '../controllers/utilityroute';
import { createAppointment } from '../services/appointmentService';
import { io, users } from '../index';
import { Time } from '../types';
import { createAdminNotification } from '../utils/UtilityFunctions';
import { requestPasswordReset, resetPassword, fetchNotificationsForUser, fetchUserUpcomingRequest, getDailyAvailability, updateRequestAndCreateAppointment, fetchUserSpecificIssues } from '../controllers/UserController';
import { request } from 'http';
import sendEmail from '../utils/sendEmail';
import RequestModel from '../models/Request';
import UserModel from '../models/UserModel';
import { uploadCharacterBible, uploadLocalFiles } from '../utils/moreUtils';
import { convertTimeToUserTimezone } from '../controllers/adminController';
import AppointmentModel from '../models/Appointment';
import Consultant from '../models/consultant';

 const crypto = require('crypto');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/services/type/:type', fetchServicesByType);
// router.post('/transaction/read', verifyUserToken, uploadLocalFiles, uploadCharacterBible, ReadScriptTransaction);
router.post('/transaction/read', verifyUserToken, uploadFiles, ReadScriptTransaction);
router.post('/transaction/watch', verifyUserToken, uploadFiles,  WatchFinalCutTransaction);
router.post('/transaction/budget', verifyUserToken, uploadFiles, BudgetTransaction);
router.post('/transaction/createbudget', verifyUserToken, uploadFiles, CreateBudgetTransaction);
router.post('/transaction/marketbudget', verifyUserToken, uploadFiles, CreateMarketBudgetTransaction);
router.post('/transaction/pitch', verifyUserToken, uploadFiles, createAPitch);
router.post('/transaction/legal', verifyUserToken, uploadFiles, createLegal);
router.post('/transaction/deck', verifyUserToken, uploadFiles, createPitchDeckRequest);
router.post('/transaction/chat', verifyUserToken, uploadFiles, chatTransaction);
router.post('/updateuser/:userId',verifyUserToken, updateUserById);
router.post('/updatepassword/:userId',verifyUserToken, updateUserPassword);
router.post('/updatepic/:userId',verifyUserToken, upload, updateUserProfilePic);
router.get('/profile-user/:userId',verifyUserToken, fetchUserById);
router.get('/user-pref/:userId',verifyUserToken, fetchUserPreferences);
router.post('/update-pref/:userId', verifyUserToken, updatePreference);
router.get('/propic/:userId', verifyUserToken, fetchUserProfilePic);
router.get('/gethours/', verifyUserToken, getAvailableHoursCount);
router.post('/extendmytime', verifyUserToken, ExtendMyTime);
router.post('/forgotpassword', requestPasswordReset);
router.post('/resetpassword/:token', resetPassword);
router.get('/gettranstat/:reference', checkTransactionStatus);
router.get('/conversations/:userId', fetchUserRequests);
router.get('/requests/completed/:userId', fetchCompletedRequests);
router.get('/get-reference/:reference', getParameterHandler);
router.get('/verify/:token', verifyUserEmail);
router.get('/user/getaccess', refreshToken);
router.get('/conversation/:orderId', fetchSingleRequest);
router.get('/fetchnotifications/:userId', fetchNotificationsForUser);
router.get('/fetch/upcoming/:userId', fetchUserUpcomingRequest);
router.get('/fetch/awaiting/:userId', fetchAwaitingRequests);
router.get('/consultant/:cid/availability', getDailyAvailability);
router.post('/requests/:cid/createappointment', updateRequestAndCreateAppointment);
router.get('/issues/:uid', fetchUserSpecificIssues);
router.post('/contacted', submitContactForm);
router.post('/servicechat/user', sendUserMessage);
router.get('/servicechat/messages', getServiceChatMessages);
router.put('/continue-chat', verifyUserToken, updateRequestTime);

// Protected route example
router.get('/profile', isnotAdmin, (req, res) => {
  res.json({ message: 'Access granted to protected profile route' });
});

router.get('/user/pending-request', validateUserRequest, (req, res) => {
  // Access the request object added by the middleware
  const request = req.body.request;
  res.json({ message: 'Pending request found', request });
});

function toAllCaps(text: string): string {
  return text.toUpperCase();
}


// const secret = process.env.SECRET_KEY;
// Using Express
router.post('/webhook/url', async (req: Request, res: Response) => {
  try {
    const secret = process.env.SECRET_KEY as string;

    // Validate event signature
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.sendStatus(400); // Unauthorized if signature is invalid
    }

    const event = req.body;
    console.log(event.event);

    // Handle 'charge.success' event
    if (event.event === 'charge.success') {
      const { reference, status, customer } = event.data;

      console.log(`Payment successful. Reference: ${reference}`);

      // Update transaction in the database
      const result = await Transaction.findOneAndUpdate(
        { reference }, 
        { status: 'completed' },
        { new: true }
      );


  
     

      if(result?.type == "Chat"){
        console.log(result?.type);
        const orderid =  result?.orderId as string;
        //fetchRequestByOrderId(orderid); 

        let request = null;

        if(result.originalOrderIdFromChat){
          request = await RequestModel.findOne({ orderId: result.originalOrderIdFromChat });
          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }

          const appointment = await AppointmentModel.findOne({ orderId: result.originalOrderIdFromChat });

          if(!appointment){
            throw new Error("Appointment not found");
          }

          const consultant = await Consultant.findById(appointment.cid);
          if (!consultant) {
            throw new Error("Consultant not found"); // Handle case where consultant is not found
          }

          const user = await User.findById(request.userId);
          if (!user) {
            throw new Error("User not found"); // Handle case where user is not found
          }

          function formatDateForGoogleCalendar(date: Date): string {
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          }  

          const chatStart = new Date(request.usebooktimed ?? Date.now());
          // Adjust the time if it's always coming in 1hr behind your expected time:
          const adjustedChatStart = new Date(chatStart.getTime());
          
          // Set the event duration to 1 hour (adjust as needed)
          const chatEnd = new Date(adjustedChatStart.getTime() + 60 * 60 * 1000);
          
          // Generate the Google Calendar URL with pre-filled event details.
          const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
            request.nameofservice!
          )}&dates=${formatDateForGoogleCalendar(adjustedChatStart)}/${formatDateForGoogleCalendar(chatEnd)}&details=${encodeURIComponent(
            `Date Booked: ${request.createdAt}`
          )}`;

          await sendEmail({
            to: consultant.email,
            subject: 'New Chat Request',
            text: `Hello ${consultant.fname} ${consultant.lname},
          
          You have a request to Continue Chat from ${user.fname} ${user.lname}. Details below:
          
          Service Booked: ${request.nameofservice}
          Time for Chat: ${request.usebooktimed}
          Add to Google Calendar: ${googleCalendarUrl}
          
          View Order: https://nollywoodfilmmaker.com/consultants/dashboard
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
              <h1>Hello ${consultant.fname} ${consultant.lname},</h1>
              <p>You have a request to Continue Chat from ${user.fname} ${user.lname}. Details below:</p>
              <ul>
                <li><strong>Service Booked:</strong> ${request.nameofservice}</li>
                <li><strong>Time for Chat:</strong> ${request.usebooktimed}</li>
                <li><strong>Add to Google Calendar:</strong> <a href="${googleCalendarUrl}" target="_blank">Click here</a></li>
              </ul>
              <p>
                <a href="https://nollywoodfilmmaker.com/consultants/dashboard" 
                   style="display:inline-block; padding:10px 20px; color:#fff; background:#28a745; text-decoration:none; border-radius:5px;">
                  View Order
                </a>
              </p>
</div>
</body>
</html>
            `,
          });       

          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }
        }else{
          request = await RequestModel.findOne({ orderId: result.orderId });
          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }
          
        }

        const user = await User.findById(request.userId);
        if (!user) {
          throw new Error("User not found"); // Handle case where user is not found
        }
        
        // Ensure booktime is defined
        if (!request.booktime) {
          throw new Error("Book time is missing from the request");
        }

        let chatStartDate: Date;

        if (request.continued === true) {
          // Defensive checks before assigning to Date constructor
          if (!request.usebooktimed || !request.useendTimed) {
            throw new Error("Missing continuation timing details (usebooktimed or useendTimed).");
          }

          request.stattusof = "ongoing";
          chatStartDate = new Date(request.usebooktimed); // Make sure it's defined now
          request.booktime = request.usebooktimed;
          request.endTime = request.useendTimed;
          request.continued = false;
          await request.save();
        } else {
          chatStartDate = new Date(request.booktime); // Safe to assign now
        }
        
        // Helper function to format a Date for Google Calendar (YYYYMMDDTHHmmssZ)
        function formatDateForGoogleCalendar(date: Date): string {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        }
        
        
        // Parse the chat start time (now safe to assume it's defined)
        const chatStart = new Date(chatStartDate);
        // Adjust the time if it's always coming in 1hr behind your expected time:
        const adjustedChatStart = new Date(chatStart.getTime());
        
        // Set the event duration to 1 hour (adjust as needed)
        const chatEnd = new Date(adjustedChatStart.getTime() + 60 * 60 * 1000);
        
        // Generate the Google Calendar URL with pre-filled event details.
        const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          request.nameofservice!
        )}&dates=${formatDateForGoogleCalendar(adjustedChatStart)}/${formatDateForGoogleCalendar(chatEnd)}&details=${encodeURIComponent(
          `Date Booked: ${request.createdAt}`
        )}`;

        const price = (Number(result.price) / 100).toLocaleString();
        console.log(`Price: ${price}`);
        console.log(`Chat Start: ${chatStart}`);
        console.log(`Chat End: ${chatEnd}`);

        let userTimeZoneCreated;
    let userTimeZoneBookTime;

    if (request.createdAt && user.timezone) {
      userTimeZoneCreated = convertTimeToUserTimezone(request.createdAt, user.timezone);
      // Use userTimeZone...
    } else {
      console.log("createdAt is missing in request");
    }

    if (request.booktime && user.timezone) {
      userTimeZoneBookTime = convertTimeToUserTimezone(request.booktime, user.timezone);
      // Use userTimeZone...
    } else {
      console.log("Booked Time is missing in request");
    }



        
        await sendEmail({
          to: user.email,
          subject: 'Chat Request Confirmed',
          text: `Thanks ${user.fname} ${user.lname} for placing an order on our platform. Here are the details below:
        
        Service Booked: ${request.nameofservice}
        Price: ${price}
        Time for Chat: ${userTimeZoneBookTime}
        OrderId: ${request.orderId}

        Add to Google Calendar: ${googleCalendarUrl}

        <a href="https://www.youtube.com/playlist?list=PL9Rc2I3KoJiiNUO3zv9o161C3u-rDd5cp" target="_blank" style="color: #1a73e8; text-decoration: none;">
          Watch Tutorials here
        </a>
        
        <a href="https://nollywoodfilmmaker.com/services/read-my-script">Find some of our other services here</a>
        `,
          html: `  <!DOCTYPE html>
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
  
  <p>Thanks <strong>${user.fname} ${user.lname}</strong> for placing an order on our platform. Here are the details below:</p>
                 <p><strong>Service Booked:</strong> ${request.nameofservice}</p>
                 <p><strong>Price:</strong> ${price}</p>
                 <p><strong>Time for Chat:</strong> ${userTimeZoneBookTime}</p>
                 <p><strong>OrderId:</strong> ${request.orderId}</p>
                 <p>
                   <a href="${googleCalendarUrl}" target="_blank" style="color: #1a73e8; text-decoration: none;">
                     Add to Google Calendar
                   </a>
                 </p>
                 <p>
                 <a href="https://www.youtube.com/playlist?list=PL9Rc2I3KoJiiNUO3zv9o161C3u-rDd5cp" target="_blank" style="color: #1a73e8; text-decoration: none;">
          Watch Tutorials here
        </a>
                 </p>
                 <p>Here are some of our other services:</p>
                 <ul>
        <li><a href="https://nollywoodfilmmaker.com/services/read-my-script">Find some of our other services here</a></li>
            </ul>
            
            </div>

</body>
</html>`,
        });              
 
      }else if(result?.type == "request"){
        
        const request = await RequestModel.findOne({ orderId: result.orderId });

        if(!request){
          throw new Error("Request not found");
        }

        let tagMsg;

        if(request.nameofservice == "RRead my Script and advice"){
          tagMsg = "script";
        }else if(request.nameofservice == "Watch the Final cut of my film and advice"){
          tagMsg = "movie";
        }else{
          tagMsg = `Our team has started working on your request, your document will be available for download on your <a href="https://nollywoodfilmmaker.com/user/dashboard/order-details/${request.orderId}" style="color: #1a73e8; text-decoration: none;">
         dashboard
        </a> soon .

        <p>
        <b style='color:red'>Note</b>: You may be contacted by our consultant while processing your documents.
        </p>`
        }

          if (!request) {
            throw new Error("Request not found"); // Handle case where request is not found
          }

          const user = await User.findById(request.userId);

          if (!user) {
            throw new Error("User not found"); // Handle case where user is not found
          }

          const price = (Number(result.price) / 100).toLocaleString();

          await sendEmail({
            to: user.email,
            subject: `${toAllCaps(request.nameofservice ||  "")} Order Confirmed`,
            text: `Thanks ${user.fname} ${user.lname} for placing an order on our platform. Here are the details below:
            
        Service Booked: ${request.nameofservice}
        Price: ${price}
        Date Booked: ${request.createdAt}
        OrderId: ${request.orderId}

        <a href="https://www.youtube.com/playlist?list=PL9Rc2I3KoJiiNUO3zv9o161C3u-rDd5cp" target="_blank" style="color: #1a73e8; text-decoration: none;">
          Watch Tutorials here
        </a>
        
        <a href="https://nollywoodfilmmaker.com/services/read-my-script">Find some of our other services here</a>
        `,
            html: `<!DOCTYPE html>
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
  
                 <p>Thanks <strong>${user.fname} ${user.lname}</strong> for placing an order on our platform. 
                 Your <b>${toAllCaps(request.nameofservice ||  "")}</b> order has been recieved. ${tagMsg} </p>                 

                 <p><strong>Service Booked:</strong> ${request.nameofservice}</p>
                 <p><strong>Price:</strong> ${price}</p>
                 <p><strong>Date Booked:</strong> ${request.createdAt}</p>
                 <p><strong>OrderId:</strong> ${request.orderId}</p>
                 <p>
                 <a href="https://www.youtube.com/playlist?list=PL9Rc2I3KoJiiNUO3zv9o161C3u-rDd5cp" target="_blank" style="color: #1a73e8; text-decoration: none;">
          Watch Tutorials here
        </a>
                 </p>
                 <p>Here are some of our other services:</p>
                 <ul>
                <li><a href="https://nollywoodfilmmaker.com/services/read-my-script">Find some of our other services here</a></li>
            </ul>
            
            </div>

</body>
</html>`,
          });
 
      }

      if(result?.type == "Chat" || result?.type == "request"){
        createAdminNotification(result?.type, result?.orderId ,'New Service Order');
      }
      
     

      if (!result) {
        console.error(`Transaction with reference ${reference} not found.`);
        return res.status(404).json({ message: 'Transaction not found' });
      }

      // Assuming `result.userId` contains the ID of the user who made the transaction
      const userId = result.userId;

      // Check if user is connected, then emit the event
      if (userId && users[userId]) {
        io.to(users[userId]).emit('completed', {
          message: 'Your payment was successful!',
          transaction: result,
        });
        console.log(`Notification sent to user ${userId}`);
      } else {
        console.error(`User ${userId} not connected`);
      }

      console.log(`Transaction updated successfully: ${result}`);
    }

    res.sendStatus(200); // Acknowledge receipt of event
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;