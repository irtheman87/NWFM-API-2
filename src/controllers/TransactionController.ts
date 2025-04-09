import e, { Request, Response, Router } from 'express';
import Transaction, {generateOrderId} from '../models/SetTransaction';
import RequesModel from '../models/Request'; // Adjust the path to your request model
import https from 'https'; // Ensure you import https if not already imported
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, PutObjectCommand, GetObjectAclCommand} from '@aws-sdk/client-s3';
import { getServicePriceByName, fetchUserEmailById, fetchExtensionPriceByLength, convertToGMTPlusOne, createAdminNotification} from '../utils/UtilityFunctions';
import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, add } from 'date-fns';
import moment from 'moment-timezone';
import { zipAndUploadFiles } from '../utils/zipAndUpload';
import { captureOrder, createOrder } from '../utils/paypalService';
import { log } from 'console';
import sendEmail from '../utils/sendEmail';
import RequestModel from '../models/Request';
import AppointmentModel from '../models/Appointment';
import Consultant from '../models/consultant';
import { convertTimeToUserTimezone } from './adminController';
import User from '../models/User';
import { io, users } from '..';
const CC = require('currency-converter-lt')


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
export const uploadFiles = multer({ storage }).fields([
  { name: 'files', maxCount: 10 },
  { name: 'characterbible', maxCount: 1 },
  { name: 'keyart', maxCount: 10 }
]);


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
  const { title, userId, type, movie_title, synopsis, genre, platform, concerns, fileName, showtype, episodes, method} = req.body;

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

    if(showtype === "No"){
      totalPrice = Number(price);
    }else{
      totalPrice = (5000000 * Number(episodes)) + 5000000;
    }
  
    // Save transaction data
    const newTransaction = new Transaction({ title, userId, type, orderId: generateOrderId(), price: totalPrice, reference: '', status: 'processing' });
    await newTransaction.save();

    // Get file URLs from uploaded files if any
    const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };
    const uploadedFiles = files['files'] || [];
    const fileUrls = uploadedFiles.map(file => file.location);

    const characterBibleFile = files['characterbible']?.[0];
    const characterBibleUrl = characterBibleFile?.location;


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
      characterbible: characterBibleUrl,
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

      if(method === "paystack"){
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else if(method === "paypal"){
      try {

        const newAmount = (totalPrice/100)/1500;

        // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});

        // log('Converted amount::', currencyConverter.convertedValue);

        const cart = {
          currency: "USD",
          total: newAmount.toString(),
          id: newTransaction.orderId,
        };
        const { jsonResponse, httpStatusCode } = await createOrder(cart);
        res.status(httpStatusCode).json({
          jsonResponse,
          orderId: newTransaction.orderId
        });
        console.log('Order created successfully:', jsonResponse);



      } catch (error) {
        console.error("Failed to create order:", error);
        res.status(500).json({ error: "Failed to create order." });
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


// export const ReadScriptTransaction = async (req: Request, res: Response) => {
//   const { title, userId, type, movie_title, synopsis, genre, platform, concerns, fileName, showtype, episodes} = req.body;

//   try {

//     const price = await getServicePriceByName(title);
//     const userEmail = await fetchUserEmailById(userId);

//     // const pageCountString = pageCount; // Example from FormData
//     // const pageCountArray = JSON.parse(pageCountString);

//     //  console.log(pageCountArray); // Output: [23, 44, 55, 55, 66]

//     try {
//       // Get the list of indexes for the Transaction collection
//       const indexes = await Transaction.collection.indexes();
    
//       // Check if the index named 'reference_1' exists
//       const indexExists = indexes.some(index => index.name === 'reference_1');
    
//       if (indexExists) {
//         // Drop the index if it exists
//         await Transaction.collection.dropIndex('reference_1');
//         console.log('Index on "reference" dropped successfully.');
//       } else {
//         console.log('Index "reference_1" does not exist.');
//       }
//     } catch (error) {
//       console.error('Error checking or dropping index:', error);
//     }
    
//     let totalPrice = 0;

//     if(showtype === "No"){
//       totalPrice = Number(price);
//     }else{
//       totalPrice = (5000000 * Number(episodes)) + 5000000;
//     }
  
//     // Save transaction data
//     const newTransaction = new Transaction({ title, userId, type, orderId: generateOrderId(), price: totalPrice, reference: '', status: 'processing' });
//     await newTransaction.save();

//     // Get file URLs from uploaded files if any
//     const files = req.files as { [fieldname: string]: Express.Multer.File[] };
//     const uploadedFiles = files['files'] || [];

//     const zippedFileUrl = await zipAndUploadFiles(uploadedFiles);
//     const fileUrls = zippedFileUrl ? [zippedFileUrl] : [];

// const characterBibleFile = files['characterbible']?.[0];
// const characterBibleUrl = (characterBibleFile as Express.MulterS3.File | undefined)?.location;

//     // Create a new request with file URLs or empty array if no files were uploaded
//     const newRequest = new RequesModel({
//       movie_title,
//       synopsis,
//       stattusof: 'pending',
//       type,
//       nameofservice: title,
//       genre,
//       platform: platform,
//       concerns: concerns,
//       orderId: newTransaction.orderId,
//       userId,
//       expertise: 'Editor',
//       files: fileUrls, // Storing file URLs in the Request model
//       filename: fileName,
//       showtype: showtype,
//       episodes: episodes,
//       characterbible: characterBibleUrl,
//     });
//     await newRequest.save();

//     // Prepare for payment initialization
//     const currentId = newTransaction.id;

//      const paymentReq = {
//         body: {
//           email: userEmail,
//           amount: totalPrice,
//           id: currentId,
//         },
//       };
  
//       try {
//         const result = await handlePaymentInitialization(paymentReq);
//         console.log('Payment initialized successfully:', result);
//         res.status(201).json({ message: 'Transaction and request created successfully', result });
//       } catch (error: unknown) {
//         console.error('Error during payment initialization:', error);
//         res.status(500).json({ error: 'Internal server error' });
//       }

//   } catch (error: unknown) {
//     if (error instanceof Error) {
//       res.status(500).json({
//         message: 'Error creating transaction and request',
//         error: error.message,
//       });
//     } else {
//       res.status(500).json({
//         message: 'Unknown error occurred',
//       });
//     }
//   }
// };

export const WatchFinalCutTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, name, movie_title, synopsis, genre, platform, link, concerns, showtype, episodes, stage, method } = req.body;

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

    let alink: string[] = [];

    if (typeof link === 'string') {
      try {
        alink = JSON.parse(link);
      } catch (err) {
        console.error('Failed to parse link string', err);
        alink = [];
      }
    } else if (Array.isArray(link)) {
      alink = link;
    }
    
    console.log(alink); // now it's always an array

    // const files = req.files as Express.MulterS3.File[] | undefined;
    // const fileUrls = files ? files.map(file => file.location) : [];

    // // Optional check before continuing
    // if (!files || files.length === 0) {
    //   return res.status(400).json({ message: 'No file uploaded for character bible' });
    // }

    const newTransaction = new Transaction({title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' });
    await newTransaction.save();

      const newRequest = new RequesModel({
      movie_title,
      synopsis,
      stattusof: 'pending',
      type,
      nameofservice: title,
      links: alink,
      genre,
      platform,
      concerns,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Director',
      showtype: showtype,
      episodes: episodes,
      stage: stage,
    });
    await newRequest.save();

    const currentId = newTransaction.id;
    // Send a single JSON response
    if(showtype === "Yes" && episodes > 1){
      const actualPrice = 5000000;
      const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: newPrice,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (newPrice/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
  
  
  
        } catch (error) {
          console.error("Failed to create order:", error);
          res.status(500).json({ error: "Failed to create order." });
        }
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(price)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
  
  
  
        } catch (error) {
          console.error("Failed to create order:", error);
          res.status(500).json({ error: "Failed to create order." });
        }
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

export const CreateFilmTrailerTransaction = async (req: Request, res: Response) => {
  const {
    userId,
    title,
    type,
    workingTitle,
    filmUpload, // Google link
    dialogueTrack, // Google link
    hasMusic, // Yes/No
    musicLink, // Google link (if hasMusic is Yes)
    wantsOriginalScore, // Yes/No (adds 300k)
    originalScoreLink,
    hasTitleGraphic, // Yes/No (adds 100k)
    titleGraphicUpload, // Google link (if hasTitleGraphic is Yes)
    posterUpload, // Google link
    wantsVerticalFormat, // Yes/No (adds 100k)
    productionCompanyLogos, // Google link
    keyCastNames,
    directorName,
    fromTheMakersOf,
    releaseDate,
    info,
    method
  } = req.body;

  console.log('Request userId:', req.body.userId);

  try {
    // Fetch user email
    const userEmail = await fetchUserEmailById(userId);

    console.log('Request Email:', userEmail);

    // Base fee
    let totalPrice = 50000000;

    // Add additional costs
    if (wantsOriginalScore === "Yes") totalPrice += 30000000;
    if (hasTitleGraphic === "No") totalPrice += 10000000;
    if (wantsVerticalFormat === "Yes") totalPrice += 10000000;

    // Generate transaction
    const newTransaction = new Transaction({title, userId, type, orderId: generateOrderId(), price: totalPrice, reference: '', status: 'processing' });
    await newTransaction.save();


    await newTransaction.save();

    // Generate draft request
    const newRequest = new RequesModel({
      userId,
      type,
      stattusof: 'pending',
      nameofservice: title,
      orderId: newTransaction.orderId,
      movie_title: workingTitle,
      filmUpload,
      dialogueTrack,
      hasMusic,
      musicLink: hasMusic === "Yes" ? musicLink : "",
      wantsOriginalScore,
      originalScoreLink: wantsOriginalScore === "Yes" ? musicLink : "",
      hasTitleGraphic,
      titleGraphicUpload: hasTitleGraphic === "Yes" ? titleGraphicUpload : "",
      wantsVerticalFormat,
      posterUpload,
      productionCompanyLogos,
      keyCastNames: keyCastNames ? keyCastNames.map((name: string) => ({ name, role: "" })) : [],
      directorName,
      fromTheMakersOf,
      releaseDate,
      info,
      expertise: 'Director',
    });

    await newRequest.save();

    const paymentReq = {
      body: {
        email: userEmail,
        amount: totalPrice,
        id: newTransaction.id,
      },
    };

    // Handle payment initialization
   
    if(method === "paystack"){
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else if(method === "paypal"){
      try {

        const newAmount = (totalPrice/100)/1500;

        console.log(`Here Your Pay :::: ${newAmount}`);

        const cart = {
          currency: "USD",
          total: '200',
          id: newTransaction.orderId,
        };
        const { jsonResponse, httpStatusCode } = await createOrder(cart);
        res.status(httpStatusCode).json({
          jsonResponse,
          orderId: newTransaction.orderId
        });
        console.log('Order created successfully:', jsonResponse);
      } catch (error) {
        console.error("Failed to create order:", error);
        res.status(500).json({ error: "Failed to create order." });
      }
    }
  } catch (error) {
    console.error("Error creating transaction and request:", error);
    res.status(500).json({
      message: "Error creating transaction and request",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

  
export const BudgetTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, movie_title, synopsis, genre, platform, budget, concerns, fileName, showtype, episodes, method } = req.body;

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
    if(showtype === "Yes" && episodes > 1){
      const actualPrice = Number(price) - 5000000;
      const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: newPrice,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(newPrice)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
        } catch (error) {
          console.error("Failed to create order:", error instanceof Error ? error.message : error);
          res.status(500).json({ error: "Failed to create order." });
        }
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(price)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
  
  
  
        } catch (error) {
          console.error("Failed to create order:", error instanceof Error ? error.message : error);
          res.status(500).json({ error: "Failed to create order." });
        }
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
    actors, crew, shootdays, info, budgetrange,  fileName, showtype, episodes, method
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
    
    if (showtype === "Yes") {
      if(episodes < 6){
        transprice = 25000000;
      }else if(episodes >= 6 && episodes < 11){
        transprice = 35000000;
      }else if(episodes >= 11 && episodes < 16){  
        transprice = 45000000; 
      }else if(episodes >= 16 && episodes < 21){  
        transprice = 55000000; 
      }else if(episodes >= 21 && episodes < 26){
        transprice = 65000000;
      }else if(episodes >= 26 && episodes < 31){
        transprice = 75000000;  
      }
      
    } else {
      transprice = Number(price);
    }


    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: transprice, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };
    const uploadedFiles = files['files'] || [];
    const fileUrls = uploadedFiles.map(file => file.location);

    // Create and save new request
    const newRequest = new RequesModel({
      movie_title,
      stattusof: 'pending',
      type,
      nameofservice: title,
      platform,
      actors,
      crew,
      shootdays: shootdays,
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
      const paymentReq = {
        body: {
          email: userEmail,
          amount: transprice,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(transprice)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
        } catch (error) {
          console.error("Failed to create order:", error instanceof Error ? error.message : error);
          res.status(500).json({ error: "Failed to create order." });
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
    link, social, ooh, budgetrange, showtype, episodes, method
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
    if(showtype === "Yes"){
      const actualPrice = Number(price) + 10000000;
      // const newPrice = (actualPrice * Number(episodes)) + 5000000;
      const paymentReq = {
        body: {
          email: userEmail,
          amount: actualPrice,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(actualPrice)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
  
  
  
        } catch (error) {
          console.error("Failed to create order:", error instanceof Error ? error.message : error);
          res.status(500).json({ error: "Failed to create order." });
        }
      }
    }else{
      const paymentReq = {
        body: {
          email: userEmail,
          amount: price,
          id: currentId,
        },
      };
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(price)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
        } catch (error) {
          console.error("Failed to create order:", error instanceof Error ? error.message : error);
          res.status(500).json({ error: "Failed to create order." });
        }
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
    title, userId, type, days, movie_title, platform, 
    actors, startpop, genre, info, budgetrange, fileName, 
    showtype, episodes, characterlockdate, locationlockeddate, method
  } = req.body;

  try {
    const price = await getServicePriceByName(title);
    const userEmail = await fetchUserEmailById(userId);

    // Ensure pageCount is an array
    // let pageCountArray: number[];
    // try {
    //   pageCountArray = Array.isArray(pageCount) ? pageCount : JSON.parse(pageCount);
    // } catch (error) {
    //   return res.status(400).json({ message: "Invalid format for pageCount. Must be an array." });
    // }

    // console.log(pageCountArray); // Debugging output

    try {
      // Get the list of indexes for the Transaction collection
      const indexes = await Transaction.collection.indexes();
      const indexExists = indexes.some(index => index.name === 'reference_1');

      if (indexExists) {
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

    console.log(`Default Sever Price : ${price}`);

    let totalPrice = 0;

    if (showtype === "Yes") {
      totalPrice = 8000000 * Number(episodes);
    } else {
      totalPrice = Number(price);
    } // ✅ Fix: Close the if-else block properly

    console.log(`Total Price : ${totalPrice}`);


    const newTransaction = new Transaction({
      title,
      userId,
      type,
      orderId: generateOrderId(),
      price: totalPrice,
      reference: '',
      status: 'processing',
    });
    await newTransaction.save();

    const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };
    const uploadedFiles = files['files'] || [];
    const fileUrls = uploadedFiles.map(file => file.location);

    // Ensure characterlockdate & locationlockeddate are arrays
    let characterLockArray = [];
    let locationLockArray = [];
    
    try {
      characterLockArray = Array.isArray(characterlockdate)
        ? characterlockdate
        : characterlockdate && typeof characterlockdate === 'string'
          ? JSON.parse(characterlockdate)
          : [];
    
      locationLockArray = Array.isArray(locationlockeddate)
        ? locationlockeddate
        : locationlockeddate && typeof locationlockeddate === 'string'
          ? JSON.parse(locationlockeddate)
          : [];
    
      // Optional: validate again after parsing
      if (!Array.isArray(characterLockArray) || !Array.isArray(locationLockArray)) {
        return res.status(400).json({ message: "Parsed values are not arrays" });
      }
    
    } catch (error) {
      return res.status(400).json({ message: "Invalid JSON format for characterlockdate or locationlockeddate" });
    }

    let jstartpop;
    let jcharacterlockdate;
    let jlocationlockeddate;

    if (typeof startpop === 'string') {
       jstartpop = JSON.parse(startpop);
    }

    // if (typeof characterlockdate === 'string') {
    //   jcharacterlockdate = JSON.parse(characterlockdate);
    // }

    // if (typeof locationlockeddate === 'string') {
    //   jlocationlockeddate = JSON.parse(locationlockeddate);
    // }


    const newRequest = new RequesModel({ // ✅ Fix: Use correct model name
      movie_title,
      stattusof: 'pending',
      type,
      nameofservice: title,
      platform,
      actors,
      info,
      budgetrange,
      genre,
      orderId: newTransaction.orderId,
      userId,
      expertise: 'Director',
      files: fileUrls,
      filename: fileName,
      showtype,
      episodes,
      days,
      startpop: jstartpop, // ✅ Ensure correct format
      characterlockdate: characterLockArray, // ✅ Ensure correct format
      locationlockeddate: locationLockArray, // ✅ Ensure correct format
    });
    await newRequest.save();

    const currentId = newTransaction.id;

    // console.log(totalPrice);

    const paymentReq = {
      body: {
        email: userEmail,
        amount: totalPrice.toString(),
        id: currentId,
      },
    };

    if(method === "paystack"){
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else if(method === "paypal"){
      try {

        const newAmount = (Number(totalPrice)/100)/1500;

        // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});

        // log('Converted amount::', currencyConverter.convertedValue);

        const cart = {
          currency: "USD",
          total: newAmount.toString(),
          id: newTransaction.orderId,
        };
        const { jsonResponse, httpStatusCode } = await createOrder(cart);
        res.status(httpStatusCode).json({
          jsonResponse,
          orderId: newTransaction.orderId
        });
        console.log('Order created successfully:', jsonResponse);



      } catch (error) {
        console.error("Failed to create order:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Failed to create order." });
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


export const createLegal = async (req: Request, res: Response) => {
  const { 
    title, userId, type, name, movie_title, productionCompany, contacts, showtype, episodes , method
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
  
      if(method === "paystack"){
  
        try {
          const result = await handlePaymentInitialization(paymentReq);
          console.log('Payment initialized successfully:', result);
          res.status(201).json({ message: 'Transaction and request created successfully', result });
        } catch (error: unknown) {
          console.error('Error during payment initialization:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      }else if(method === "paypal"){
        try {
  
          const newAmount = (Number(price)/100)/1500;
  
          // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});
  
          // log('Converted amount::', currencyConverter.convertedValue);
  
          const cart = {
            currency: "USD",
            total: newAmount.toString(),
            id: newTransaction.orderId,
          };
          const { jsonResponse, httpStatusCode } = await createOrder(cart);
          res.status(httpStatusCode).json({
            jsonResponse,
            orderId: newTransaction.orderId
          });
          console.log('Order created successfully:', jsonResponse);
        } catch (error) {
          console.error("Failed to create order:", error instanceof Error ? error.message : error);
          res.status(500).json({ error: "Failed to create order." });
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

export const createPitchDeckRequest = async (req: Request, res: Response) => {
  const {
    title,
    userId,
    type,
    movie_title,
    platform,
    loglines,
    genre,
    info,
    estimatedBudget,
    keycharacters,
    keycrew,
    teamMenber,
    putinfestivals,
    revprojection,
    fundingtype,
    method
  } = req.body;

  try {
    // Fetch user email
    const userEmail = await fetchUserEmailById(userId);
    
    // Generate a new order ID
    const orderId = generateOrderId();

    const price = await getServicePriceByName(title);

    const newTransaction = new Transaction({ 
      title, userId, type, orderId: generateOrderId(), price: price, reference: '', status: 'processing' 
    });
    await newTransaction.save();

    // Handle file uploads (key art, script, etc.)
    const files = req.files as { [fieldname: string]: Express.MulterS3.File[] };
    const uploadedFiles = files['files'] || [];
    const fileUrls = uploadedFiles.map(file => file.location);

    const keyartfiles = files['keyart'] || [];
    const keyartfileUrls = keyartfiles.map(file => file.location);;

    // Create a new request entry
    const newRequest = new RequesModel({
      movie_title,
      stattusof: "pending",
      type,
      nameofservice: title,
      platform,
      loglines,
      genre,
      info,
      estimatedBudget,
      keycharacters: keycharacters ? JSON.parse(keycharacters) : [],
      keycrew: keycrew ? JSON.parse(keycrew) : [],
      teamMenber: teamMenber ? JSON.parse(teamMenber) : [],
      orderId: newTransaction.orderId,
      userId,
      putinfestivals,
      revprojection,
      fundingtype,
      files: fileUrls,
      keyArtCreated: keyartfileUrls,
      expertise: 'Director',
    });

    await newRequest.save();

    // Initialize payment (if applicable)
    const paymentReq = {
      body: {
        email: userEmail,
        amount: price || 0,
        id: newTransaction.id,
      },
    };

    if(method === "paystack"){
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else if(method === "paypal"){
      try {

        const newAmount = (Number(price)/100)/1500;

        // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});

        // log('Converted amount::', currencyConverter.convertedValue);

        const cart = {
          currency: "USD",
          total: newAmount.toString(),
          id: newTransaction.orderId,
        };
        const { jsonResponse, httpStatusCode } = await createOrder(cart);
        res.status(httpStatusCode).json({
          jsonResponse,
          orderId: newTransaction.orderId
        });
        console.log('Order created successfully:', jsonResponse);
      } catch (error) {
        console.error("Failed to create order:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Failed to create order." });
      }
    }
  } catch (error) {
    res.status(500).json({
      message: "Error creating pitch deck request",
      error: error instanceof Error ? error.message : "Unknown error",
    });
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

const getTimeFromDated = (dateString: string) => {
  const date = new Date(dateString);
  return {
    hours: date.getHours(),
    minutes: date.getMinutes(),
    seconds: date.getSeconds()
  };
};



// Exported chatTransaction function
export const chatTransaction = async (req: Request, res: Response) => {
  const { title, userId, type, name, chat_title, date, time, summary, consultant, method} = req.body;

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

    if(method === "paystack"){
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else if(method === "paypal"){
      try {

        const newAmount = (Number(price)/100)/1500;

        // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});

        // log('Converted amount::', currencyConverter.convertedValue);

        const cart = {
          currency: "USD",
          total: newAmount.toString(),
          id: newTransaction.orderId,
        };
        const { jsonResponse, httpStatusCode } = await createOrder(cart);
        res.status(httpStatusCode).json({
          jsonResponse,
          orderId: newTransaction.orderId
        });
        console.log('Order created successfully:', jsonResponse);
      } catch (error) {
        console.error("Failed to create order:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Failed to create order." });
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

export const ExtendMyTime = async (req: Request, res: Response) => {
  const { title, userId, type, length, orderId, method } = req.body;

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

    if(method === "paystack"){
  
      try {
        const result = await handlePaymentInitialization(paymentReq);
        console.log('Payment initialized successfully:', result);
        res.status(201).json({ message: 'Transaction and request created successfully', result });
      } catch (error: unknown) {
        console.error('Error during payment initialization:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }else if(method === "paypal"){
      try {

        const newAmount = (Number(price)/100)/1500;

        // let currencyConverter = new CC({from:"NGN", to:"USD", amount:totalPrice});

        // log('Converted amount::', currencyConverter.convertedValue);

        const cart = {
          currency: "USD",
          total: newAmount.toString(),
          id: newTransaction.orderId,
        };
        const { jsonResponse, httpStatusCode } = await createOrder(cart);
        res.status(httpStatusCode).json({
          jsonResponse,
          orderId: newTransaction.orderId
        });
        console.log('Order created successfully:', jsonResponse);

      } catch (error) {
        console.error("Failed to create order:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Failed to create order." });
      }
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

export const updateRequestTime = async (req: Request, res: Response) => {
  const { orderId, date } = req.body;

  try {
    if (!orderId || !date) {
      return res.status(400).json({ message: "orderId and date are required." });
    }

    const parsedDate = new Date(date);
    const result = getTimeFromDated(date);

    const booktime = {
      "hours": result.hours,
      "minutes": result.minutes,
      "seconds": result.seconds
    }

    const gmtPlusOneFormat = 'YYYY-MM-DDTHH:mm:ss.SSS+01:00';
    const endTimeDate = add(parsedDate, { hours: 1 });
    const formattedEndTime = moment(endTimeDate).utcOffset('+01:00').format(gmtPlusOneFormat);

    const updatedRequest = await RequesModel.findOneAndUpdate(
      { orderId },
      {
        $set: {
          usebooktimed: date,
          time: booktime,
          useendTimed: formattedEndTime,
          continued: true
        },
        $inc: { continueCount: 1 }
      },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: "No request found with the provided orderId." });
    }

    const userEmail = await fetchUserEmailById(updatedRequest.userId);

    const newTransaction = new Transaction({
      title: updatedRequest.nameofservice,
      userId: updatedRequest.userId,
      type: updatedRequest.type,
      orderId: generateOrderId(),
      price: 5000000,
      reference: '',
      status: 'processing',
      originalOrderIdFromChat: orderId,
    });
    await newTransaction.save();

    const paymentReq = {
      body: {
        email: userEmail,
        amount: 5000000,
        id: newTransaction.id,
        reference: orderId
      },
    };

    try {
      const result = await handlePaymentInitialization(paymentReq);
      console.log('Payment initialized successfully:', result);
      return res.status(201).json({
        message: "Request updated and payment initialized successfully.",
        updatedRequest,
        transaction: newTransaction,
        payment: result
      });
    } catch (paymentError: unknown) {
      console.error('Error during payment initialization:', paymentError);
      return res.status(500).json({ error: 'Payment initialization failed' });
    }

  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ message: "Server error", error: error.message });
    } else {
      res.status(500).json({ message: "Unknown server error" });
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
      Authorization: 'Bearer sk_live_16d2308597228e2b43d2b7a3996fea8b031ca36c', // Replace with your actual key
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

function toAllCaps(text: string): string {
  return text.toUpperCase();
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

export const handleCreateOrder = async (req: Request, res: Response) => {
  try {
    const { cart } = req.body;
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
};

export const handleCaptureOrder = async (req: Request, res: Response) => {
  try {
    const { orderID, orderId} = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    res.status(httpStatusCode).json(jsonResponse);

    const result = await Transaction.findOneAndUpdate(
            { orderId }, 
            { status: 'completed' },
            { new: true }
          );
          
    
          sendEmail({
            to: 'admin@dudutech.io',
            subject: 'Payment Successful',
            text: `A User Just Made A Payment for ${result?.title} with ref of ${result?.reference} and the amount of ${result?.price}`,
            html: `A User Just Made A Payment for ${result?.title} with ref of ${result?.reference} and the amount of ${result?.price}`,
          });
      
         
    
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
    
              
            let userTimeZoneCreated;
            let userTimeZoneBookTime;
        
            if (request.createdAt && user.timezone) {
              userTimeZoneCreated = convertTimeToUserTimezone(request.createdAt);
              // Use userTimeZone...
            } else {
              console.log("createdAt is missing in request");
            }
    
    
        
            if (request.booktime && user.timezone) {
              userTimeZoneBookTime = convertTimeToUserTimezone(request.usebooktimed ?? new Date());
    
              // Use userTimeZone...
            } else {
              console.log("Booked Time is missing in request");
            }
    
              await sendEmail({
                to: consultant.email,
                subject: 'New Chat Request',
                text: `Hello ${consultant.fname} ${consultant.lname},
              
              You have a request to Continue Chat from ${user.fname} ${user.lname}. Details below:
              
              Service Booked: ${request.nameofservice}
              Time for Chat: ${userTimeZoneBookTime}
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
          userTimeZoneCreated = convertTimeToUserTimezone(request.createdAt);
          // Use userTimeZone...
        } else {
          console.log("createdAt is missing in request");
        }
    
        if (request.booktime && user.timezone) {
          userTimeZoneBookTime = convertTimeToUserTimezone(request.booktime);
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
    
              console.log(`Request: ${request}`);
    
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
            console.error(`Transaction with reference ${orderId} not found.`);
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

  } catch (error) {
    console.error("Failed to capture order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
};

// export const uploadFiles = upload.array('files', 10); // Limit to max 10 files