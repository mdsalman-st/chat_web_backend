import fs from 'fs';
import pdfParse from 'pdf-parse';

/**
 * PDF file se text extract karta hai.
 * AI is text ka use karke board-specific questions generate karega.
 * 
 * @param {string} filePath - Server par saved PDF ka path
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPdf(filePath) {
  try {
    // File ko buffer mein read karo
    const dataBuffer = fs.readFileSync(filePath);
    
    // PDF parse karo
    const pdfData = await pdfParse(dataBuffer);
    
    // Text return karo (agar text nahi hai, toh empty string)
    return (pdfData.text || '').trim();
  } catch (error) {
    console.error(`[PDF Extraction Failed] ${error.message}`);
    // Error aane par empty string return karo taaki server crash na ho
    return '';
  }
}