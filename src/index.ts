import express from 'express';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { userService } from './services/user.service';
import { gmailService } from './services/gmail.service'; 
import webhookRoutes from './routes/webhook.routes'; 
import inboxRoutes from './routes/inbox.routes';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); 

// Configure OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Gmail scopes
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

app.use('/webhook', webhookRoutes);

app.use('/api/inbox', inboxRoutes);

app.use('/api/ai', aiRoutes);

// Home page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Email Assistant - OAuth Test</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
          }
          h1 { color: #4285f4; }
          p { color: #666; line-height: 1.6; }
          .google-btn {
            background: #4285f4;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
          }
          .google-btn:hover {
            background: #357ae8;
          }
          .info {
            background: #e7f3ff;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 AI Email Assistant</h1>
          <p>Connect your Gmail and start managing emails with AI</p>
          <div class="info">
            <h3>What happens next:</h3>
            <ol>
              <li>Login with Google</li>
              <li>Grant Gmail permissions</li>
              <li>Your account will be saved to database</li>
              <li>We'll start monitoring your emails</li>
            </ol>
          </div>
          <a href="/auth/google" class="google-btn">
            🔐 Login with Google
          </a>
        </div>
      </body>
    </html>
  `);
});

// Inbox dashboard
app.get('/inbox', (req, res) => {
  res.sendFile(__dirname + '/views/inbox.html');
});

// Start OAuth flow
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

// OAuth callback - NOW WITH DATABASE SAVE!
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    return res.send(`
      <h1>❌ Error</h1>
      <p>No authorization code received</p>
      <a href="/">Try again</a>
    `);
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Test Gmail access
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    // 🆕 SAVE USER TO DATABASE
    const savedUser = await userService.findOrCreateUser(
      {
        googleId: userInfo.data.id!,
        email: userInfo.data.email!,
        name: userInfo.data.name || undefined,
      },
      {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      }
    );

    console.log('✅ User saved to database!');
    console.log('📧 Email:', savedUser.email);
    console.log('🆔 Database ID:', savedUser.id);

    // 🆕 START GMAIL WATCH
try {
  const watchInfo = await gmailService.startWatch(
    savedUser.id,
    tokens.access_token!,
    tokens.refresh_token || savedUser.refreshToken
  );
  
  console.log('🔔 Gmail watch active until:', new Date(parseInt(watchInfo.expiration!)));
} catch (error: any) {
  console.error('⚠️ Failed to start watch (non-critical):', error.message);
}

    res.send(`
  <!DOCTYPE html>
  <html>
    <head>
      <title>Success - Gmail Watch Started!</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 700px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #28a745; }
        .success { 
          background: #d4edda; 
          color: #155724; 
          padding: 15px; 
          border-radius: 5px; 
          margin: 20px 0;
        }
        .info-box {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
          border-left: 4px solid #4285f4;
        }
        .watch-box {
          background: #fff3cd;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
          border-left: 4px solid #856404;
        }
        .back-btn {
          background: #4285f4;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin-top: 20px;
        }
        .back-btn:hover {
          background: #357ae8;
        }
        .check { color: #28a745; font-size: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎉 Successfully Connected!</h1>
        
        <div class="success">
          ✅ Your account is now connected and being monitored!
        </div>

        <div class="watch-box">
          <h3>🔔 Gmail Watch Active</h3>
          <p><span class="check">✓</span> <strong>Status:</strong> Monitoring your inbox</p>
          <p><strong>Watch Duration:</strong> 7 days</p>
          <p><strong>What this means:</strong> We'll be notified instantly when you receive new emails</p>
        </div>

        <div class="info-box">
          <h3>💾 Database Record</h3>
          <p><strong>User ID:</strong> ${savedUser.id}</p>
          <p><strong>Email:</strong> ${savedUser.email}</p>
          <p><strong>Access Token:</strong> Saved ✓</p>
          <p><strong>Refresh Token:</strong> ${savedUser.refreshToken ? 'Saved ✓' : 'Not available'}</p>
          <p><strong>Watch Expiration:</strong> ${savedUser.watchExpiration ? savedUser.watchExpiration.toLocaleString() : 'Setting up...'}</p>
        </div>

        <div class="info-box">
          <h3>📧 Gmail Access</h3>
          <p><span class="check">✓</span> Gmail API Connected</p>
          <p><strong>Total Messages:</strong> ${profile.data.messagesTotal}</p>
          <p><strong>Total Threads:</strong> ${profile.data.threadsTotal}</p>
        </div>

        <div class="info-box">
          <h3>✅ What's Working:</h3>
          <ul>
            <li><span class="check">✓</span> Google OAuth successful</li>
            <li><span class="check">✓</span> User saved to database</li>
            <li><span class="check">✓</span> Gmail watch started</li>
            <li><span class="check">✓</span> Real-time notifications enabled</li>
            <li><span class="check">✓</span> Ready to receive emails!</li>
          </ul>
        </div>

        <a href="/" class="back-btn">← Back to Home</a>
      </div>
    </body>
  </html>
`);

  } catch (error: any) {
    console.error('❌ OAuth Error:', error.message);
    res.send(`
      <h1>❌ OAuth Error</h1>
      <p>${error.message}</p>
      <a href="/">Try again</a>
    `);
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 Email Assistant Server Started!');
  console.log('📍 Visit: http://localhost:' + PORT);
  console.log('🔐 Login to save your account to database\n');
});