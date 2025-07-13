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

  return `You are an AI assistant for Startlytics - a data analytics platform.

SCOPE: Answer questions about:
- File uploads (CSV, Excel, Google Sheets)
- Dashboards and data visualization
- AI insights from datasets
- Platform features and pricing
- Account management

RULES:
- English only, be concise and helpful
- Use emojis appropriately
- For unrelated questions: "I can help you only with questions related to this platform like uploading data, dashboards, insights, or using features. Please ask accordingly."

${userProfile ? `USER: ${userProfile}` : ''}

${truncatedDataSummary ? `DATA: ${truncatedDataSummary}` : ''}

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
  for (const [key, value] of userContextCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      userContextCache.delete(key);
    }
  }
};

// 🔹 Get cache statistics (for monitoring)
export const getCacheStats = () => {
  return {
    size: userContextCache.size,
    entries: Array.from(userContextCache.keys())
  };
};

// 🔹 Manual cache invalidation
export const invalidateUserCache = (userId) => {
  const cacheKey = `user_context_${userId}`;
  return userContextCache.delete(cacheKey);
};