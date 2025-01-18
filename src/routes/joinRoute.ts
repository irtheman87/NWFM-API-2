import express, { Request, Response } from 'express';
import { createCrewMember, createCompany, createCrewCompany, loginCrewCompany, getCrewById, getCompanyById } from '../controllers/joinController';

const router = express.Router();

 router.post('/crew', createCrewMember);
 router.post('/company', createCompany);
 router.post("/crewcompany", createCrewCompany);
 router.post("/crewcompany/login", loginCrewCompany);
 router.get("/crew/:id", getCrewById);
 router.get("/company/:id", getCompanyById);


module.exports = router;
