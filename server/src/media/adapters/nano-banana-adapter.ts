import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';
const CURL_STATUS_MARKER = '__NEUROSPACE_HTTP_STATUS__:';
const execFileAsync = promisify(execFile);

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    code: number;
    message: string;
  };
}

function buildRequestBody(options: ImageGenerationOptions): string {
  return JSON.stringify({
    contents: [{ parts: [{ text: options.prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  });
}

async function runCurlGeminiRequest(
  url: string,
  apiKey: string,
  body: string,
): Promise<{ statusCode: number; bodyText: string }> {
  const curlBinary = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const { stdout, stderr } = await execFileAsync(
    curlBinary,
    [
      url,
      '-sS',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `x-goog-api-key: ${apiKey}`,
      '--data-binary', body,
      '-w', `\n${CURL_STATUS_MARKER}%{http_code}`,
    ],
    {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120_000,
    },
  );

  const markerIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
  if (markerIndex === -1) {
    throw new Error(`Gemini curl response missing HTTP status marker. ${stderr || 'No stderr.'}`);
  }

  const bodyText = stdout.slice(0, markerIndex).trim();
  const statusCodeText = stdout.slice(markerIndex + CURL_STATUS_MARKER.length).trim();
  const statusCode = Number.parseInt(statusCodeText, 10);

  if (!Number.isFinite(statusCode)) {
    throw new Error(`Gemini curl response returned invalid HTTP status: ${statusCodeText}`);
  }

  return { statusCode, bodyText };
}

async function runGeminiRequest(
  url: string,
  apiKey: string,
  body: string,
): Promise<{ statusCode: number; bodyText: string }> {
  try {
    return await runCurlGeminiRequest(url, apiKey, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ENOENT|not recognized|not found/i.test(message)) {
      throw error;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    });

    return {
      statusCode: response.status,
      bodyText: await response.text(),
    };
  }
}

export async function generateWithNanoBanana(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const model = config.model || DEFAULT_MODEL;
  const requestUrl = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const requestBody = buildRequestBody(options);

  const { statusCode, bodyText } = await runGeminiRequest(requestUrl, config.apiKey, requestBody);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Gemini image generation failed (${statusCode}): ${bodyText}`);
  }

  const data = JSON.parse(bodyText) as GeminiResponse;
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part?.data) {
    const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    throw new Error(`Gemini did not return an image. ${text || 'No extra detail.'}`);
  }

  const bytes = Buffer.from(part.data, 'base64');

  return {
    base64: part.data,
    bytes,
    width: options.width || 1280,
    height: options.height || 720,
  };
}
