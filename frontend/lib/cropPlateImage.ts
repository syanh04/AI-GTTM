type BBox = [number, number, number, number];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(imageSource: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot load image for crop'));
    img.src = imageSource;
  });
}

function drawCrop(img: HTMLImageElement, left: number, top: number, right: number, bottom: number, upscale = 1) {
  const x1 = clamp(Math.floor(left), 0, img.naturalWidth - 1);
  const y1 = clamp(Math.floor(top), 0, img.naturalHeight - 1);
  const x2 = clamp(Math.ceil(right), x1 + 1, img.naturalWidth);
  const y2 = clamp(Math.ceil(bottom), y1 + 1, img.naturalHeight);
  const width = Math.max(1, x2 - x1);
  const height = Math.max(1, y2 - y1);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * upscale));
  canvas.height = Math.max(1, Math.round(height * upscale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create Canvas 2D context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x1, y1, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export async function cropPlateFromImage(
  imageSource: string,
  bbox: BBox,
  upscale = 2,
): Promise<string> {
  const img = await loadImage(imageSource);
  const [xMin, yMin, xMax, yMax] = bbox;
  const boxWidth = Math.max(1, xMax - xMin);
  const boxHeight = Math.max(1, yMax - yMin);
  const ratio = boxWidth / Math.max(1, boxHeight);
  const padX = ratio > 1.8 ? boxWidth * 0.08 : boxWidth * 0.10;
  const padY = ratio > 1.8 ? boxHeight * 0.14 : boxHeight * 0.10;
  return drawCrop(img, xMin - padX, yMin - padY, xMax + padX, yMax + padY, upscale);
}

export async function cropVehicleFromImage(
  imageSource: string,
  bbox: BBox,
): Promise<string> {
  const img = await loadImage(imageSource);
  const [xMin, yMin, xMax, yMax] = bbox;
  const boxWidth = Math.max(1, xMax - xMin);
  const boxHeight = Math.max(1, yMax - yMin);
  let left = xMin - boxWidth * 0.25;
  let top = yMin - boxHeight * 0.25;
  let right = xMax + boxWidth * 0.25;
  let bottom = yMax + boxHeight * 0.25;

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  if (width / height < 4 / 3) {
    const targetWidth = height * (16 / 9);
    const delta = (targetWidth - width) / 2;
    left -= delta;
    right += delta;
  }

  if (left < 0) {
    right -= left;
    left = 0;
  }
  if (right > img.naturalWidth) {
    left = Math.max(0, left - (right - img.naturalWidth));
    right = img.naturalWidth;
  }
  if (top < 0) {
    bottom -= top;
    top = 0;
  }
  if (bottom > img.naturalHeight) {
    top = Math.max(0, top - (bottom - img.naturalHeight));
    bottom = img.naturalHeight;
  }

  return drawCrop(img, left, top, right, bottom, 1);
}
