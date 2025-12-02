import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.config';
import { google } from 'googleapis';

const router = Router();

// Get all emails for a user with filters and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      search = '', 
      filter = 'all', // 'all', 'unread', 'read'
      category = 'all',
      priority = 'all',
      page = '1',
      limit = '50'
    } = req.query;

    // For now, get the first user (you can add auth later)
    const user = await prisma.user.findFirst();

    if (!user) {
      return res.status(404).json({ error: 'No user found' });
    }

    // Build where clause
    const where: any = { userId: user.id };

    // Add search filter
    if (search) {
      where.OR = [
        { subject: { contains: search as string, mode: 'insensitive' } },
        { from: { contains: search as string, mode: 'insensitive' } },
        { body: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Add read/unread filter
    if (filter === 'unread') {
      where.isRead = false;
    } else if (filter === 'read') {
      where.isRead = true;
    }

        if (category && category !== 'all') {
      where.aiCategory = category;
    }
    
    if (priority && priority !== 'all') {
      where.aiPriority = priority;
    }
    
    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const totalCount = await prisma.email.count({ where });

    // Get emails
    const emails = await prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip,
      take: limitNum,
    });

    res.json({
      success: true,
      count: emails.length,
      total: totalCount,
      page: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      emails: emails,
    });

  } catch (error: any) {
    console.error('❌ Error fetching emails:', error.message);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get single email by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({
      success: true,
      email: email,
    });

  } catch (error: any) {
    console.error('❌ Error fetching email:', error.message);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// Mark email as read
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const email = await prisma.email.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({
      success: true,
      email: email,
    });

  } catch (error: any) {
    console.error('❌ Error marking email as read:', error.message);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark email as unread
router.post('/:id/unread', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const email = await prisma.email.update({
      where: { id },
      data: { isRead: false },
    });

    res.json({
      success: true,
      email: email,
    });

  } catch (error: any) {
    console.error('❌ Error marking email as unread:', error.message);
    res.status(500).json({ error: 'Failed to mark as unread' });
  }
});

// Delete email
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.email.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Email deleted',
    });

  } catch (error: any) {
    console.error('❌ Error deleting email:', error.message);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// Send email
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user
    const user = await prisma.user.findFirst();

    if (!user) {
      return res.status(404).json({ error: 'No user found' });
    }

    // Set up OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create email message
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log('✅ Email sent successfully');

    res.json({
      success: true,
      message: 'Email sent',
    });

  } catch (error: any) {
    console.error('❌ Error sending email:', error.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Compose reply (pre-fill compose form)
router.post('/reply/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { replyText } = req.body;

    // Get the original email
    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Get user
    const user = await prisma.user.findFirst();

    if (!user) {
      return res.status(404).json({ error: 'No user found' });
    }

    // Set up OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Extract email from "From" header
    const fromMatch = email.from.match(/<(.+)>/);
    const toEmail = fromMatch ? fromMatch[1] : email.from;

    // Create reply subject (add "Re: " if not already there)
    const replySubject = email.subject.startsWith('Re: ') 
      ? email.subject 
      : `Re: ${email.subject}`;

    // Create email message with proper headers for threading
    const message = [
      `To: ${toEmail}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${email.gmailId}`,
      `References: ${email.gmailId}`,
      '',
      replyText,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: email.threadId, // Keep in same thread
      },
    });

    console.log('✅ Reply sent successfully');

    res.json({
      success: true,
      message: 'Reply sent',
    });

  } catch (error: any) {
    console.error('❌ Error sending reply:', error.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});


// Get unread count
router.get('/stats/unread', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst();

    if (!user) {
      return res.status(404).json({ error: 'No user found' });
    }

    const unreadCount = await prisma.email.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    res.json({
      success: true,
      unreadCount: unreadCount,
    });

  } catch (error: any) {
    console.error('❌ Error getting unread count:', error.message);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

export default router;