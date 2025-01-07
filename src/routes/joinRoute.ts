import express, { Request, Response } from 'express';
import { createCrewMember, createCompany, createCrewCompany, loginCrewCompany, getCrewByEmail, getCompanyByEmail } from '../controllers/joinController';

const router = express.Router();

 router.post('/crew', createCrewMember);
 router.post('/company', createCompany);
 router.post("/crewcompany", createCrewCompany);
 router.post("/crewcompany/login", loginCrewCompany);
 router.get("/crew/:email", getCrewByEmail);
 router.get("/company/:email", getCompanyByEmail);


module.exports = router;
