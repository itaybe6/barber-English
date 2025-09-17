# Image Compression Utility

This utility provides image compression functionality to reduce file sizes and improve upload/loading performance.

## Features

- **Automatic compression**: Reduces image file size while maintaining quality
- **Aspect ratio preservation**: Maintains original image proportions
- **Multiple format support**: JPEG, PNG, and WebP formats
- **Batch processing**: Compress multiple images at once
- **Configurable options**: Customizable quality, dimensions, and format

## Usage

### Basic Compression

```typescript
import { compressImage } from '@/lib/utils/imageCompression';

const compressedImage = await compressImage(imageUri, {
  quality: 0.7,        // 0.1 to 1.0 (70% quality)
  maxWidth: 1200,      // Maximum width in pixels
  maxHeight: 1200,     // Maximum height in pixels
  format: 'jpeg'       // Output format
});
```

### Batch Compression

```typescript
import { compressImages } from '@/lib/utils/imageCompression';

const imageUris = ['uri1', 'uri2', 'uri3'];
const compressedImages = await compressImages(imageUris, {
  quality: 0.7,
  maxWidth: 1200,
  maxHeight: 1200,
  format: 'jpeg'
});
```

### Get File Size

```typescript
import { getImageFileSize, formatFileSize } from '@/lib/utils/imageCompression';

const sizeInBytes = await getImageFileSize(imageUri);
const formattedSize = formatFileSize(sizeInBytes); // "2.5 MB"
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quality` | number | 0.7 | Compression quality (0.1-1.0) |
| `maxWidth` | number | 1200 | Maximum width in pixels |
| `maxHeight` | number | 1200 | Maximum height in pixels |
| `format` | string | 'jpeg' | Output format ('jpeg', 'png', 'webp') |

## Implementation in App

The compression is automatically applied in:

- **Edit Gallery**: When selecting images for designs
- **Edit Products**: When uploading product images

This ensures faster uploads and better performance for both admins and clients.

## Performance Benefits

- **Reduced upload time**: Smaller file sizes mean faster uploads
- **Better user experience**: Faster loading times for clients
- **Storage efficiency**: Less storage space required
- **Bandwidth savings**: Reduced data usage for users
