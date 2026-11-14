// backend/services/pdfTextExtractor.js
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse'); // ⭐ Naya version ka class

/**
 * PDF file se text extract karta hai (v2 compatible).
 * Supports: Buffer, Local File Path, Remote URL
 */
export async function extractTextFromPdf(input) {
  try {
    let pdfBuffer;

    if (Buffer.isBuffer(input)) {
      pdfBuffer = input;
    } else if (typeof input === 'string') {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const resp = await fetch(input);
        if (!resp.ok) throw new Error(`Failed to fetch PDF: ${resp.status}`);
        pdfBuffer = Buffer.from(await resp.arrayBuffer());
      } else {
        pdfBuffer = await fs.promises.readFile(input);
      }
    } else {
      return '';
    }

    // ⭐ Naya v2 Syntax
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    await parser.destroy();

    return (result.text || '').trim();
  } catch (error) {
    console.error(`[PDF Extraction Failed] ${error.message}`);
    return '';
  }
}