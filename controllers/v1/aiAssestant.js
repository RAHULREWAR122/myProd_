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
} from '../../utils/assisantHelper.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚀 Pre-initialize the model to avoid repeated initialization
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
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
      setTimeout(() => reject(new Error('AI generation timeout')), 15000)
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