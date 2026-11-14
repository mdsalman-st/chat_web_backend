// import OpenAI from 'openai';

// // Load Balancer ka client setup
// const aiClient = new OpenAI({
//     baseURL: process.env.AI_GATEWAY_URL, // http://localhost:4000/v1
//     apiKey: process.env.AI_GATEWAY_KEY    // sk-nexus-1234
// });

// // Main Function: Yeh koshish karega bada batch lene ka, fail hone par chota lega
// export const generateQuestions = async (chapterText, totalQuestions = 25) => {
//     try {
//         console.log("🚀 Trying NVIDIA Bulk (Big Batch)...");
        
//         // 1. Pehle NVIDIA par bada batch maango
//         const response = await aiClient.chat.completions.create({
//             model: "nvidia-bulk",
//             messages: [
//                 { 
//                     role: "system", 
//                     content: "You are an AI that generates exam questions. ALWAYS output ONLY a valid JSON array of objects. No extra text." 
//                 },
//                 { 
//                     role: "user", 
//                     content: `Generate ${totalQuestions} MCQs from this text: ${chapterText}` 
//                 }
//             ],
//             // NVIDIA par token limit nahi hai, toh max_tokens bada rakh sakte hain
//             max_tokens: 4000 
//         });

//         return JSON.parse(response.choices[0].message.content);

//     } catch (error) {
//         console.log(`⚠️ NVIDIA Failed (${error.message}). Switching to Small Batches...`);
        
//         // 2. Agar NVIDIA fail hua (429, timeout, etc.), toh backup (Groq/Gemini) par chota batch maango
//         return await generateInSmallBatches(chapterText, totalQuestions);
//     }
// };

// // Fallback Function: Chote batches (5-5 questions)
// const generateInSmallBatches = async (chapterText, totalQuestions) => {
//     let allQuestions = [];
//     const batchSize = 5; // Groq/Gemini ki token limit ke liye safe size

//     for (let i = 0; i < totalQuestions; i += batchSize) {
//         console.log(`🔄 Generating Backup Batch ${Math.floor(i/batchSize) + 1}...`);
        
//         try {
//             const response = await aiClient.chat.completions.create({
//                 model: "backup-small", // Yeh LiteLLM automatically Groq/Gemini par bhejega
//                 messages: [
//                     { 
//                         role: "system", 
//                         content: "You are an AI that generates exam questions. ALWAYS output ONLY a valid JSON array of objects. No extra text." 
//                     },
//                     { 
//                         role: "user", 
//                         content: `Generate ${batchSize} MCQs from this text: ${chapterText}` 
//                     }
//                 ],
//                 max_tokens: 1500 // Backup models ke liye safe limit
//             });

//             const questions = JSON.parse(response.choices[0].message.content);
//             allQuestions.push(...questions);

//         } catch (batchError) {
//             console.error(`❌ Backup batch failed: ${batchError.message}`);
//             // Agar ek batch fail ho jaye, toh loop break mat karo, agli try karo
//         }
//     }

//     return allQuestions;
// };