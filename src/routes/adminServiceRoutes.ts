import express, { Request, Response } from 'express';
import { addService } from '../controllers/adminServiceController';
import { isAdmin } from '../middleware/authMiddleware';

import multer from "multer";
import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { sendSMS } from '../utils/UtilityFunctions';

const router = express.Router();

// Admin route to add a service
router.post('/add-service', isAdmin, addService);

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Route to process CSV file and send personalized SMS
router.post('/upload-csv', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const results: { name: string; phone: string }[] = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data: { name: any; phone: any; }) => {
            if (data.name && data.phone) {
                results.push({ name: data.name, phone: data.phone });
            }
        })
        .on('end', async () => {
            try {
                for (const contact of results) {
                    const message = `Hello ${contact.name}, this is a test message!`;
                    await sendSMS(contact.phone, message);
                }

                // Delete the uploaded file after processing
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                res.status(200).json({ message: 'SMS sent successfully to all contacts', contacts: results });
            } catch (error) {
                console.error('Error sending SMS:', error);
                res.status(500).json({ message: 'Failed to send SMS', error });
            }
        })
        .on('error', (error: any) => {
            console.error('CSV Parsing Error:', error);
            res.status(500).json({ message: 'Error processing CSV file', error });
        });
});

module.exports = router;
function csv(): any {
    throw new Error('Function not implemented.');
}

