// Shrinks a photo in the browser before it's uploaded: a phone photo of a menu is often 5 MB or
// more, while Claude reads text just as well at 1568 pixels on the long side (larger images are
// scaled down by the API anyway). The result is a JPEG of a few hundred KB, sent as base64.
// Also turns formats only the browser can open (an iPhone's HEIC, in Safari) into JPEG.

const LONG_SIDE = 1568;

export interface Photo {
  mediaType: 'image/jpeg';
  // Base64, without the "data:...;base64," prefix.
  data: string;
}

export async function shrinkPhoto(file: File): Promise<Photo> {
  let bitmap: ImageBitmap;
  try {
    // Applies the photo's rotation (EXIF orientation), so sideways phone photos come out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${file.name} couldn't be opened. Try a JPEG or PNG photo.`);
  }
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser cannot prepare photos for upload.');
  // White behind transparent PNGs, which JPEG can't keep.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}
