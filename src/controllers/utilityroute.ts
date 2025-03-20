import { Request, Response } from 'express';
import User from '../models/User';
import sendEmail from '../utils/sendEmail';

export const verifyUserEmail = async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    const capitalize = (str: string) => 
      str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
    
    const firstNameCap = capitalize(user.fname);
    const lastNameCap = capitalize(user.lname);

    const dashboardLink = `https://nollywoodfilmmaker.com/user/dashboard`;

    (async () => {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Verify your Account',
          text: `
          Congratulations you are now a verified user nollywoodfilmmaker.com 
          Click here to your dashboard: ${dashboardLink}`, // Plain text fallback
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

    <h1>Hello ${firstNameCap} ${lastNameCap},</h1>

    <p>Congratulations you are now a verified user nollywoodfilmmaker.com</p>

    <p>Click here to your dashboard: ${dashboardLink}</p>

    <p class="footer">Best regards,<br><strong>Nollywood Filmmaker Database</strong></p>
  </div>

</body>
</html>
`, // HTML version
        });              
        console.log('Email sent successfully.');
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    })();


    res.status(200).json({ message: 'Email successfully verified!' });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying email', error });
  }
};
