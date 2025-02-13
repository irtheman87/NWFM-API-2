import nodemailer from 'nodemailer';

// Function to send emails using Brevo SMTP
const sendEmail = async ({ to, subject, text }: { to: string; subject: string; text: string }) => {
  console.log('SMTP Server:', process.env.SMTP_SERVER);

  // Create the transporter using Brevo SMTP settings
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER, // SMTP server (e.g., smtp-relay.sendinblue.com)
    port: 465, // Using Port 465 for Implicit SSL/TLS encryption
    secure: true, // True for 465 (Implicit SSL), false for 587 (Explicit TLS)
    auth: {
      user: process.env.SMTP_USER, // Your Brevo email
      pass: process.env.SMTP_PASS, // Your Brevo SMTP password
    },
  });

  // Send the email
  try {
    await transporter.sendMail({
      from: '"Nollywood Filmmaker" <no-reply@nollywoodfilmmaker.com>', // Custom sender email
      to, // Recipient's email address
      subject, // Email subject
      text, // Email body text
    });
    console.log('Email sent successfully via Brevo');
  } catch (error) {
    console.error('Error sending email via Brevo:', error);
    throw new Error('Email sending failed');
  }
};

export default sendEmail;
