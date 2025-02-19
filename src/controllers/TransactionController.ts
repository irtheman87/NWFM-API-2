import { Request, Response } from 'express';
import Transaction, {generateOrderId} from '../models/SetTransaction';
import RequesModel from '../models/Request'; // Adjust the path to your request model
import https from 'https'; // Ensure you import https if not already imported
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, GetObjectAclCommand} from '@aws-sdk/client-s3';
import { getServicePriceByName, fetchUserEmailById, fetchExtensionPriceByLength, convertToGMTPlusOne} from '../utils/UtilityFunctions';
import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, add } from 'date-fns';
import moment from 'moment-timezone';


interface PaystackResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}
// SetTransaction function
// Configure multer for file uploads
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Configure multer to use multer-s3 as the storage engine
const storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

// Configure multer to handle multiple files
export const uploadFiles = multer({ storage }).array('files', 10);

function getDayOfWeek(date: Date | string): string {
  // Convert date string to Date object if necessary
  const dayDate = typeof date === 'string' ? new Date(date) : date;

  // Array of day names
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Get day of week index and return corresponding name
  const dayIndex = dayDate.getDay();
  return daysOfWeek[dayIndex];
}



export const ReadScriptTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, movie_title, synopsis, genre, platform, concerns, fileName, showtype, episodes} = req.body;

  try {

    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    // const pageCountString = pageCount; // Example from FormData
    // const pageCountArray = JSON.parse(pageCountString);

    //  console.log(pageCountArray); // Output: [23, 44, 55, 55, 66]

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }

    // if (!Array.isArray(pageCountArray)) {
    //   return res.status(400).json({ message: "pageCount must be an array" });
    // }

    // Define the pricing rules
    // const rateOne = 5000000; // for pages between 20 and 50 (inclusive)
    // const rateTwo = 10000000; // for pages between 51 and 100 (inclusive)

    // Initialize the total price
    let totalPrice = 0;

    // // Loop through each page count in the array
    // for (const count of pageCountArray) {
    //   // Validate that each element is a number
    //   if (typeof count !== 'number') {
    //     return res.status(400).json({ message: "Each element in pageCount must be a number" });
    //   }

    //   // Check which pricing range the count falls into
    //   if (count >= 1 && count <= 50) {
    //     totalPrice += rateOne;
    //   } else if (count >= 51 && count <= 100) {
    //     totalPrice += rateTwo;
    //   } else {
    //     // If a page count is out of range, return an error or skip as needed.
    //     // Here, we choose to return an error.
    //     return res.status(400).json({ message: `Page count ${count} is out of the allowed range (20-100)` });
    //   }
    // }

    if(!showtype){
      totalPrice = Number(price);
    }else{
      totalPrice = (5000000 * Number(episodes)) + 5000000;
    }
  
    // Save transaction data
    const newTransaction = new Transaction({ title, userId, type, orderId: generateOrderId(), price: totalPrice, reference: '', status: 'processing' });
    await newTransaction.save();

    // Get file URLs from uploaded files if any
    const files = req.files as Express.MulterS3.File[] | undefined;
    const fileUrls = files ? files.map(file => file.location) : [];

    // Create a new request with file URLs or empty array if no files were uploaded
    const newRequest = new RequesModel({
      movie_title,
      synopsis,
      stattusof: 'pending',
      type,
      nameofservice: title,
      genre,
      platform: platform,
      concerns: concerns,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Editor',
      files: fileUrls, // Storing file URLs in the Request model
      filename: fileName,
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();

    // Prepare for payment initialization
    const currentId = newTransaction.id;

     const paymentReq = {
        body: {
          email: userEmail,
          amount: totalPrice,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }

  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};




export const WatchFinalCutTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, name, movie_title, synopsis, genre, platform, link, concerns, showtype, episodes } = req.body;

  try {
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }


    const newTransaction = new Transaction({title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' });
    await newTransaction.save();

      const newRequest = new RequesModel({
      movie_title,
      synopsis,
      stattusof: 'pending',
      type,
      nameofservice: title,
      link,
      genre,
      platform,
      concerns,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Director',
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();

    const currentId = newTransaction.id;
    // Send a single JSON response
    if(showtype && episodes > 1){
      const actualPrice = Number(price) - 5000000;
      const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: newPrice,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }


  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};

  
  
export const BudgetTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, movie_title, synopsis, genre, platform, budget, concerns, fileName, showtype, episodes } = req.body;

  // Log request body to verify incoming data
  console.log('Request body:', req.body);

  try {
    if (!title || !userId || !type) {
      return res.status(400).json({
        message: 'Missing required fields: title, userId, or type',
      });
    }

    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }

    const newTransaction = new Transaction({ title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' });
    await newTransaction.save();
    

    const files = req.files as Express.MulterS3.File[] | undefined;
    const fileUrls = files ? files.map(file => file.location) : [];

    const newRequest = new RequesModel({
      movie_title,
      synopsis,
      stattusof: 'pending',
      type,
      nameofservice: title,
      budget,
      genre,
      platform,
      concerns,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Editor',
      files: fileUrls,
      filename: fileName,
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();

    const currentId = newTransaction.id;
    if(showtype && episodes > 1){
      const actualPrice = Number(price) - 5000000;
      const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: newPrice,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }

  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};


  
export const CreateBudgetTransaction = async (req: Request, res: Response) => {
  const { 
    title, userId, type, name, movie_title, platform, 
    actors, crew, days, info, budgetrange,  fileName, showtype, episodes
  } = req.body;

  try {
    // Create and save new transaction
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }

    let transprice = 0; // Use `let` instead of `const`
    
    if (showtype) {
      transprice = Number(price) + 10000000;
    } else {
      transprice = Number(price);
    }


    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: transprice, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    const files = req.files as Express.MulterS3.File[] | undefined;
    const fileUrls = files ? files.map(file => file.location) : [];

    // Create and save new request
    const newRequest = new RequesModel({
      movie_title,
      stattusof: 'pending',
      type,
      nameofservice: title,
      platform,
      actors,
      crew,
      days,
      info,
      budgetrange,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Editor',
      files: fileUrls,
      filename: fileName,
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();

    // Send a single JSON response with status 201
    const currentId = newTransaction.id;
    // Send a single JSON response
    if(showtype){
      const actualPrice = Number(price) + 10000000;
      // const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: actualPrice,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }


  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};

  
  
export const CreateMarketBudgetTransaction = async (req: Request, res: Response) => {
  const { 
    title, userId, type, name, movie_title, platform, 
    link, social, ooh, budgetrange, showtype, episodes
  } = req.body;

  try {
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }

    let transprice = 0;
    
    if (showtype) {
      transprice = Number(price) + 10000000;
    } else {
      transprice = Number(price);
    }

    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: transprice, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    const newRequest = new RequesModel({
      movie_title,
      stattusof: 'pending',
      type,
      nameofservice: title,
      platform,
      link,
      socialTarget: social,
      oohTarget: ooh,
      budgetrange,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Editor',
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();

    const currentId = newTransaction.id;
    // Send a single JSON response
    if(showtype){
      const actualPrice = Number(price) + 10000000;
      // const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: actualPrice,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }


  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};

  
export const createAPitch = async (req: Request, res: Response) => {
  const { 
    title, userId, type, name, movie_title, platform, 
    actors, crew, visualStyle, info, budgetrange, fileName, showtype, episodes, pageCount
  } = req.body;

  try {
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    const pageCountString = pageCount; // Example from FormData
    const pageCountArray = JSON.parse(pageCountString);

     console.log(pageCountArray); // Output: [23, 44, 55, 55, 66]

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }

    if (!Array.isArray(pageCountArray)) {
      return res.status(400).json({ message: "pageCount must be an array" });
    }

    // Define the pricing rules
    const rateOne = 5000000; // for pages between 20 and 50 (inclusive)
    const rateTwo = 10000000; // for pages between 51 and 100 (inclusive)

    // Initialize the total price
    let totalPrice = 0;

    // Loop through each page count in the array
    for (const count of pageCountArray) {
      // Validate that each element is a number
      if (typeof count !== 'number') {
        return res.status(400).json({ message: "Each element in pageCount must be a number" });
      }

      // Check which pricing range the count falls into
      if (count >= 1 && count <= 50) {
        totalPrice += rateOne;
      } else if (count >= 51 && count <= 100) {
        totalPrice += rateTwo;
      } else {
        // If a page count is out of range, return an error or skip as needed.
        // Here, we choose to return an error.
        return res.status(400).json({ message: `Page count ${count} is out of the allowed range (20-100)` });
      }
    }
    
    totalPrice += 5000000;
    


    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: totalPrice, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    const files = req.files as Express.MulterS3.File[] | undefined;
    const fileUrls = files ? files.map(file => file.location) : [];

    const newRequest = new RequesModel({
      movie_title,
      stattusof: 'pending',
      type,
      nameofservice: title,
      platform,
      actors,
      crew,
      info,
      budgetrange,
      visualStyle,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Director',
      files: fileUrls,
      filename: fileName,
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();
    

    const currentId = newTransaction.id;
    // Send a single JSON response
      const paymentReq = {
        body: {
          email: userEmail,
          amount: totalPrice,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }

  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};


export const createLegal = async (req: Request, res: Response) => {
  const { 
    title, userId, type, name, movie_title, productionCompany, contacts, showtype, episodes 
  } = req.body;

  try {
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }
    


    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    const newRequest = new RequesModel({
      movie_title,
      stattusof: 'pending',
      type,
      nameofservice: title,
      productionCompany,
      contactInfo: contacts,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Editor',
      showtype: showtype,
      episodes: episodes,
    });
    await newRequest.save();

    const currentId = newTransaction.id;
    // Send a single JSON response
   
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};

function getTimeFromDate(date: Date) {
  // Ensure the date is a Date object
  const targetDate = new Date(date);

  // Extract hours, minutes, and seconds
  const hours = targetDate.getHours();
  const minutes = targetDate.getMinutes();
  const seconds = targetDate.getSeconds();

  return { hours, minutes, seconds };
}
// Exported chatTransaction function
export const chatTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, name, chat_title, date, time, summary, consultant} = req.body;

  try {
    // Create and save new transaction
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);
    
    const result = getTimeFromDate(time);

    const originalTime = new Date(time).toISOString(); // This will preserve the original time with its offset

    

    const booktime = {
      "hours": result.hours,
      "minutes": result.minutes,
      "seconds": result.seconds
    }


    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }
    


    const newTransaction = new Transaction({
      title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    let endTime: string | null = null;

    const currentId = newTransaction.id;

    const dayofWeek = getDayOfWeek(date);

    const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
    const endDateTime = add(new Date(time), { hours: 1 });
    endTime = moment(endDateTime).utcOffset('+01:00').format(gmtPlusOneFormat);

    // Create and save new request
    const newRequest = new RequesModel({
      chat_title,
      stattusof: 'pending',
      type,
      date,
      time: booktime,
      booktime: time,
      summary,
      consultant,
      nameofservice: title,
      orderId: newTransaction.orderId,
      userId,
      expertise: consultant,
      day: dayofWeek,
      endTime: endTime,
    });
    await newRequest.save();

    // Send a JSON response with status 201
    // res.status(201).json({
    //   message: 'Transaction and request created successfully',
    //   transaction: newTransaction,
    //   request: newRequest,
    // });

    // Proceed with payment initialization
    const paymentReq = {
      body: {
        email: userEmail,
        amount: price,
        id: currentId
      },
    };

    try {
      const result = await handlePaymentInitialization(paymentReq);
      console.log('Payment initialized successfully:', result);
      res.status(201).json({ message: 'Done', result });
    } catch (error: unknown) {
      console.error('Error during payment initialization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction and request',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};

export const ExtendMyTime = async (req: Request, res: Response) => {
  const { title, userId, type, length, orderId } = req.body;

  try {
    // Fetch price and user email
    const price = (await fetchExtensionPriceByLength(length))?.toString();
    const userEmail = await fetchUserEmailById(userId);

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
    
      // Check if the index named 'reference_1' exists
      const indexExists = indexes.some(index => index.name === 'reference_1');
    
      if (indexExists) {
        // Drop the index if it exists
        await Transaction.collection.dropIndex('reference_1');
        console.log('Index on "reference" dropped successfully.');
      } else {
        console.log('Index "reference_1" does not exist.');
      }
    } catch (error) {
      console.error('Error checking or dropping index:', error);
    }
    
    // Generate a unique reference
    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    const request = await RequesModel.findOne({ orderId });

    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    const { endTime } = request;
    if (!endTime) {
      return res.status(400).json({ message: 'endTime is missing for the request.' });
    }

    


    // Payment initialization
    const paymentReq = {
      body: {
        email: userEmail,
        amount: price,
        id: newTransaction.id
      },
    };

    try {
      const result = await handlePaymentInitialization(paymentReq);
      console.log('Payment initialized successfully:', result);
      res.status(201).json({ message: 'Done', result });
    } catch (error) {
      console.error('Error during payment initialization:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } catch (error) {
    if (error instanceof Error) {
      res.status(500).json({
        message: 'Error creating transaction',
        error: error.message,
      });
    } else {
      res.status(500).json({
        message: 'Unknown error occurred',
      });
    }
  }
};


async function handlePaymentInitialization(req: any, res?: any) {
  const { email, amount, id } = req.body;

  const params = JSON.stringify({ email, amount });

  const options = {
    hostname: 'api.paystack.co',
    port: 443,
    path: '/transaction/initialize',
    method: 'POST',
    headers: {
      Authorization: 'Bearer sk_live_f2385064d91a0c2b35d95c17e362cf9d8ee855fd', // Replace with your actual key
      'Content-Type': 'application/json',
    },
  };

  try {
    // Call the initializeTransaction function and inspect the response
    const paystackResponse = await initializeTransaction(params, options) as PaystackResponse;

    // Debugging: Check if paystackResponse exists and is structured correctly
    // console.log('Paystack Response:', paystackResponse);

    if (!paystackResponse) {
      return res?.status(500).json({ message: 'Failed to get response from Paystack' });
    }

    const { status, message, data } = paystackResponse;

    if (status) {
      // console.log('Payment initialized successfully:', data);

      const { authorization_url, access_code, reference } = data;

      // console.log('Authorization URL:', authorization_url);
      // console.log('Access Code:', access_code);
      // console.log('Reference:', reference);
      

      const transaction = await updateTransactionReference(id, reference);
      const mydata = {
        transaction,
        authorization_url,
        access_code,  // Ensure access_code is included
      };
      return mydata;
      console.log(transaction);

      if (!transaction) {
        res.status(404).json({
          message: 'Transaction not found',
        });
      }

          // res.status(201).json({
    //   message: 'Transaction and request created successfully',
    //   transaction: newTransaction,
    //   request: newRequest,
    // });

    // PostResponse(res, authorization_url, transaction);

      // Send all required data in the response
      // res.status(201).json({
      //   message: 'Payment initialized successfully',
      //   authorization_url,
      //   access_code,
      //   reference,
      //   transaction,
      // });
    } else {
      console.error('Failed to initialize payment:', message);
      res.status(400).json({ message });
    }
  } catch (error) {
    console.error('Error initializing payment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// function PostResponse(res: Response, authUrl: string, transaction: any) {
//   return res.status(200).json({
//     message: "Successful",
//     authorization_url: authUrl,
//     transaction: transaction,
//   });
// }

  // Local function to handle the Paystack transaction initialization
  async function initializeTransaction(params: string, options: any) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res: any) => {
        let data = '';
  
        res.on('data', (chunk: any) => {
          data += chunk;
        });
  
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (error: unknown) {  // Typing the error parameter
            reject(error);
          }
        });
      });
  
      req.on('error', (error: Error) => {  // Typing the error parameter
        reject(error);
      });
  
      req.write(params);
      req.end();
    });
  }

// Exported function that handles the GET request
export function getParameterHandler(req: Request, res: Response) {
  try {
    // Extract a parameter from the request
    const { reference } = req.params;

    if (!reference) {
      return res.sendStatus(400).json({ error: 'Reference parameter is required' });
    }

    // Perform some logic using the reference
    console.log('Received reference:', reference);

    // Send a success response
    res.sendStatus(200).json({
      message: 'Request successful',
      reference: reference
    });
  } catch (error: unknown) {
    console.error('Error handling request:', error);
    res.sendStatus(500).json({ error: 'Internal server error' });
  }
}

async function updateTransactionReference(id: string, reference: string) {
  try {
    // Find the transaction by ID and update its reference field
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      { reference },
      { new: true } // Returns the updated document
    );

    if (!updatedTransaction) {
      console.log(`Transaction with ID ${id} not found.`);
      return null;
    }

    // console.log('Transaction reference updated successfully:', updatedTransaction);
    return updatedTransaction;
  } catch (error) {
    console.error('Error updating transaction reference:', error);
    throw error;
  }
}

// export const uploadFiles = upload.array('files', 10); // Limit to max 10 files