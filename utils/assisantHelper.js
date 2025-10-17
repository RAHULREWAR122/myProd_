
import User from '../models/User.js';
import DATASHEET from '../models/Dataset.js';
import ErrorHandler from './errorHandler.js';

// 🔹 In-memory cache for user context (5-minute TTL)
const userContextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// INTENT DETECTION
// ============================================

/**
 * Check if the user question is about personal data
 * @param {string} question - User's question
 * @returns {boolean} - True if personal intent detected
 */
export const isPersonalIntent = (question) => {
  if (!question || typeof question !== 'string') {
    return false;
  }

  const personalKeywords = [
    "my file", "my files", "my data", "my dashboard", "my upload", 
    "i uploaded", "my dataset", "my datasets", "my account", 
    "my profile", "show me my", "what did i upload", "my csv", 
    "my excel", "personal data", "user data", "my information",
    "my records", "what do i have", "my analytics", "my reports",
    "show my", "display my", "list my", "get my", "fetch my"
  ];

  const lowerQ = question.toLowerCase().trim();
  return personalKeywords.some(keyword => lowerQ.includes(keyword));
};

/**
 * Detect question type for specialized prompt routing
 * @param {string} question - User's question
 * @returns {string} - Question type: 'dashboard', 'upload', 'pricing', 'data_analysis', 'general'
 */
export const detectQuestionType = (question) => {
  if (!question || typeof question !== 'string') {
    return 'general';
  }

  const lowerQ = question.toLowerCase().trim();

  // Dashboard/Visualization questions
  const dashboardKeywords = ['dashboard', 'chart', 'visualization', 'graph', 'plot', 'display', 'visualize'];
  if (dashboardKeywords.some(keyword => lowerQ.includes(keyword))) {
    return 'dashboard';
  }

  // Upload/Import questions
  const uploadKeywords = ['upload', 'import', 'file', 'csv', 'excel', 'google sheets', 'connect'];
  if (uploadKeywords.some(keyword => lowerQ.includes(keyword))) {
    return 'upload';
  }

  // Pricing questions
  const pricingKeywords = ['pricing', 'price', 'cost', 'plan', 'subscription', 'payment', 'upgrade'];
  if (pricingKeywords.some(keyword => lowerQ.includes(keyword))) {
    return 'pricing';
  }

  // Data analysis questions
  const analysisKeywords = ['analyze', 'analysis', 'insight', 'trend', 'pattern', 'metric', 'kpi'];
  if (analysisKeywords.some(keyword => lowerQ.includes(keyword))) {
    return 'data_analysis';
  }

  return 'general';
};

// ============================================
// USER CONTEXT FETCHING
// ============================================

/**
 * Fetch complete user context including profile and datasets
 * @param {string} userId - MongoDB user ID
 * @returns {Promise<Object>} - Object with profile and dataSummary
 */
