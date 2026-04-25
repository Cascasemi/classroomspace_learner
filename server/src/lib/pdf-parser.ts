/**
 * PDF Parser
 *
 * Uses `unpdf` for text extraction and `sharp` for image conversion.
 * All logic is vanilla Node.js — no Next.js dependencies.
 *
 * Output structure is consistent so the generation pipeline
 * receives the same shape regardless of where the PDF came from.
 */

import { extractText, getDocumentProxy, extractImages } from 'unpdf';
import sharp from 'sharp';

// ── Output types ───────────────────────────────────────────────────────────

export interface PdfImageMeta {
  id: string;
  src: string; // base64 data URL
  pageNumber: number;
  width: number;
  height: number;
}

export interface ParsedPdfContent {
  text: string;
  images: string[]; // base64 data URLs
  metadata: {
    pageCount: number;
    parser: string;
    processingTime?: number;
    imageMapping: Record<string, string>;
    pdfImages: PdfImageMeta[];
  };
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Parse a PDF Buffer and return extracted text + images.
 * Parse a PDF Buffer and return extracted text + images.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedPdfContent> {
  const startTime = Date.now();

  const uint8Array = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8Array);
  const numPages = pdf.numPages;

  // Extract full text (all pages merged)
  const { text: pdfText } = await extractText(pdf, { mergePages: true });

  // Extract images page by page
  const images: string[] = [];
  const pdfImages: PdfImageMeta[] = [];
  let imageCounter = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    let pageImages: Awaited<ReturnType<typeof extractImages>>;
    try {
      pageImages = await extractImages(pdf, pageNum);
    } catch {
      console.warn(`[pdf-parser] Could not extract images from page ${pageNum}`);
      continue;
    }

    for (const imgData of pageImages) {
      try {
        const pngBuffer = await sharp(Buffer.from(imgData.data), {
          raw: {
            width: imgData.width,
            height: imgData.height,
            channels: imgData.channels,
          },
        })
          .png()
          .toBuffer();

        const base64 = `data:image/png;base64,${pngBuffer.toString('base64')}`;
        imageCounter++;
        const imgId = `img_${imageCounter}`;
        images.push(base64);
        pdfImages.push({ id: imgId, src: base64, pageNumber: pageNum, width: imgData.width, height: imgData.height });
      } catch {
        console.warn(`[pdf-parser] Failed to convert image on page ${pageNum}`);
      }
    }
  }

  return {
    text: pdfText,
    images,
    metadata: {
      pageCount: numPages,
      parser: 'unpdf',
      processingTime: Date.now() - startTime,
      imageMapping: Object.fromEntries(pdfImages.map((m) => [m.id, m.src])),
      pdfImages,
    },
  };
}
