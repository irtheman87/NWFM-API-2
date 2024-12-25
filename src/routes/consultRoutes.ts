import express, { Request, Response } from 'express';
import { registerConsult, loginConsult, refreshConsultantToken, createAvailability, fetchPendingAssignmentsByUserId, acceptAssignment, declineAssignment, 
  fetchTransactionAndRequestByOrderId, getAppointmentsByConsultantId, getPreferencesByUserId, getAvailabilityByCid, 
  fetchConsultantById, updateConsultantById, fetchConsultantProfilePicById, updateConsultantProfilePic, upload,getActiveRequest, refreshToken, 
  updateConsultantPassword, requestPasswordReset, resetPassword, fetchConsultantPref, updateConsultantPreference, 
  fetchHistoryByCid, fetchAssignmentsAndRequests, fetchPendingRequestsByConsultantExpertise, completeRequest, fetchNotifications, 
  getTasksByConsultant, handleChatTransaction, uploadConsultantFiles, fetchResolveFiles, verifyEmailAndSetPassword } from '../controllers/consultController';
import { isAdmin, isnotAdmin } from '../middleware/authMiddleware';
import { verifyConsultantToken } from '../middleware/TokenValidator';

const router = express.Router();

router.post('/register', registerConsult);
router.post('/login', loginConsult);
router.get('/consultant/getaccess', refreshToken);
router.post('/createavailability', createAvailability);
router.get('/fetchrequest/:uid', fetchPendingAssignmentsByUserId);
router.put('/assignments/:uid/:assignmentId/accept', acceptAssignment);
router.put('/assignments/:uid/:assignmentId/decline', declineAssignment);
router.get('/orderdetail/:orderId', fetchTransactionAndRequestByOrderId);
router.get('/appointments/:cid', getAppointmentsByConsultantId);
router.get('/preferences/:userId', getPreferencesByUserId);
router.get('/availability/:cid', getAvailabilityByCid);
router.get('/consultant/:id', fetchConsultantById);
router.put('/update/:id', verifyConsultantToken, updateConsultantById);
router.get('/profilepic/:id', fetchConsultantProfilePicById);
router.post('/update/:id', verifyConsultantToken, upload, updateConsultantProfilePic);
router.get('/activerequest/:id', getActiveRequest);
router.get('/getaccess', refreshToken);
router.post('/updatepassword/:userId',verifyConsultantToken, updateConsultantPassword);
router.post('/forgotpassword', requestPasswordReset);
router.post('/resetpassword/:token', resetPassword);
router.get('/consultant-preferences/:userId', fetchConsultantPref);
router.put('/consultant-preferences/:userId', updateConsultantPreference);
router.get('/assignments/:cid', fetchHistoryByCid);
router.get('/conversations/:cid', fetchAssignmentsAndRequests);
router.get('/requests/expertise/:cid', fetchPendingRequestsByConsultantExpertise);
router.post('/requests/complete', completeRequest);
router.get('/fetchnotifications/:userId', fetchNotifications);
router.get('/fetchtask/:cid', getTasksByConsultant);
router.post('/newchat', handleChatTransaction);
router.post('/resolve-files', uploadConsultantFiles);
router.get('/resolve/:orderId', fetchResolveFiles);
router.post('/verify-email', verifyEmailAndSetPassword);




router.get('/profile', isnotAdmin, (req, res) => {
    res.json({ message: 'Access granted to protected profile route' });
  });
  

  module.exports = router;
