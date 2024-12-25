import express, { Request, Response } from 'express';
import { registerUser, loginUser, refreshToken, updateUserById, updateUserPassword, updateUserProfilePic, fetchUserById, 
  upload, fetchUserPreferences, updatePreference, fetchUserProfilePic, 
  getAvailableHoursCount, checkTransactionStatus, fetchUserRequests, fetchCompletedRequests, 
  fetchSingleRequest, fetchAwaitingRequests} from '../controllers/UserController';
import { isnotAdmin } from '../middleware/authMiddleware';
import { fetchServicesByType } from '../controllers/ServicesController';
import Transaction from '../models/SetTransaction';
import { IUser } from '../models/User';
import { ReadScriptTransaction, WatchFinalCutTransaction, BudgetTransaction, CreateBudgetTransaction, CreateMarketBudgetTransaction, createAPitch, createLegal, chatTransaction,
  getParameterHandler, uploadFiles, ExtendMyTime
 } from '../controllers/TransactionController';
import { validateUserRequest, verifyUserToken } from '../middleware/TokenValidator';
import { verifyUserEmail } from '../controllers/utilityroute';
import { createAppointment } from '../services/appointmentService';
import { io, users } from '../index';
import { Time } from '../types';
import { fetchRequestByOrderId } from '../utils/UtilityFunctions';
import { requestPasswordReset, resetPassword, fetchNotificationsForUser, fetchUserUpcomingRequest, getDailyAvailability, updateRequestAndCreateAppointment, fetchUserSpecificIssues } from '../controllers/UserController';

 const crypto = require('crypto');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/services/type/:type', fetchServicesByType);
router.post('/transaction/read', verifyUserToken, uploadFiles, ReadScriptTransaction);
router.post('/transaction/watch', verifyUserToken, uploadFiles,  WatchFinalCutTransaction);
router.post('/transaction/budget', verifyUserToken, uploadFiles, BudgetTransaction);
router.post('/transaction/createbudget', verifyUserToken, uploadFiles, CreateBudgetTransaction);
router.post('/transaction/marketbudget', verifyUserToken, uploadFiles, CreateMarketBudgetTransaction);
router.post('/transaction/pitch', verifyUserToken, uploadFiles, createAPitch);
router.post('/transaction/legal', verifyUserToken, uploadFiles, createLegal);
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



// Protected route example
router.get('/profile', isnotAdmin, (req, res) => {
  res.json({ message: 'Access granted to protected profile route' });
});

router.get('/user/pending-request', validateUserRequest, (req, res) => {
  // Access the request object added by the middleware
  const request = req.body.request;
  res.json({ message: 'Pending request found', request });
});

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
        fetchRequestByOrderId(orderid); 
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