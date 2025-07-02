import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const askAssistant = async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ message: "Question is required" });
  }

  try {
    const prompt = `
You are an AI assistant for a platform called Startup Help PVT LTD.

✅ You must only answer questions related to:
- Uploading/managing datasets (CSV, Excel, Google Sheets)
- Importing data
- Viewing dashboards or summaries
- AI insights based on uploaded data
- Platform usage or feature help
-pricing related free/month , pro - 29$/month , Enterprise - 99$/months

❌ If the user asks anything else (unrelated to platform), respond:
"I can help you only with questions related to this platform like uploading data, dashboard insights, or using the features. Please ask accordingly."

Now answer the following question accordingly:
"${question}"
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text();

    res.status(200).json({ answer });

  } catch (err) {
    console.error("AI Assistant Error:", err);
    res.status(500).json({ message: "Assistant failed", error: err.message });
  }
};
