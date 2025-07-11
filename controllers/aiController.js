import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import DATASHEET from '../models/Dataset.js';

const genAI = new GoogleGenerativeAI( process.env.GEMINI_API_KEY );

export const getAISummary = async ( req, res ) => {
    try {
        const dataset = await DATASHEET.findOne( {
            _id: req.params.datasetId,
            userId: req.user.id
        } );
d
        if ( !dataset ) {
            return res.status( 404 ).json( { message: "Dataset not found" } );
        }

        const sampleData = dataset.rows.slice( 0, 30 );
        const formatted = [
            dataset.headers.join( ", " ),
            ...sampleData.map( row => dataset.headers.map( h => row[ h ] ).join( ", " ) )
        ].join( "\n" );

        const prompt = `
You are an AI assistant for Startup Help PVT LTD. You must respond in EXACTLY this format, nothing else:

Welcome to Startup Help PVT LTD

- AI Summary - [Your key insight about the data here]
- Ask AI Anything - [Your analysis or recommendation based on the data]
- Personalized Suggestions - [Specific suggestion based on startup type/niche from the data]
- Weekly Growth Tips - [Growth tip or strategy based on data patterns]

Analyze this startup data and provide insights in the above format only:

Data (CSV format):
${formatted}

Remember: Start with "Welcome to Startup Help PVT LTD" and follow the exact bullet point format shown above.
    `;

        const model = genAI.getGenerativeModel( { model: "gemini-1.5-flash" } );

        const result = await model.generateContent( prompt );
        const response = await result.response;
        const aiSummary = response.text();

        res.status( 200 ).json( { summary: aiSummary } );

    } catch ( err ) {
        console.error( err );
        res.status( 500 ).json( { message: "AI Summary failed", error: err.message } );
    }
};