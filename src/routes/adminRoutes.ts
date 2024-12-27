import express, { Request, Response } from 'express';
import { registerAdmin, loginAdmin, refreshAdminToken, createExtension, fetchRequestsWithPagination, fetchConsultantsByExpertise, 
    createAppointment, fetchAllUsers, createTask, fetchConsultants, fetchTransactionStats, fetchUserAndConsultantStats, 
    fetchTopNewestUsers, fetchMonthlyTransactionTotals, fetchAllConsultants, createConsultant, closeIssue, fetchConsultantById, fetchUserDetails } from '../controllers/adminController';
import { isAdmin } from '../middleware/authMiddleware';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/register', registerAdmin);
router.post('/login', loginAdmin);
router.get('/admin/getaccess', refreshAdminToken);
router.post('/extension/create', createExtension);
router.get('/pullrequests', fetchRequestsWithPagination);
router.get('/consultants', fetchConsultantsByExpertise);
router.post('/create/appointment', createAppointment);
router.get('/fetch/users', fetchAllUsers);
router.post('/create/task', createTask);
router.get('/pull/consultants', fetchAllConsultants);
// Add route to fetch transaction stats
router.get('/transactions/stats', fetchTransactionStats);

router.get('/stats/user-consultants', fetchUserAndConsultantStats);

router.get('/stats/newest-users', fetchTopNewestUsers);

router.get('/fetch/consultants', fetchAllConsultants);

router.post('/create/consultants', createConsultant);

router.patch('/set/issue/:id', closeIssue);

router.get('/fetch/consultants/:id', fetchConsultantById);

router.get('/fetch/users/:id', fetchUserDetails);



router.get('/transactions/monthly-totals', async (req: Request, res: Response) => {
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
      const totals = await fetchMonthlyTransactionTotals();
      return res.status(200).json({
        message: 'Monthly transaction totals fetched successfully',
        data: totals,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch monthly transaction totals',
        error: error,
      });
    }
  });

router.get('/profile', isAdmin, (req, res) => {
    res.json({ message: 'Access granted to protected profile route' });
});
  

module.exports = router;
