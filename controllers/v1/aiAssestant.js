
import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import ErrorHandler from '../../utils/errorHandler.js';
import { catchAsyncError } from '../../middleware/catchAsyncError.js';
import {
  isPersonalIntent,
  fetchUserContext,
  buildPrompt,
  cleanupCache,
  invalidateUserCache
} from '../../utils/assistantHelper.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚀 Pre-initialize the model to avoid repeated initialization
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro",
  generationConfig: {
    temperature: 0.7,
    topP: 0.8,
    maxOutputTokens: 10000,
  }
});

// 🧹 Periodic cache cleanup (every 10 minutes)
setInterval(cleanupCache, 10 * 60 * 1000);

// 🚀 Main optimized API handler
export const askAssistant = catchAsyncError(async (req, res, next) => {
  const startTime = Date.now();
  const { question, id } = req.body;
  const userId = id || (req.user?.id || null);

  console.log('📥 Incoming AI question:', { question, userId });

  // Early validation
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return next(new ErrorHandler("❗ Question is required and cannot be empty.", 400));
  }

  if (!process.env.GEMINI_API_KEY) {
    return next(new ErrorHandler("AI service configuration error. Please contact support.", 500));
  }

  const personal = isPersonalIntent(question);
  let userProfile = "", userDataSummary = "";

  // 🔐 Handle personal questions with timeout
  if (personal) {
    if (!userId) {
      return res.status(200).json({
        answer: "🔐 To access your personal data and uploaded files, please log in first.",
        requiresAuth: true
      });
    }

    try {
      // Add timeout to prevent hanging on database queries
      const contextPromise = fetchUserContext(userId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Context fetch timeout')), 5000)
      );

      const context = await Promise.race([contextPromise, timeoutPromise]);
      userProfile = context.profile;
      userDataSummary = context.dataSummary;

      console.log(`📊 Context fetched in ${Date.now() - startTime}ms`);
    } catch (err) {
      console.error('❗ Context fetch error:', err);

      if (err.message === 'Context fetch timeout') {
        return next(new ErrorHandler("❗ Data fetch timeout. Please try again.", 408));
      }

      return next(err instanceof ErrorHandler ? err : new ErrorHandler("❗ Unable to fetch your data. Please try again later.", 500));
    }
  }

  // 🎯 Build optimized prompt
  const prompt = buildPrompt(question, userProfile, userDataSummary);
  console.log(`📝 Prompt built in ${Date.now() - startTime}ms`);

  try {
    // 🤖 AI Generation with timeout
    const generatePromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timeout')), 20000) // 20s timeout
    );

    const result = await Promise.race([generatePromise, timeoutPromise]);
    const response = await result.response;
    let answer = response.text().trim();

    console.log(`🤖 AI response generated in ${Date.now() - startTime}ms`);

    if (!answer) {
      throw new ErrorHandler("❗ Assistant couldn't generate a response. Please try again.", 503);
    }

    // Optimize response length
    if (answer.length > 1000) {
      answer = answer.slice(0, 997) + '...';
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Total request completed in ${totalTime}ms`);

    res.status(200).json({
      answer,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { responseTime: `${totalTime}ms` })
    });

  } catch (err) {
    console.error("❗ AI Assistant Error:", err);

    // Handle specific timeout error
    if (err.message === 'AI generation timeout') {
      return next(new ErrorHandler("AI response timeout. Please try a shorter question.", 408));
    }

    // Handle Gemini API specific errors
    if (err.message?.includes("quota") || err.status === 429) {
      return next(new ErrorHandler("AI service quota exceeded. Please try again later.", 429));
    }

    if (err.message?.includes("API key") || err.status === 401) {
      return next(new ErrorHandler("AI service authentication failed. Please contact support.", 503));
    }

    if (err.message?.includes("fetch failed") || err.code === 'ECONNRESET') {
      return next(new ErrorHandler("AI service is temporarily unavailable. Please try again.", 503));
    }

    if (err.message?.includes("SAFETY") || err.message?.includes("blocked")) {
      return next(new ErrorHandler("❗ Content was blocked by safety filters. Please rephrase your question.", 400));
    }

    return next(new ErrorHandler("Assistant temporarily unavailable. Please try again later.", 500));
  }
});


// ============================================
// FILE 3: utils/assistantHelper.js
// ============================================

import User from '../models/User.js';
import DATASHEET from '../models/Dataset.js';
import ErrorHandler from './errorHandler.js';

// 🔹 Check if the user question is about personal data
export const isPersonalIntent = (question) => {
  const personalKeywords = [
    "my file", "my data", "my dashboard", "my upload", "i uploaded",
    "my dataset", "my account", "my profile", "show me my", "what did i upload",
    "my csv", "my excel", "personal data", "user data"
  ];
  const lowerQ = question.toLowerCase().trim();
  return personalKeywords.some(keyword => lowerQ.includes(keyword));
};

// 🔹 In-memory cache for user context (5-minute TTL)
const userContextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// 🔹 Optimized fetch user profile and dataset info
export const fetchUserContext = async (userId) => {
  // Check cache first
  const cacheKey = `user_context_${userId}`;
  if (userContextCache.has(cacheKey)) {
    const cached = userContextCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    userContextCache.delete(cacheKey);
  }

  try {
    // Parallel queries for better performance
    const [user, datasets] = await Promise.all([
      // Only fetch necessary user fields
      User.findById(userId).select('name email').lean(),
      
      // Optimize dataset query - exclude heavy 'rows' field, use lean()
      DATASHEET.find({ userId })
        .select('_id headers rowCount createdAt fileName')
        .limit(10) // Limit to prevent excessive data
        .sort({ createdAt: -1 }) // Show most recent first
        .lean()
    ]);

    if (!user) {
      throw new ErrorHandler("❗ User profile not found.", 404);
    }

    const profile = `User Profile:
- Name: ${user.name || 'Not provided'}
- Email: ${user.email || 'Not provided'}`;

    let dataSummary = "";
    if (!datasets.length) {
      dataSummary = "📂 You haven't uploaded any datasets yet. You can upload CSV, Excel, or connect Google Sheets to get started!";
    } else {
      dataSummary = `📊 You have uploaded ${datasets.length} dataset(s):\n\n` +
        datasets.map((ds, i) => {
          const rowCount = ds.rowCount || 0;
          const uploadDate = ds.createdAt ? new Date(ds.createdAt).toLocaleDateString() : 'Unknown';
          const fileName = ds.fileName || `Dataset ${i + 1}`;
          
          return `${fileName}:
- ID: ${ds._id}
- Headers: ${Array.isArray(ds.headers) ? ds.headers.slice(0, 10).join(', ') : 'No headers found'}${ds.headers && ds.headers.length > 10 ? '...' : ''}
- Rows: ${rowCount}
- Uploaded: ${uploadDate}`;
        }).join("\n\n");
    }

    const result = { profile, dataSummary };
    
    // Cache the result
    userContextCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;

  } catch (error) {
    console.error('Error fetching user context:', error);
    throw error instanceof ErrorHandler ? error : new ErrorHandler("❗ Unable to fetch user data.", 500);
  }
};

// 🔹 Lightweight version for non-personal questions
export const fetchBasicUserContext = async (userId) => {
  const user = await User.findById(userId).select('name').lean();
  if (!user) throw new ErrorHandler("❗ User not found.", 404);
  
  return {
    profile: `User: ${user.name || 'User'}`,
    dataSummary: ""
  };
};

// 🔹 Build the final prompt to send to Gemini (optimized for token efficiency)
export const buildPrompt = (question, userProfile = "", userDataSummary = "") => {
  // Truncate long data summaries to prevent token overflow
  const maxDataSummaryLength = 1000;
  const truncatedDataSummary = userDataSummary.length > maxDataSummaryLength 
    ? userDataSummary.substring(0, maxDataSummaryLength) + "...(truncated)"
    : userDataSummary;

  return `You are an AI assistant for Startlytics - a data analytics platform designed for startup founders.

SCOPE: Answer questions about:
- File uploads (CSV, Excel, Google Sheets)
- Dashboards and data visualization
- AI insights from datasets
- Platform features and pricing
- Account management
- Data analysis and business metrics

RULES:
- English only, be concise and helpful
- Use emojis appropriately for better readability
- For unrelated questions: "I can help you only with questions related to this platform like uploading data, dashboards, insights, or using features. Please ask accordingly."
- Always be professional and founder-focused

${userProfile ? `USER INFORMATION:\n${userProfile}\n` : ''}

${truncatedDataSummary ? `USER'S DATA:\n${truncatedDataSummary}\n` : ''}

QUESTION: "${question}"

Response:`;
};

// 🔹 Advanced prompt builder with context awareness
export const buildSmartPrompt = (question, userProfile = "", userDataSummary = "") => {
  const questionLower = question.toLowerCase();
  
  // Different prompt templates based on question type
  if (questionLower.includes('dashboard') || questionLower.includes('chart') || questionLower.includes('visualization')) {
    return buildDashboardPrompt(question, userProfile, userDataSummary);
  }
  
  if (questionLower.includes('upload') || questionLower.includes('file') || questionLower.includes('import')) {
    return buildUploadPrompt(question, userProfile, userDataSummary);
  }
  
  if (questionLower.includes('pricing') || questionLower.includes('plan') || questionLower.includes('cost')) {
    return buildPricingPrompt(question);
  }
  
  // Default prompt for general questions
  return buildPrompt(question, userProfile, userDataSummary);
};

// 🔹 Specialized prompt templates
const buildDashboardPrompt = (question, userProfile, userDataSummary) => `
You are a data visualization expert for Startlytics platform.

Focus on helping with:
- Creating dashboards and charts
- Data visualization best practices
- Chart types and when to use them
- Dashboard customization options

${userProfile ? `USER: ${userProfile}` : ''}
${userDataSummary ? `AVAILABLE DATA: ${userDataSummary.substring(0, 500)}` : ''}

QUESTION: "${question}"

Provide specific, actionable guidance:`;

const buildUploadPrompt = (question, userProfile, userDataSummary) => `
You are a file upload specialist for Startlytics platform.

Help with:
- CSV, Excel, Google Sheets uploads
- File format requirements
- Data preparation tips
- Upload troubleshooting

${userProfile ? `USER: ${userProfile}` : ''}

QUESTION: "${question}"

Provide clear, step-by-step guidance:`;

const buildPricingPrompt = (question) => `
You are a pricing consultant for Startlytics platform.

PRICING PLANS:
- Free: Basic features, 5 datasets, standard support
- Pro ($29/month): Advanced features, unlimited datasets, priority support
- Enterprise ($99/month): Custom solutions, dedicated support, API access

QUESTION: "${question}"

Provide pricing guidance:`;

// 🔹 Cache cleanup utility (call periodically)
export const cleanupCache = () => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of userContextCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      userContextCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }
};

// 🔹 Get cache statistics (for monitoring)
export const getCacheStats = () => {
  return {
    size: userContextCache.size,
    entries: Array.from(userContextCache.keys()),
    ttl: `${CACHE_TTL / 60000} minutes`
  };
};

// 🔹 Manual cache invalidation
export const invalidateUserCache = (userId) => {
  const cacheKey = `user_context_${userId}`;
  const deleted = userContextCache.delete(cacheKey);
  console.log(`🗑️ User cache invalidated for ${userId}: ${deleted}`);
  return deleted;
};