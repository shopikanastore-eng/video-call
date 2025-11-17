import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import socketHandler from './socket/index.js';
import dotenv from 'dotenv';
dotenv.config();
import cron from 'node-cron';
import User from './models/user.js';
import Room from './models/room.js';

const app = express();

/* ---------------------------------------------------
   🔐 Load SSL Certificates
---------------------------------------------------- */
const SSL_DOMAIN = "livecall.freopayloan.com"; 

const httpsOptions = {
  key: fs.readFileSync(`/etc/letsencrypt/live/${SSL_DOMAIN}/privkey.pem`),
  cert: fs.readFileSync(`/etc/letsencrypt/live/${SSL_DOMAIN}/fullchain.pem`)
};

/* ---------------------------------------------------
   🌐 Create HTTP (80) → HTTPS (443) redirect server
---------------------------------------------------- */
const httpServer = http.createServer((req, res) => {
  res.writeHead(301, {
    "Location": "https://" + req.headers.host + req.url
  });
  res.end();
});

/* ---------------------------------------------------
   🔐 Create HTTPS server for your main app + Socket.IO
---------------------------------------------------- */
const httpsServer = https.createServer(httpsOptions, app);

// Initialize Socket.IO on HTTPS
const io = new Server(httpsServer);

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());

// Serve static files
app.use("/", express.static('public'));

// Attach socket handler
socketHandler(io);

/* ---------------------------------------------------
   🕒 CRON JOB: Unblock users + remove old rooms
---------------------------------------------------- */
cron.schedule('* * * * *', async () => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    await User.updateMany(
      {
        blockDetails: {
          $elemMatch: {
            isBlock: true,
            blockTime: { $lte: tenMinutesAgo }
          }
        }
      },
      {
        $pull: {
          blockDetails: {
            isBlock: true,
            blockTime: { $lte: tenMinutesAgo }
          }
        }
      }
    );

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const oldRooms = await Room.find({
      socketCount: 1,
      createdAt: { $lt: twoMinutesAgo }
    });

    oldRooms.map(async (item) => {
      if (item?.socketID1) {
        io.to(item?.socketID1).emit('reset-page');
      } else if (item?.socketID2) {
        io.to(item?.socketID2).emit('reset-page');
      }

      await Room.findByIdAndDelete(item?._id);
    });
  } catch (err) {
    console.error("❌ Error in unblock job:", err);
  }
});

/* ---------------------------------------------------
   🔧 API: Delete all rooms
---------------------------------------------------- */
app.post("/delete-all-rooms", async (req, res) => {
  try {
    if (req?.body?.number == process.env.number) {
      await Room.deleteMany({});
      return res.send('Room table cleared!');
    }
    return res.status(403).send('Unauthorized');
  } catch (error) {
    console.log("🚀 ~ app.post ~ error:", error);
    return res.send(error.message);
  }
});

/* ---------------------------------------------------
   🚀 Start Servers
---------------------------------------------------- */
const HTTP_PORT = 80;
const HTTPS_PORT = 443;

httpServer.listen(HTTP_PORT, () => {
  console.log(`🌍 HTTP redirect server running on port ${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`🔐 HTTPS server running on port ${HTTPS_PORT}`);
  console.log(`📡 Socket.IO running securely on wss://livecall.freopayloan.com`);
});
