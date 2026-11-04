// backend/services/pdfTextExtractor.js
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * PDF file se text extract karta hai.
 * AI is text ka use karke board-specific questions generate karega.
 * 
 * @param {Buffer|string} input - PDF buffer, local file path, ya remote URL
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPdf(input) {
  try {
    let pdfBuffer;

    if (Buffer.isBuffer(input)) {
      pdfBuffer = input;
    } else if (typeof input === 'string') {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const resp = await fetch(input);
        if (!resp.ok) {
          throw new Error(`Failed to fetch PDF from URL: ${resp.status} ${resp.statusText}`);
        }
        const arrayBuf = await resp.arrayBuffer();
        pdfBuffer = Buffer.from(arrayBuf);
      } else {
        pdfBuffer = await fs.promises.readFile(input);
      }
    } else {
      return '';
    }

    const pdfData = await pdfParse(pdfBuffer);
    return (pdfData.text || '').trim();
  } catch (error) {
    console.error(`[PDF Extraction Failed] ${error.message}`);
    return '';
  }
}
