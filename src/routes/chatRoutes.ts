import express, { RequestHandler } from "express";
import Chat from "../models/Chat";
import Message from "../models/Message";
import { User } from "../models/userModel";
import { authMiddleware } from "../middleware/authMiddleware";
import { createMessageNotification } from "../utils/notificationUtils";

const router = express.Router();

// Get all chats for current user
const getChats: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const chats = await Chat.find({
      $or: [{ tenantId: userId }, { managerId: userId }],
    })
      .populate("tenantId", "username email lastSeen")
      .populate("managerId", "username email lastSeen")
      .populate("propertyId", "name")
      .sort({ lastMessageAt: -1 })
      .exec();

    res.json(chats);
  } catch (err) {
    console.error("[Chat] Error fetching chats:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

// Get messages for a specific chat
const getMessages: RequestHandler = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Verify user is part of this chat
    const chat = await Chat.findById(chatId);
    if (!chat || (chat.tenantId.toString() !== userId && chat.managerId.toString() !== userId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .limit(100)
      .exec();

    // Mark messages as read
    await Message.updateMany(
      { chatId, senderId: { $ne: userId }, isRead: false },
      { isRead: true }
    );

    res.json(messages);
  } catch (err) {
    console.error("[Chat] Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// Send a message
const sendMessage: RequestHandler = async (req, res) => {
  try {
    const { chatId, text } = req.body;
    const senderId = req.user?.id;

    if (!senderId || !chatId || !text) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Verify user is part of this chat
    const chat = await Chat.findById(chatId);
    if (!chat || (chat.tenantId.toString() !== senderId && chat.managerId.toString() !== senderId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Create message
    const message = new Message({
      chatId,
      senderId,
      text,
      isRead: false,
    });

    await message.save();

    // Update chat's last message and timestamp
    await Chat.findByIdAndUpdate(
      chatId,
      {
        lastMessage: text,
        lastMessageAt: new Date(),
        lastMessageSenderId: senderId,
      },
      { new: true }
    );

    // Create notification for the recipient
    const chatForNotification = await Chat.findById(chatId)
      .populate("tenantId", "username")
      .populate("managerId", "username");
    
    if (chatForNotification) {
      const recipientId = chatForNotification.tenantId._id.toString() === senderId ? chatForNotification.managerId._id : chatForNotification.tenantId._id;
      const senderName = chatForNotification.tenantId._id.toString() === senderId 
        ? (chatForNotification.tenantId as any).username 
        : (chatForNotification.managerId as any).username;
      
      await createMessageNotification(
        recipientId.toString(),
        senderName,
        chatId,
        text
      );
    }

    console.log("[Chat] Message sent in chat:", chatId);
    res.json(message);
  } catch (err) {
    console.error("[Chat] Error sending message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// Start a chat with manager for a property
const startChat: RequestHandler = async (req, res) => {
  try {
    const { managerId, propertyId } = req.body;
    const tenantId = req.user?.id;

    if (!tenantId || !managerId || !propertyId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Reuse existing chat between this tenant and manager, regardless of property.
    let chat = await Chat.findOne({
      tenantId,
      managerId,
    });

    if (!chat) {
      chat = new Chat({
        tenantId,
        managerId,
        propertyId,
        lastMessageAt: new Date(),
      });
      await chat.save();
      console.log("[Chat] New chat created:", chat._id);
    }

    res.json(chat);
  } catch (err) {
    console.error("[Chat] Error starting chat:", err);
    res.status(500).json({ error: "Failed to start chat" });
  }
};

// Update current user's presence timestamp
const updatePresence: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { lastSeen: new Date() },
      { new: true }
    ).exec();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ lastSeen: user.lastSeen });
  } catch (err) {
    console.error("[Chat] Error updating presence:", err);
    res.status(500).json({ error: "Failed to update presence" });
  }
};

// Get presence for a specific user
const getPresenceStatus: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }

    const user = await User.findById(userId).select("username email lastSeen").exec();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ userId: user._id, username: user.username, lastSeen: user.lastSeen });
  } catch (err) {
    console.error("[Chat] Error fetching presence status:", err);
    res.status(500).json({ error: "Failed to fetch presence status" });
  }
};

// Get unread message count
const getUnreadCount: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get all chat IDs for this user
    const userChats = await Chat.find({
      $or: [{ tenantId: userId }, { managerId: userId }],
    }).select("_id");

    const chatIds = userChats.map((c) => c._id);

    // Count unread messages
    const count = await Message.countDocuments({
      chatId: { $in: chatIds },
      senderId: { $ne: userId },
      isRead: false,
    });

    res.json({ unreadCount: count });
  } catch (err) {
    console.error("[Chat] Error getting unread count:", err);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};

// Routes - Apply auth middleware that accepts both tenants and managers
router.use(authMiddleware(["tenant", "manager"]));
router.get("/", getChats);
router.get("/:chatId/messages", getMessages);
router.post("/send", sendMessage);
router.post("/start", startChat);
router.post("/presence", updatePresence);
router.get("/presence/:userId", getPresenceStatus);
router.get("/unread/count", getUnreadCount);

export default router;
