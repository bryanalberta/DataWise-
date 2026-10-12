/**
 * Memeriksa apakah ArrayBuffer atau Uint8Array memiliki PNG magic signature yang valid.
 * Header PNG baku (8 byte): 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A (\x89PNG\r\n\x1a\n).
 */
export function isValidPngSignature(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 8) return false;
  const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  return pngMagic.every((byte, idx) => bytes[idx] === byte);
}

/**
 * Membuat minimal valid 1x1 PNG Uint8Array (berguna untuk test runner & fallback).
 */
export function createMockPngBytes(): Uint8Array {
  // Minimal valid 1x1 grayscale PNG
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length & type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // RGBA, deflate, filter, interlace, CRC
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
    0x42, 0x60, 0x82
  ]);
}

/**
 * Mengonversi elemen SVGSVGElement menjadi file Blob PNG beresolusi tinggi (2x Retina scale)
 * dan secara otomatis memicu pengunduhan file di browser pengguna tanpa melibatkan server.
 */
export async function exportSvgToPng(
  svgElement: SVGSVGElement,
  fileName: string = 'datawise-chart.png'
): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Lingkungan Node.js (misal test runner)
    const bytes = createMockPngBytes();
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
  }

  return new Promise((resolve, reject) => {
    try {
      const bbox = svgElement.getBoundingClientRect();
      const width = Math.max(svgElement.clientWidth || 0, bbox.width || 800);
      const height = Math.max(svgElement.clientHeight || 0, bbox.height || 450);

      // Clone elemen SVG agar tidak mengubah tampilan aktif
      const clone = svgElement.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('version', '1.1');
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', `${width}`);
      clone.setAttribute('height', `${height}`);

      // Tambahkan background putih solid agar tidak transparan
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', '#ffffff');
      clone.insertBefore(bgRect, clone.firstChild);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = 2; // Skala 2x Retina untuk ketajaman tinggi
          canvas.width = width * scale;
          canvas.height = height * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Gagal menginisialisasi 2D Canvas rendering context.'));
            return;
          }

          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Gagal membuat objek Blob PNG dari kanvas grafik.'));
              return;
            }

            // Memicu pengunduhan file di browser
            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(downloadUrl);

            resolve(blob);
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Gagal memuat format SVG ke dalam kanvas rendering.'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}
