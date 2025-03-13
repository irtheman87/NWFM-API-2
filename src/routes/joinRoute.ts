import express, { Request, Response } from 'express';
import { createCrewMember, createCompany, createCrewCompany, loginCrewCompany, getCrewById, getCompanyById, updateCompanyDetails, updateCrewDetails, updateProfilePicture, updateCompanyProfilePicture, addEmailToList, handleMulterErrors } from '../controllers/joinController';

const router = express.Router();

 router.post('/crew', handleMulterErrors,createCrewMember);
 router.post('/company', handleMulterErrors, createCompany);
 router.post("/crewcompany", createCrewCompany);
 router.post("/crewcompany/login", loginCrewCompany);
 router.get("/crew/:id", getCrewById);
 router.get("/company/:id", getCompanyById);
 router.post("/company/update", handleMulterErrors, updateCompanyDetails);
 router.put("/update-crew", updateCrewDetails);
 router.post('/update-company-picture', handleMulterErrors, updateCompanyProfilePicture);
 router.post('/update-profile-picture', handleMulterErrors, updateProfilePicture);
 router.post("/email-list", addEmailToList);


module.exports = router;