export const fetchUserContext = async (userId) => {
  if (!userId) {
    throw new ErrorHandler("User ID is required to fetch context.", 400);
  }

  // Check cache first
  const cacheKey = `user_context_${userId}`;
  if (userContextCache.has(cacheKey)) {
    const cached = userContextCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Cache hit for user context: ${userId}`);
      return cached.data;
    }
    // Remove expired cache entry
    userContextCache.delete(cacheKey);
  }

  try {
    console.log(`🔍 Fetching fresh context for user: ${userId}`);

    // Parallel queries for better performance
    const [user, datasets] = await Promise.all([
      // Only fetch necessary user fields
      User.findById(userId)
        .select('name email subscription.plan createdAt')
        .lean(),
      
      // Optimize dataset query - exclude heavy 'rows' field
      DATASHEET.find({ userId })
        .select('_id headers rowCount createdAt fileName fileType')
        .limit(10) // Limit to prevent excessive data
        .sort({ createdAt: -1 }) // Show most recent first
        .lean()
    ]);

    if (!user) {
      throw new ErrorHandler("❗ User profile not found.", 404);
    }

    // Build user profile string
    const profile = `User Profile:
- Name: ${user.name || 'Not provided'}
- Email: ${user.email || 'Not provided'}
- Subscription: ${user.subscription?.plan || 'free'} plan
- Member Since: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}`;

    // Build dataset summary
    let dataSummary = "";
    if (!datasets || datasets.length === 0) {
      dataSummary = "📂 You haven't uploaded any datasets yet. You can upload CSV, Excel files, or connect Google Sheets to get started with data analysis!";
    } else {
      dataSummary = `📊 You have uploaded ${datasets.length} dataset(s):\n\n` +
        datasets.map((ds, i) => {
          const rowCount = ds.rowCount || 0;
          const uploadDate = ds.createdAt 
            ? new Date(ds.createdAt).toLocaleDateString() 
            : 'Unknown';
          const fileName = ds.fileName || `Dataset ${i + 1}`;
          const fileType = ds.fileType || 'unknown';
          
          // Format headers nicely
          const headerList = Array.isArray(ds.headers) 
            ? ds.headers.slice(0, 10).join(', ') 
            : 'No headers found';
          const headerSuffix = ds.headers && ds.headers.length > 10 ? '... (and more)' : '';
          
          return `📄 ${fileName}:
   - ID: ${ds._id}
   - Type: ${fileType.toUpperCase()}
   - Headers: ${headerList}${headerSuffix}
   - Total Rows: ${rowCount.toLocaleString()}
   - Uploaded: ${uploadDate}`;
        }).join("\n\n");
    }

    const result = { 
      profile, 
      dataSummary,
      metadata: {
        totalDatasets: datasets.length,
        userId: userId,
        fetchedAt: new Date().toISOString()
      }
    };
    
    // Cache the result
    userContextCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log(`✅ Context fetched and cached for user: ${userId}`);
    return result;

  } catch (error) {
    console.error('❗ Error fetching user context:', error);
    
    if (error instanceof ErrorHandler) {
      throw error;
    }
    
    throw new ErrorHandler("❗ Unable to fetch user data. Please try again later.", 500);
  }
};

/**
 * Lightweight version for non-personal questions
 * @param {string} userId - MongoDB user ID
 * @returns {Promise<Object>} - Basic profile info
 */
export const fetchBasicUserContext = async (userId) => {
  if (!userId) {
    return {
      profile: "",
      dataSummary: ""
    };
  }

  try {
    const user = await User.findById(userId)
      .select('name')
      .lean();
    
    if (!user) {
      throw new ErrorHandler("❗ User not found.", 404);
    }
    
    return {
      profile: `User: ${user.name || 'User'}`,
      dataSummary: ""
    };
  } catch (error) {
    console.error('Error fetching basic user context:', error);
    return {
      profile: "",
      dataSummary: ""
    };
  }
};

// ============================================
// PROMPT BUILDING
// ============================================

/**
 * Build the final prompt to send to Gemini (optimized for token efficiency)
 * @param {string} question - User's question
 * @param {string} userProfile - User profile information
 * @param {string} userDataSummary - User's dataset summary
 * @returns {string} - Complete prompt for AI
 */
export const buildPrompt = (question, userProfile = "", userDataSummary = "") => {
  // Truncate long data summaries to prevent token overflow
  const maxDataSummaryLength = 1500;
  const truncatedDataSummary = userDataSummary.length > maxDataSummaryLength 
    ? userDataSummary.substring(0, maxDataSummaryLength) + "\n\n...(data truncated for brevity)"
    : userDataSummary;

  return `You are an AI assistant for Startlytics - a comprehensive data analytics platform designed specifically for startup founders and data-driven teams.

CORE CAPABILITIES:
Your primary role is to help users with:
- File uploads (CSV, Excel, Google Sheets)
- Dashboard creation and data visualization
- AI-powered insights from their datasets
- Platform features, pricing, and account management
- Data analysis techniques and best practices
- Business metrics and KPI interpretation

RESPONSE GUIDELINES:
- Always respond in English, be concise but thorough
- Use emojis appropriately to enhance readability
- Be professional yet friendly, like a knowledgeable advisor
- Provide actionable advice and specific next steps
- If the question is unrelated to the platform or data analytics, politely redirect:
  "I can help you with questions related to Startlytics platform features, data uploads, dashboards, analytics insights, or data analysis techniques. Please ask accordingly."

${userProfile ? `\n📋 USER INFORMATION:\n${userProfile}\n` : ''}

${truncatedDataSummary ? `\n📊 USER'S DATA:\n${truncatedDataSummary}\n` : ''}

❓ USER QUESTION: "${question}"

💡 YOUR RESPONSE:`;
};

/**
 * Advanced prompt builder with context awareness
 * Routes to specialized prompts based on question type
 * @param {string} question - User's question
 * @param {string} userProfile - User profile information
 * @param {string} userDataSummary - User's dataset summary
 * @returns {string} - Optimized prompt for specific question type
 */
export const buildSmartPrompt = (question, userProfile = "", userDataSummary = "") => {
  const questionType = detectQuestionType(question);
  
  console.log(`🎯 Detected question type: ${questionType}`);

  switch (questionType) {
    case 'dashboard':
      return buildDashboardPrompt(question, userProfile, userDataSummary);
    
    case 'upload':
      return buildUploadPrompt(question, userProfile, userDataSummary);
    
    case 'pricing':
      return buildPricingPrompt(question, userProfile);
    
    case 'data_analysis':
      return buildDataAnalysisPrompt(question, userProfile, userDataSummary);
    
    default:
      return buildPrompt(question, userProfile, userDataSummary);
  }
};

/**
 * Specialized prompt for dashboard/visualization questions
 */
const buildDashboardPrompt = (question, userProfile, userDataSummary) => {
  const truncatedData = userDataSummary.length > 800 
    ? userDataSummary.substring(0, 800) + "...(truncated)" 
    : userDataSummary;

  return `You are a data visualization expert for Startlytics platform.

FOCUS AREAS:
- Creating effective dashboards and charts
- Choosing the right visualization type for different data
- Dashboard customization and best practices
- Interactive features and user experience
- Chart types: line, bar, pie, scatter, heatmaps, etc.

${userProfile ? `USER: ${userProfile}\n` : ''}
${truncatedData ? `AVAILABLE DATA: ${truncatedData}\n` : ''}

QUESTION: "${question}"

Provide specific, actionable guidance with examples where relevant:`;
};

/**
 * Specialized prompt for upload/import questions
 */
const buildUploadPrompt = (question, userProfile, userDataSummary) => {
  return `You are a file upload specialist for Startlytics platform.

EXPERTISE IN:
- CSV file uploads and formatting requirements
- Excel file imports (XLS, XLSX)
- Google Sheets connection and syncing
- Data preparation and cleaning tips
- Upload troubleshooting and common errors
- File size limits and best practices

${userProfile ? `USER: ${userProfile}\n` : ''}

QUESTION: "${question}"

Provide clear, step-by-step guidance:`;
};

/**
 * Specialized prompt for pricing questions
 */
const buildPricingPrompt = (question, userProfile) => {
  return `You are a pricing consultant for Startlytics platform.

PRICING PLANS OVERVIEW:

🆓 FREE PLAN:
- Up to 5 datasets
- Basic analytics dashboard
- Core metrics visualization
- Community support
- 1GB storage
- Perfect for: Solo founders, side projects

💼 PRO PLAN ($29/month):
- Unlimited datasets
- Advanced AI insights
- Custom dashboards
- Priority email support
- 10GB storage
- Real-time data sync
- Export capabilities
- Perfect for: Growing startups, small teams

🏢 ENTERPRISE PLAN ($99/month):
- Everything in Pro
- Dedicated account manager
- API access
- Custom integrations
- Unlimited storage
- 24/7 phone support
- Team collaboration features
- White-label options
- Perfect for: Established companies, large teams

${userProfile ? `\nUSER: ${userProfile}` : ''}

QUESTION: "${question}"

Provide helpful pricing guidance and recommendations:`;
};

/**
 * Specialized prompt for data analysis questions
 */
const buildDataAnalysisPrompt = (question, userProfile, userDataSummary) => {
  const truncatedData = userDataSummary.length > 1000 
    ? userDataSummary.substring(0, 1000) + "...(truncated)" 
    : userDataSummary;

  return `You are a data analysis expert for Startlytics platform.

EXPERTISE IN:
- Statistical analysis and interpretation
- Business metrics and KPIs
- Trend identification and forecasting
- Data quality assessment
- Correlation and causation analysis
- Actionable insights generation

${userProfile ? `USER: ${userProfile}\n` : ''}
${truncatedData ? `USER'S DATA: ${truncatedData}\n` : ''}

QUESTION: "${question}"

Provide expert analysis and actionable recommendations:`;
};

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Cache cleanup utility - removes expired entries
 * Should be called periodically (e.g., every 10 minutes)
 */
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
  
  return cleaned;
};

/**
 * Get cache statistics for monitoring
 * @returns {Object} - Cache statistics
 */
export const getCacheStats = () => {
  const entries = Array.from(userContextCache.entries());
  const now = Date.now();
  
  const activeEntries = entries.filter(([, value]) => 
    now - value.timestamp < CACHE_TTL
  );
  
  return {
    total: userContextCache.size,
    active: activeEntries.length,
    expired: userContextCache.size - activeEntries.length,
    ttlMinutes: CACHE_TTL / 60000,
    entries: entries.map(([key, value]) => ({
      key,
      age: Math.round((now - value.timestamp) / 1000), // seconds
      expired: now - value.timestamp > CACHE_TTL
    }))
  };
};

/**
 * Manual cache invalidation for specific user
 * @param {string} userId - User ID to invalidate
 * @returns {boolean} - True if cache was deleted
 */
export const invalidateUserCache = (userId) => {
  if (!userId) {
    return false;
  }

  const cacheKey = `user_context_${userId}`;
  const deleted = userContextCache.delete(cacheKey);
  
  if (deleted) {
    console.log(`🗑️ User cache invalidated for ${userId}`);
  }
  
  return deleted;
};

/**
 * Clear all cache entries
 * @returns {number} - Number of entries cleared
 */
export const clearAllCache = () => {
  const size = userContextCache.size;
  userContextCache.clear();
  console.log(`🗑️ Cleared all ${size} cache entries`);
  return size;
};

/**
 * Warm up cache for specific user (pre-fetch)
 * Useful for anticipated requests
 * @param {string} userId - User ID to warm cache for
 * @returns {Promise<boolean>} - Success status
 */
export const warmupUserCache = async (userId) => {
  if (!userId) {
    return false;
  }

  try {
    console.log(`🔥 Warming up cache for user: ${userId}`);
    await fetchUserContext(userId);
    return true;
  } catch (error) {
    console.error(`❗ Cache warmup failed for user ${userId}:`, error.message);
    return false;
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Sanitize user input to prevent injection
 * @param {string} input - User input
 * @returns {string} - Sanitized input
 */
export const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000); // Limit length
};

/**
 * Format large numbers for better readability
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 */
export const formatNumber = (num) => {
  if (typeof num !== 'number') {
    return '0';
  }

  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Calculate cache hit rate for monitoring
 * @returns {Object} - Cache performance metrics
 */
export const getCachePerformance = () => {
  const stats = getCacheStats();
  const hitRate = stats.total > 0 
    ? ((stats.active / stats.total) * 100).toFixed(2) 
    : 0;

  return {
    ...stats,
    hitRatePercentage: `${hitRate}%`,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
    uptime: process.uptime() // seconds
  };
};

// Export all functions
export default {
  isPersonalIntent,
  detectQuestionType,
  fetchUserContext,
  fetchBasicUserContext,
  buildPrompt,
  buildSmartPrompt,
  cleanupCache,
  getCacheStats,
  invalidateUserCache,
  clearAllCache,
  warmupUserCache,
  sanitizeInput,
  formatNumber,
  getCachePerformance
};