import nodemailer from 'nodemailer';

// Function to send emails using Brevo SMTP
const sendEmail = async ({ to, subject, text }: { to: string; subject: string; text: string }) => {

  console.log(process.env.SMTP_SERVER);
  // Create the transporter using Brevo SMTP settings
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,      // SMTP server (smtp-relay.sendinblue.com)
    port: parseInt(process.env.SMTP_PORT || '587'), // SMTP port (587 for TLS)
    auth: {
      user: process.env.SMTP_USER,      // Your Brevo email
      pass: process.env.SMTP_PASS,      // Your Brevo SMTP password
    },
  });

  // Send the email
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,       // Sender's email address (use Brevo email)
      to,                                // Recipient's email address
      subject,                           // Email subject
      text,                              // Email body text
    });
    console.log('Email sent successfully via Brevo');
  } catch (error) {
    console.error('Error sending email via Brevo:', error);
    throw new Error('Email sending failed');
  }
};

export default sendEmail;
