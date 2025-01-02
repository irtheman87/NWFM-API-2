import express, { Request, Response } from 'express';
import { createCrewMember, createCompany } from '../controllers/joinController';

const router = express.Router();

 router.post('/crew', createCrewMember);
 router.post('/company', createCompany);


module.exports = router;
