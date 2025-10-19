// ============================================
// FILE 1: controllers/assistantController.js
// Complete AI Assistant Controller with Gemini 2.5 Pro
// ============================================

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import ErrorHandler from '../../utils/errorHandler.js';
import { catchAsyncError } from '../../middleware/catchAsyncError.js';
import {
  isPersonalIntent,
  fetchUserContext,
  buildPrompt,
  buildSmartPrompt,
  cleanupCache,
  invalidateUserCache,
  sanitizeInput
} from '../../utils/assisantHelper.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🚀 Pre-initialize the model to avoid repeated initialization
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro", // ⭐ Updated to Gemini 2.5 Pro
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

  console.log('📥 Incoming AI question:', { question, userId, timestamp: new Date().toISOString() });

  // Early validation
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return next(new ErrorHandler("❗ Question is required and cannot be empty.", 400));
  }

  // Sanitize input
  const sanitizedQuestion = sanitizeInput(question);
  
  if (sanitizedQuestion.length === 0) {
    return next(new ErrorHandler("❗ Invalid question format.", 400));
  }

  if (!process.env.GEMINI_API_KEY) {
    return next(new ErrorHandler("AI service configuration error. Please contact support.", 500));
  }

  const personal = isPersonalIntent(sanitizedQuestion);
  let userProfile = "", userDataSummary = "";

  // 🔐 Handle personal questions with timeout
  if (personal) {
    if (!userId) {
      return res.status(200).json({
        answer: "🔐 To access your personal data and uploaded files, please log in first.",
        requiresAuth: true,
        timestamp: new Date().toISOString()
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

  // 🎯 Build optimized prompt using smart routing
  const prompt = buildSmartPrompt(sanitizedQuestion, userProfile, userDataSummary);
  console.log(`📝 Prompt built in ${Date.now() - startTime}ms`);

  try {
    // 🤖 AI Generation with timeout (increased for Gemini 2.5 Pro)
    const generatePromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timeout')), 25000) // 25s timeout for Pro model
    );

    const result = await Promise.race([generatePromise, timeoutPromise]);
    const response = await result.response;
    let answer = response.text().trim();

    console.log(`🤖 AI response generated in ${Date.now() - startTime}ms`);

    if (!answer) {
      throw new ErrorHandler("❗ Assistant couldn't generate a response. Please try again.", 503);
    }

    // Optimize response length (but allow longer responses for Gemini 2.5 Pro)
    const maxLength = 2000; // Increased from 1000
    if (answer.length > maxLength) {
      answer = answer.slice(0, maxLength - 3) + '...';
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Total request completed in ${totalTime}ms`);

    res.status(200).json({
      success: true,
      answer,
      timestamp: new Date().toISOString(),
      metadata: {
        personal: personal,
        model: "gemini-2.5-pro",
        ...(process.env.NODE_ENV === 'development' && { 
          responseTime: `${totalTime}ms`,
          promptType: personal ? 'contextual' : 'general'
        })
      }
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

    if (err.message?.includes("RECITATION")) {
      return next(new ErrorHandler("❗ Response contained copyrighted content. Please rephrase your question.", 400));
    }

    return next(new ErrorHandler("Assistant temporarily unavailable. Please try again later.", 500));
  }
});

// 🔹 Get assistant statistics (for admin/monitoring)
export const getAssistantStats = catchAsyncError(async (req, res, next) => {
  const { getCacheStats, getCachePerformance } = await import('../../utils/assistantHelper.js');
  
  const stats = getCacheStats();
  const performance = getCachePerformance();

  res.status(200).json({
    success: true,
    data: {
      model: "gemini-2.5-pro",
      cache: stats,
      performance: {
        memoryUsageMB: performance.memoryUsage.toFixed(2),
        uptimeSeconds: Math.floor(performance.uptime),
        cacheHitRate: performance.hitRatePercentage
      }
    },
    timestamp: new Date().toISOString()
  });
});

// 🔹 Clear assistant cache (admin only)
export const clearAssistantCache = catchAsyncError(async (req, res, next) => {
  const { clearAllCache } = await import('../../utils/assistantHelper.js');
  
  const cleared = clearAllCache();

  res.status(200).json({
    success: true,
    message: 'Assistant cache cleared successfully',
    entriesCleared: cleared,
    timestamp: new Date().toISOString()
  });
});
