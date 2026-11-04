// backend/services/pdfTextExtractor.js
import { createRequire } from 'module';

// 👇 Ye line pdf-parse wale error ko fix karegi 👇
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * PDF file se text extract karta hai.
 * AI is text ka use karke board-specific questions generate karega.
 * 
 * @param {Buffer} pdfBuffer - PDF ka data buffer (Cloudinary se fetch kiya hua)
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPdf(pdfBuffer) {
  try {
    // PDF parse karo
    const pdfData = await pdfParse(pdfBuffer);
    
    // Text return karo (agar text nahi hai, toh empty string)
    return (pdfData.text || '').trim();
  } catch (error) {
    console.error(`[PDF Extraction Failed] ${error.message}`);
    // Error aane par empty string return karo taaki server crash na ho
    return '';
  }
}