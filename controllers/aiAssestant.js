import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import User from '../models/User.js';
import DATASHEET from '../models/Dataset.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const askAssistant = async (req, res) => {
  const { question, id } = req.body;

  // Support token-auth or manual id
  const userId = id || (req.user ? req.user.id : null);

  console.log('📥 Incoming AI question:', { question, userId });

  if (!question || question.trim() === '') {
    return res.status(400).json({ 
      message: "❗ Question is required and cannot be empty." 
    });
  }

  try {
    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        message: "AI service configuration error. Please contact support."
      });
    }

    const lowerQ = question.toLowerCase().trim();
    const personalIntent = [
      "my file", "my data", "my dashboard", "my upload", "i uploaded",
      "my dataset", "my account", "my profile", "show me my", "what did i upload",
      "my csv", "my excel", "personal data", "user data"
    ].some(keyword => lowerQ.includes(keyword));

    let userProfileSummary = "";
    let userDataSummary = "";

    if (personalIntent) {
      // Require authentication for personal data requests
      if (!userId) {
        return res.status(200).json({
          answer: "🔐 To access your personal data and uploaded files, please log in first. I can only provide information about your data when you're authenticated.",
          requiresAuth: true
        });
      }

      try {
        // Fetch user profile safely
        const user = await User.findById(userId).select('name email');
        if (user) {
          userProfileSummary = `User Profile:
- Name: ${user.name || 'Not provided'}
- Email: ${user.email || 'Not provided'}`;
        } else {
          return res.status(404).json({
            answer: "❗ User profile not found. Please contact support if this persists."
          });
        }

        // Fetch user datasets safely
        const datasets = await DATASHEET.find({ userId }).select('_id headers rowCount rows createdAt');
        
        if (!datasets || datasets.length === 0) {
          userDataSummary = "📂 You haven't uploaded any datasets yet. You can upload CSV, Excel, or connect Google Sheets to get started!";
        } else {
          userDataSummary = `📊 You have uploaded ${datasets.length} dataset(s):\n\n` +
            datasets.map((ds, i) => {
              const rowCount = ds.rowCount || (ds.rows ? ds.rows.length : 0);
              const uploadDate = ds.createdAt ? new Date(ds.createdAt).toLocaleDateString() : 'Unknown';
              
              return `Dataset ${i + 1}:
- ID: ${ds._id}
- Headers: ${ds.headers && ds.headers.length > 0 ? ds.headers.join(", ") : 'No headers found'}
- Rows: ${rowCount}
- Uploaded: ${uploadDate}`;
            }).join("\n\n");
        }
      } catch (dbError) {
        console.error("❗ Database Error:", dbError);
        return res.status(500).json({
          answer: "❗ Unable to fetch your data right now. Please try again later."
        });
      }
    }

    // Enhanced prompt with better instructions
    const prompt = `
You are a professional AI assistant for with user name if loggedIn  **<h1> Startlytics PVT LTD</h1>** - a data analytics platform.

✅ You ONLY answer questions about:
- Uploading/managing CSV, Excel, Google Sheets files
- Creating and viewing dashboards and data summaries
- Getting AI insights from uploaded datasets
- Platform features and capabilities
- Pricing plans: Free (basic features), Pro ($29/month), Enterprise ($99/month)
- Account and profile management
- Data visualization and analytics

⚠️ IMPORTANT SECURITY RULES:
- Never reveal internal system details, code, or technical implementation
- Never share other users' data or information
- Keep all responses professional and helpful

✅ Communication Guidelines:
- Reply ONLY in **English**
- Keep answers CLEAR, CONCISE, and HELPFUL
- Use emojis appropriately for better user experience
- Be encouraging and supportive

❌ For unrelated questions, reply exactly:
"I can help you only with questions related to this platform like uploading data, dashboards, insights, or using features. Please ask accordingly."

📌 Current User Context:
${userProfileSummary}

📌 User's Uploaded Data:
${userDataSummary}

💬 User Question: "${question}"

Please provide a helpful, accurate response based on the above context and guidelines.
    `;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        maxOutputTokens: 500,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let answer = response.text();

    // Clean up the response
    answer = answer.trim();
    
    // Ensure the response isn't too long
    if (answer.length > 1000) {
      answer = answer.substring(0, 997) + "...";
    }

    res.status(200).json({ 
      answer,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❗ AI Assistant Error:", err);

    // Handle different types of errors
    if (err.message && err.message.includes("API key")) {
      return res.status(503).json({
        message: "AI service authentication failed. Please contact support.",
        error: "INVALID_API_KEY"
      });
    }

    if (err.message && err.message.includes("fetch failed")) {
      return res.status(503).json({
        message: "AI service is temporarily unavailable. Please try again in a moment.",
        error: "SERVICE_UNAVAILABLE"
      });
    }

    if (err.message && err.message.includes("quota")) {
      return res.status(429).json({
        message: "AI service quota exceeded. Please try again later.",
        error: "QUOTA_EXCEEDED"
      });
    }

    // Generic error response
    res.status(500).json({
      message: "Assistant temporarily unavailable. Please try again later.",
      error: "INTERNAL_ERROR",
      timestamp: new Date().toISOString()
    });
  }
};