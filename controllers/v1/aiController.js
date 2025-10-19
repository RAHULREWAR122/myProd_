// ============================================
// FILE 1: controllers/aiSummaryController.js
// ============================================

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import ErrorHandler from '../../utils/errorHandler.js';
import { catchAsyncError } from '../../middleware/catchAsyncError.js';
import DATASHEET from '../../models/Dataset.js';

// 🚀 Pre-initialize model for better performance
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro",
  generationConfig: {
    temperature: 0.7,
    topP: 0.9,
    maxOutputTokens: 8000,
  }
});

// 🧹 In-memory cache for AI summaries (10-minute TTL)
const summaryCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// 🔹 Cache cleanup utility (runs every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of summaryCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      summaryCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// 🎯 Main AI Summary Controller
export const getAISummary = catchAsyncError(async (req, res, next) => {
  const startTime = Date.now();
  const { datasetId } = req.params;
  const userId = req.user?.id;

  console.log('📊 AI Summary Request:', { datasetId, userId });

  // ✅ Early validation
  if (!datasetId) {
    return next(new ErrorHandler("Dataset ID is required.", 400));
  }

  if (!userId) {
    return next(new ErrorHandler("Authentication required.", 401));
  }

  if (!process.env.GEMINI_API_KEY) {
    return next(new ErrorHandler("AI service configuration error. Please contact support.", 500));
  }

  // 💾 Check cache first
  const cacheKey = `summary_${datasetId}_${userId}`;
  if (summaryCache.has(cacheKey)) {
    const cached = summaryCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Cache hit for ${datasetId} (${Date.now() - startTime}ms)`);
      return res.status(200).json({
        summary: cached.data,
        cached: true,
        timestamp: new Date(cached.timestamp).toISOString()
      });
    }
    summaryCache.delete(cacheKey);
  }

  try {
    // 🔍 Fetch dataset with optimized query
    const dataset = await DATASHEET.findOne({
      _id: datasetId,
      userId: userId
    })
    .select('headers rows fileName rowCount createdAt')
    .lean();

    if (!dataset) {
      return next(new ErrorHandler("Dataset not found or access denied.", 404));
    }

    console.log(`📂 Dataset loaded in ${Date.now() - startTime}ms`);

    // 🎯 Optimize data for AI processing
    const sampleSize = Math.min(50, dataset.rows?.length || 0); // Up to 50 rows
    const sampleData = dataset.rows?.slice(0, sampleSize) || [];
    
    if (sampleData.length === 0) {
      return next(new ErrorHandler("Dataset is empty. Please upload data first.", 400));
    }

    // 📊 Format data efficiently
    const headers = dataset.headers || [];
    const formatted = [
      headers.join(", "),
      ...sampleData.map(row => 
        headers.map(h => {
          const val = row[h];
          // Handle different data types safely
          return val === null || val === undefined ? '' : String(val);
        }).join(", ")
      )
    ].join("\n");

    // Truncate if too long (prevent token overflow)
    const maxLength = 4000;
    const truncatedData = formatted.length > maxLength 
      ? formatted.substring(0, maxLength) + "\n...(data truncated for analysis)"
      : formatted;

    // 📝 Build optimized prompt for Gemini 2.5 Pro
    const prompt = `You are an AI business analyst for Startlytics - a comprehensive data analytics platform designed specifically for startup founders.

DATASET CONTEXT:
- File Name: ${dataset.fileName || 'Unnamed Dataset'}
- Total Rows: ${dataset.rowCount || sampleData.length}
- Sample Size: ${sampleData.length} rows analyzed
- Upload Date: ${dataset.createdAt ? new Date(dataset.createdAt).toLocaleDateString() : 'Unknown'}

DATA SAMPLE (CSV format):
${truncatedData}

YOUR TASK:
Analyze this startup data deeply and provide actionable, strategic insights in EXACTLY this format:

Welcome to Startlytics 🚀

📊 AI Summary
[Provide 2-3 key insights about the data patterns, trends, or anomalies you observe. Focus on what matters most for business decisions.]

💡 Key Findings
[Highlight the most important metrics, correlations, or business implications. What should the founder pay attention to immediately?]

🎯 Personalized Suggestions
[Give 2-3 specific, actionable recommendations based on the data type and patterns. Be prescriptive and practical.]

📈 Growth Strategies
[Suggest 1-2 strategic growth tips or optimization opportunities based on the data analysis. Focus on scalable actions.]

⚠️ Potential Issues
[Identify any data quality issues, outliers, red flags, or areas requiring immediate attention.]

🔮 Predictive Insights
[If patterns allow, provide forward-looking predictions or trends you observe in the data.]

ANALYSIS GUIDELINES:
- If financial data: Focus on revenue, costs, profitability, burn rate, runway
- If customer data: Focus on acquisition, retention, churn, LTV, engagement
- If product data: Focus on usage, feature adoption, conversion funnels
- If marketing data: Focus on CAC, ROAS, channel performance, conversion rates
- Be concise but insightful - quality over quantity
- Use emojis appropriately for better readability
- Always mention data quality if you spot issues
- Provide specific numbers and percentages when relevant
- Think like a founder's strategic advisor, not just a data reporter

Response:`;

    console.log(`📝 Prompt built in ${Date.now() - startTime}ms`);

    // 🤖 Generate AI summary with timeout protection
    const generatePromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timeout')), 25000) // 25s timeout for Pro model
    );

    const result = await Promise.race([generatePromise, timeoutPromise]);
    const response = await result.response;
    let aiSummary = response.text().trim();

    console.log(`🤖 AI response generated in ${Date.now() - startTime}ms`);

    if (!aiSummary) {
      throw new ErrorHandler("AI failed to generate summary. Please try again.", 503);
    }

    // 💾 Cache the result for future requests
    summaryCache.set(cacheKey, {
      data: aiSummary,
      timestamp: Date.now()
    });

    const totalTime = Date.now() - startTime;
    console.log(`✅ AI Summary completed in ${totalTime}ms`);

    res.status(200).json({
      summary: aiSummary,
      cached: false,
      timestamp: new Date().toISOString(),
      metadata: {
        datasetName: dataset.fileName,
        rowsAnalyzed: sampleData.length,
        totalRows: dataset.rowCount,
        ...(process.env.NODE_ENV === 'development' && { 
          responseTime: `${totalTime}ms`
        })
      }
    });

  } catch (err) {
    console.error("❗ AI Summary Error:", err);

    // Handle specific errors
    if (err.message === 'AI generation timeout') {
      return next(new ErrorHandler("AI analysis timeout. Dataset may be too large or complex.", 408));
    }

    if (err.message?.includes("quota") || err.status === 429) {
      return next(new ErrorHandler("AI service quota exceeded. Please try again later.", 429));
    }

    if (err.message?.includes("API key") || err.status === 401) {
      return next(new ErrorHandler("AI service authentication failed. Please contact support.", 503));
    }

    if (err.message?.includes("SAFETY") || err.message?.includes("blocked")) {
      return next(new ErrorHandler("Content was blocked by safety filters. Please check your data.", 400));
    }

    if (err.message?.includes("fetch failed") || err.code === 'ECONNRESET') {
      return next(new ErrorHandler("AI service is temporarily unavailable. Please try again.", 503));
    }

    if (err instanceof ErrorHandler) {
      return next(err);
    }

    return next(new ErrorHandler("AI summary generation failed. Please try again later.", 500));
  }
});

// 🔹 Get cache statistics (for monitoring/debugging)
export const getCacheSummaryStats = () => {
  return {
    size: summaryCache.size,
    entries: Array.from(summaryCache.keys()),
    cacheHitRate: summaryCache.size > 0 ? 'Active' : 'Empty'
  };
};

// 🔹 Manual cache invalidation (call when dataset is updated)
export const invalidateSummaryCache = (datasetId, userId) => {
  const cacheKey = `summary_${datasetId}_${userId}`;
  const deleted = summaryCache.delete(cacheKey);
  console.log(`🗑️ Cache invalidated for ${cacheKey}: ${deleted}`);
  return deleted;
};

// 🔹 Clear all cache (for admin/maintenance)
export const clearAllSummaryCache = () => {
  const size = summaryCache.size;
  summaryCache.clear();
  console.log(`🗑️ Cleared ${size} cache entries`);
  return { cleared: size };
};


