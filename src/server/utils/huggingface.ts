/**
 * HuggingFace Model Downloader
 */

import { createWriteStream } from 'fs';
import { finished } from 'stream/promises';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const HF_BASE_URL = 'https://huggingface.co';

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  speedMbps: number;
  etaSeconds: number;
}

/**
 * Download a model file from HuggingFace with proper redirect handling
 */
export async function downloadFile(
  repoId: string,
  filename: string,
  destination: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const url = `${HF_BASE_URL}/${repoId}/resolve/main/${filename}`;
  await downloadFileFromUrl(url, destination, onProgress);
}

/**
 * Download a file from any URL with progress tracking
 */
async function downloadFileFromUrl(
  url: string,
  destination: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(url, { maxRedirects: 5 }, (res) => {
      // Handle redirects
      if (res.statusCode === 302 || res.statusCode === 301) {
        const location = res.headers.location;
        if (location) {
          // Resolve relative redirects
          const redirectUrl = new URL(location, url).toString();
          console.log(`[Download] Following redirect: ${url} -> ${redirectUrl}`);
          downloadFileFromUrl(redirectUrl, destination, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }
        reject(new Error(`Redirect with no location: ${res.statusCode}`));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode} ${res.statusMessage}`));
        return;
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      let lastTime = Date.now();
      let lastSize = 0;
      let speedBytesPerSec = 0;

      const file = createWriteStream(destination);

      res.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;

        // Calculate speed every second
        const now = Date.now();
        if (now - lastTime >= 1000) {
          const deltaSize = downloadedSize - lastSize;
          speedBytesPerSec = deltaSize * (1000 / (now - lastTime));
          lastTime = now;
          lastSize = downloadedSize;
        }

        const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
        const etaSeconds = speedBytesPerSec > 0 ? (totalSize - downloadedSize) / speedBytesPerSec : 0;

        if (onProgress) {
          onProgress({
            percent: Math.round(percent * 100) / 100,
            transferred: downloadedSize,
            total: totalSize,
            speedMbps: Math.round((speedBytesPerSec / 1024 / 1024) * 100) / 100,
            etaSeconds: Math.round(etaSeconds),
          });
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      res.on('error', (err) => {
        file.close();
        reject(err);
      });

      file.on('error', (err) => {
        reject(err);
      });
    });

    request.on('error', reject);
  });
}

/**
 * List files in a HuggingFace repo
 */
export async function listRepoFiles(repoId: string): Promise<any[]> {
  const url = `${HF_BASE_URL}/api/models/${repoId}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.siblings || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Search HuggingFace for GGUF models
 */
export async function searchGGUFModels(query: string, limit: number = 20): Promise<any[]> {
  const url = `${HF_BASE_URL}/api/models?search=${encodeURIComponent(query + ' gguf')}&limit=${limit}&sort=downloads&direction=-1`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Get model info from HuggingFace API
 */
export async function getModelInfo(repoId: string): Promise<any> {
  const url = `${HF_BASE_URL}/api/models/${repoId}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}
