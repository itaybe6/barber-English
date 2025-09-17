import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressionOptions {
  quality?: number; // 0.1 to 1.0, default 0.7
  maxWidth?: number; // default 1200
  maxHeight?: number; // default 1200
  format?: 'jpeg' | 'png' | 'webp'; // default 'jpeg'
}

export interface CompressedImageResult {
  uri: string;
  width: number;
  height: number;
  size?: number; // in bytes
}

/**
 * Compresses an image to reduce file size while maintaining reasonable quality
 * @param imageUri - The URI of the image to compress
 * @param options - Compression options
 * @returns Promise with compressed image data
 */
export async function compressImage(
  imageUri: string,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const {
    quality = 0.7,
    maxWidth = 1200,
    maxHeight = 1200,
    format = 'jpeg'
  } = options;

  try {
    // First, get the original image dimensions
    const originalImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [],
      { format: ImageManipulator.SaveFormat.JPEG }
    );

    // Calculate the resize dimensions while maintaining aspect ratio
    const { width: originalWidth, height: originalHeight } = originalImage;
    
    let resizeWidth = originalWidth;
    let resizeHeight = originalHeight;

    // Only resize if the image is larger than max dimensions
    if (originalWidth > maxWidth || originalHeight > maxHeight) {
      const aspectRatio = originalWidth / originalHeight;
      
      if (originalWidth > originalHeight) {
        // Landscape
        resizeWidth = Math.min(maxWidth, originalWidth);
        resizeHeight = resizeWidth / aspectRatio;
        
        // If height is still too large, adjust
        if (resizeHeight > maxHeight) {
          resizeHeight = maxHeight;
          resizeWidth = resizeHeight * aspectRatio;
        }
      } else {
        // Portrait or square
        resizeHeight = Math.min(maxHeight, originalHeight);
        resizeWidth = resizeHeight * aspectRatio;
        
        // If width is still too large, adjust
        if (resizeWidth > maxWidth) {
          resizeWidth = maxWidth;
          resizeHeight = resizeWidth / aspectRatio;
        }
      }
    }

    // Perform the compression
    const compressedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        {
          resize: {
            width: Math.round(resizeWidth),
            height: Math.round(resizeHeight)
          }
        }
      ],
      {
        compress: quality,
        format: format === 'jpeg' 
          ? ImageManipulator.SaveFormat.JPEG 
          : format === 'png' 
          ? ImageManipulator.SaveFormat.PNG
          : ImageManipulator.SaveFormat.WEBP
      }
    );

    return {
      uri: compressedImage.uri,
      width: compressedImage.width,
      height: compressedImage.height
    };
  } catch (error) {
    console.error('Error compressing image:', error);
    throw new Error('Failed to compress image');
  }
}

/**
 * Compresses multiple images in parallel
 * @param imageUris - Array of image URIs to compress
 * @param options - Compression options
 * @returns Promise with array of compressed image data
 */
export async function compressImages(
  imageUris: string[],
  options: CompressionOptions = {}
): Promise<CompressedImageResult[]> {
  try {
    const compressionPromises = imageUris.map(uri => compressImage(uri, options));
    return await Promise.all(compressionPromises);
  } catch (error) {
    console.error('Error compressing images:', error);
    throw new Error('Failed to compress images');
  }
}

/**
 * Gets the file size of an image in bytes
 * @param imageUri - The URI of the image
 * @returns Promise with file size in bytes
 */
export async function getImageFileSize(imageUri: string): Promise<number> {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return blob.size;
  } catch (error) {
    console.error('Error getting image file size:', error);
    return 0;
  }
}

/**
 * Formats file size in human readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
