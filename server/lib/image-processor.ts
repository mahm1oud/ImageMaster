import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { 
  CompressOptions, 
  ResizeOptions, 
  CropOptions, 
  ConvertOptions, 
  WatermarkOptions, 
  EnlargeOptions,
  BlurFaceOptions
} from '@shared/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const PROCESSED_DIR = path.join(UPLOADS_DIR, 'processed');

export interface ProcessedResult {
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  width: number;
  height: number;
}

class ImageProcessor {
  /**
   * Creates processing directory if it doesn't exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.mkdir(PROCESSED_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating directories:', error);
      throw new Error('Failed to create upload directories');
    }
  }
  
  /**
   * Get image info without processing
   */
  async getImageInfo(filePath: string) {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        size: 0 // Will be filled after processing
      };
    } catch (error) {
      console.error('Error getting image info:', error);
      throw new Error('Failed to get image information');
    }
  }

  /**
   * Compress an image with given options
   */
  async compressImage(filePath: string, options: CompressOptions): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { format, quality, keepMetadata } = options;
      const metadata = await sharp(filePath).metadata();
      const originalFileStat = await fs.stat(filePath);
      const originalFileSize = originalFileStat.size;
      
      // Initialize output paths - may be modified later for specific formats
      let outputFileName = `compressed-${Date.now()}.${format}`;
      let outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // Set up the sharp instance with the selected format
      let sharpInstance = sharp(filePath);
      
      // Calculate optimal dimensions for compression if image is very large
      // This helps achieve better compression ratios
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;
      
      // Dynamic max dimension based on quality and image size
      // Lower quality means we can be more aggressive with resizing for better compression
      const qualityFactor = quality / 100;
      const maxDimension = quality < 70 ? 2000 : (quality < 90 ? 2500 : 3000);
      
      if (originalWidth > maxDimension || originalHeight > maxDimension) {
        const aspectRatio = originalWidth / originalHeight;
        let newWidth = originalWidth;
        let newHeight = originalHeight;
        
        if (originalWidth > originalHeight && originalWidth > maxDimension) {
          newWidth = maxDimension;
          newHeight = Math.round(maxDimension / aspectRatio);
        } else if (originalHeight > maxDimension) {
          newHeight = maxDimension;
          newWidth = Math.round(maxDimension * aspectRatio);
        }
        
        sharpInstance = sharpInstance.resize(newWidth, newHeight, {
          kernel: sharp.kernel.lanczos3,
          fit: 'inside',
          withoutEnlargement: true
        });
        
        console.log(`Resizing large image for better compression: ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}`);
      }
      
      // Apply format-specific compression strategies
      // Normalize format to handle both jpg and jpeg formats
      const normalizedFormat = format.toLowerCase();
      
      // Specific handling for JFIF format (a type of JPEG)
      if (normalizedFormat === 'jfif') {
        // Explicitly set the output extension to jfif
        outputFileName = `compressed-${Date.now()}.jfif`;
        outputPath = path.join(PROCESSED_DIR, outputFileName);
        
        // JFIF is a type of JPEG, so we use jpeg compression but with specific settings
        if (quality < 50) {
          sharpInstance = sharpInstance.jpeg({ 
            quality: quality,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: true,
            mozjpeg: false, // Using standard JPEG encoding for JFIF
            progressive: true
          });
        } else if (quality < 75) {
          sharpInstance = sharpInstance.jpeg({ 
            quality: quality,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: true,
            mozjpeg: false, // Using standard JPEG encoding for JFIF
            progressive: false
          });
        } else {
          sharpInstance = sharpInstance.jpeg({ 
            quality: quality,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: quality < 90,
            mozjpeg: false // Using standard JPEG encoding for JFIF
          });
        }
      }
      // For JPG/JPEG, use standard JPEG output
      else if (normalizedFormat === 'jpg' || normalizedFormat === 'jpeg') {
        // Set output format extension to jpg explicitly
        outputFileName = `compressed-${Date.now()}.jpg`; 
        outputPath = path.join(PROCESSED_DIR, outputFileName);
        
        // Enhanced JPEG compression with quality-specific optimizations
        if (quality < 50) {
          // Maximum compression for lowest quality
          sharpInstance = sharpInstance.jpeg({ 
            quality: quality,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: true,
            mozjpeg: true,
            progressive: true,
            force: true // Ensure standard JPEG format
          });
        } else if (quality < 75) {
          // Good balance of quality and compression
          sharpInstance = sharpInstance.jpeg({ 
            quality: quality,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: true,
            mozjpeg: true,
            progressive: false,
            force: true // Ensure standard JPEG format
          });
        } else {
          // Higher quality with less aggressive compression
          sharpInstance = sharpInstance.jpeg({ 
            quality: quality,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: quality < 90,
            mozjpeg: quality < 90,
            force: true // Ensure standard JPEG format
          });
        }
      } else if (format === 'png') {
        // Enhanced PNG compression with optimal settings for different quality levels
        const compressionLevel = Math.max(1, Math.min(9, Math.floor(10 - (quality / 10)))); // Invert quality for compression level
        
        if (quality < 60) {
          // Maximum compression for lowest quality using palette mode
          sharpInstance = sharpInstance.png({ 
            compressionLevel: 9,
            adaptiveFiltering: true,
            palette: true,
            colors: Math.max(64, Math.min(256, Math.floor(quality * 2.56))), // 64-256 colors
            dither: 1.0,
            effort: 10 // Maximum effort
          });
        } else if (quality < 80) {
          // Good balance for medium quality
          sharpInstance = sharpInstance.png({ 
            compressionLevel: compressionLevel,
            adaptiveFiltering: true,
            palette: false,
            effort: 8 // Good effort but not maximum
          });
        } else {
          // Higher quality with more reasonable compression
          sharpInstance = sharpInstance.png({ 
            compressionLevel: Math.min(compressionLevel, 6),
            adaptiveFiltering: true
          });
        }
      } else if (format === 'webp') {
        // Enhanced WebP compression with optimal settings for different quality levels
        if (quality < 50) {
          // Maximum compression for lowest quality
          sharpInstance = sharpInstance.webp({ 
            quality: quality,
            alphaQuality: 70,
            lossless: false,
            nearLossless: false,
            smartSubsample: true,
            minSize: true, // Minimize size
            effort: 6 // Maximum compression effort
          });
        } else if (quality < 80) {
          // Good balance for medium quality
          sharpInstance = sharpInstance.webp({ 
            quality: quality,
            alphaQuality: 80,
            lossless: false,
            nearLossless: false,
            smartSubsample: true,
            effort: 5
          });
        } else if (quality < 95) {
          // Higher quality with decent compression
          sharpInstance = sharpInstance.webp({ 
            quality: quality,
            alphaQuality: Math.min(100, quality + 10),
            smartSubsample: true,
            effort: 4,
            minSize: false
          });
        } else {
          // Maximum quality with lossless compression
          sharpInstance = sharpInstance.webp({ 
            quality: 100,
            lossless: true,
            nearLossless: true,
            smartSubsample: false
          });
        }
      }
      
      // Preserve metadata if requested, otherwise strip it for better compression
      if (keepMetadata) {
        // Keep some basic metadata but still optimize
        sharpInstance = sharpInstance.withMetadata({
          orientation: metadata.orientation,
          density: metadata.density
        });
      } else {
        // Remove metadata for better compression
        // Using withMetadata(false) to strip all metadata
        sharpInstance = sharpInstance.withMetadata(false);
      }
      
      // Process and save the image
      await sharpInstance.toFile(outputPath);
      
      // Get file stats for size and new metadata
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      // Log compression statistics
      const compressionRatio = (originalFileSize / stats.size).toFixed(2);
      const savingsPercent = ((1 - (stats.size / originalFileSize)) * 100).toFixed(1);
      console.log(`Compressed image: ${originalFileSize} -> ${stats.size} bytes (${compressionRatio}x ratio, ${savingsPercent}% savings)`);
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${format}`,
        fileSize: stats.size,
        width: newMetadata.width || metadata.width || 0,
        height: newMetadata.height || metadata.height || 0
      };
    } catch (error) {
      console.error('Error compressing image:', error);
      throw new Error('Failed to compress image');
    }
  }
  
  /**
   * Resize an image with given options
   */
  async resizeImage(filePath: string, options: ResizeOptions): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { width, height, maintainAspectRatio, resizeMode, percent } = options;
      const metadata = await sharp(filePath).metadata();
      const originalFormat = metadata.format || 'jpeg';
      
      const outputFileName = `resized-${Date.now()}.${originalFormat}`;
      const outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      let sharpInstance = sharp(filePath);
      let resizeOptions: sharp.ResizeOptions = {};
      
      if (resizeMode === 'percent' && percent) {
        // Calculate dimensions based on percentage
        const newWidth = Math.round((metadata.width || 0) * (percent / 100));
        const newHeight = Math.round((metadata.height || 0) * (percent / 100));
        
        resizeOptions = {
          width: newWidth,
          height: newHeight,
          fit: maintainAspectRatio ? 'inside' : 'fill'
        };
      } else if (resizeMode === 'fit') {
        // Fit within the specified dimensions
        resizeOptions = {
          width,
          height,
          fit: 'inside',
          withoutEnlargement: true
        };
      } else {
        // Exact dimensions or single dimension resize
        resizeOptions = {
          width,
          height,
          fit: maintainAspectRatio ? 'inside' : 'fill'
        };
      }
      
      // Process and save the image
      await sharpInstance.resize(resizeOptions).toFile(outputPath);
      
      // Get file stats and metadata for the processed image
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${originalFormat}`,
        fileSize: stats.size,
        width: newMetadata.width || 0,
        height: newMetadata.height || 0
      };
    } catch (error) {
      console.error('Error resizing image:', error);
      throw new Error('Failed to resize image');
    }
  }
  
  /**
   * Crop an image with given options
   */
  async cropImage(filePath: string, options: CropOptions): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { x, y, width, height } = options;
      const metadata = await sharp(filePath).metadata();
      const originalFormat = metadata.format || 'jpeg';
      
      const outputFileName = `cropped-${Date.now()}.${originalFormat}`;
      const outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // Process and save the image
      await sharp(filePath)
        .extract({ left: x, top: y, width, height })
        .toFile(outputPath);
      
      // Get file stats and metadata for the processed image
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${originalFormat}`,
        fileSize: stats.size,
        width: newMetadata.width || 0,
        height: newMetadata.height || 0
      };
    } catch (error) {
      console.error('Error cropping image:', error);
      throw new Error('Failed to crop image');
    }
  }
  
  /**
   * Convert an image to another format
   */
  async convertImage(filePath: string, options: ConvertOptions): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { format, quality } = options;
      const metadata = await sharp(filePath).metadata();
      
      // Initialize output paths - may be modified based on format requirements
      let outputFileName = `converted-${Date.now()}.${format}`;
      let outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // Set up the sharp instance with the target format
      let sharpInstance = sharp(filePath);
      
      // Apply format-specific conversion strategies
      // Normalize format for consistent string comparison
      const normalizedOutputFormat = format.toLowerCase();
      
      if (normalizedOutputFormat === 'jfif') {
        // Specifically convert to JFIF format
        outputFileName = `converted-${Date.now()}.jfif`;
        outputPath = path.join(PROCESSED_DIR, outputFileName);
        
        sharpInstance = sharpInstance.jpeg({ 
          quality,
          trellisQuantisation: true,
          overshootDeringing: true,
          optimizeScans: true,
          mozjpeg: false, // Using standard JPEG encoding for JFIF
          chromaSubsampling: '4:4:4', // Better color quality
        });
      }
      else if (normalizedOutputFormat === 'jpg' || normalizedOutputFormat === 'jpeg') {
        // Explicitly use standard JPEG format (not JFIF)
        // Ensure the filename has .jpg extension
        outputFileName = `converted-${Date.now()}.jpg`;
        outputPath = path.join(PROCESSED_DIR, outputFileName);
        
        sharpInstance = sharpInstance.jpeg({ 
          quality,
          trellisQuantisation: true,
          overshootDeringing: true,
          optimizeScans: true,
          mozjpeg: quality < 90,
          chromaSubsampling: '4:4:4', // Better color quality
          force: true // Force standard JPEG format
        });
      } else if (normalizedOutputFormat === 'png') {
        // Advanced PNG compression with better options for different quality levels
        const compressionLevel = Math.max(1, Math.min(9, Math.floor(10 - (quality / 10))));
        
        if (quality < 60) {
          // For lowest quality, use palette mode for maximum compression
          sharpInstance = sharpInstance.png({ 
            compressionLevel: 9,
            adaptiveFiltering: true,
            palette: true,
            colors: Math.max(64, Math.min(256, Math.floor(quality * 2.56))), // 64-256 colors based on quality
            dither: 1.0
          });
        } else if (quality < 80) {
          // Medium quality with good compression
          sharpInstance = sharpInstance.png({ 
            compressionLevel,
            adaptiveFiltering: true,
            palette: false,
            effort: 9 // Max compression effort
          });
        } else {
          // High quality with normal compression
          sharpInstance = sharpInstance.png({ 
            compressionLevel: Math.min(compressionLevel, 6), // Less aggressive for high quality
            adaptiveFiltering: true
          });
        }
      } else if (normalizedOutputFormat === 'webp') {
        // Advanced WebP options with quality-specific settings
        if (quality < 50) {
          // Lowest quality, maximum compression
          sharpInstance = sharpInstance.webp({ 
            quality,
            alphaQuality: 70,
            lossless: false,
            nearLossless: false,
            smartSubsample: true,
            minSize: true, // Minimize size at the expense of quality
            effort: 6 // Maximum compression effort
          });
        } else if (quality < 80) {
          // Medium quality with good compression
          sharpInstance = sharpInstance.webp({ 
            quality,
            alphaQuality: 80,
            lossless: false,
            nearLossless: false,
            smartSubsample: true,
            effort: 6
          });
        } else if (quality < 95) {
          // High quality
          sharpInstance = sharpInstance.webp({ 
            quality,
            alphaQuality: 100,
            smartSubsample: true,
            effort: 5,
            minSize: false
          });
        } else {
          // Maximum quality
          sharpInstance = sharpInstance.webp({ 
            quality: 100,
            lossless: true,
            nearLossless: true,
            smartSubsample: false,
            effort: 4
          });
        }
      } else if (format === 'gif') {
        // For GIF, we can't control quality as much
        sharpInstance = sharpInstance.gif({
          colours: Math.min(256, Math.max(2, Math.floor(256 * quality / 100))),
          effort: 7,
          dither: 1.0
        });
      } else if (format === 'tiff') {
        sharpInstance = sharpInstance.tiff({ 
          quality,
          compression: 'lzw'
        });
      } else if (format === 'svg') {
        // SVG conversion is limited, this will convert raster to SVG placeholder
        // For real production, a more advanced SVG converter would be needed
        throw new Error('SVG conversion not supported in this version');
      }
      
      // Process and save the image
      await sharpInstance.toFile(outputPath);
      
      // Get file stats and metadata for the processed image
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${format}`,
        fileSize: stats.size,
        width: newMetadata.width || 0,
        height: newMetadata.height || 0
      };
    } catch (error) {
      console.error('Error converting image:', error);
      throw new Error('Failed to convert image');
    }
  }
  
  /**
   * Apply watermark to an image
   */
  async applyWatermark(filePath: string, options: WatermarkOptions, watermarkImagePath?: string): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { type, text, fontFamily, fontSize, fontColor, opacity, position, padding } = options;
      const metadata = await sharp(filePath).metadata();
      const originalFormat = metadata.format || 'jpeg';
      
      const outputFileName = `watermarked-${Date.now()}.${originalFormat}`;
      const outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // Get base image
      const baseImage = sharp(filePath);
      
      if (type === 'text' && text) {
        // Create a text watermark using SVG
        const svgText = `
          <svg width="${metadata.width}" height="${metadata.height}">
            <style>
              .text {
                font-family: ${fontFamily || 'Arial'};
                font-size: ${fontSize || 24}px;
                fill: ${fontColor || 'white'};
                fill-opacity: ${opacity};
              }
            </style>
            <text 
              x="${this.getPositionX(position, metadata.width || 0, padding)}" 
              y="${this.getPositionY(position, metadata.height || 0, padding)}" 
              class="text">${text}</text>
          </svg>
        `;
        
        await baseImage.composite([
          { input: Buffer.from(svgText), gravity: 'center' }
        ]).toFile(outputPath);
      } else if (type === 'image' && watermarkImagePath) {
        // Prepare the watermark image (resize and set opacity)
        const watermarkBuffer = await sharp(watermarkImagePath)
          .resize(Math.floor((metadata.width || 0) * 0.2)) // Resize watermark to 20% of base image width
          .ensureAlpha()
          .composite([{
            input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: 'dest-in'
          }])
          .toBuffer();
        
        // Composite the watermark onto the base image
        await baseImage.composite([
          { 
            input: watermarkBuffer,
            gravity: this.getSharpGravity(position)
          }
        ]).toFile(outputPath);
      } else {
        throw new Error('Invalid watermark options');
      }
      
      // Get file stats and metadata for the processed image
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${originalFormat}`,
        fileSize: stats.size,
        width: newMetadata.width || 0,
        height: newMetadata.height || 0
      };
    } catch (error) {
      console.error('Error applying watermark:', error);
      throw new Error('Failed to apply watermark');
    }
  }
  
  /**
   * Enlarge image with better quality
   */
  async enlargeImage(filePath: string, options: EnlargeOptions): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { scale, mode, format } = options;
      const metadata = await sharp(filePath).metadata();
      
      // Calculate new dimensions
      const newWidth = Math.round((metadata.width || 0) * scale);
      const newHeight = Math.round((metadata.height || 0) * scale);
      
      // Determine output format and filename
      const outputFormat = format === 'jpg' ? 'jpeg' : format;
      const outputExtension = format === 'jpeg' ? 'jpg' : format;
      const outputFileName = `enlarged-${Date.now()}.${outputExtension}`;
      const outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // Create instance and resize
      let sharpInstance = sharp(filePath);
      
      // Apply different enlargement methods based on mode
      if (mode === 'highQuality') {
        // For high quality, use the best interpolation method available
        sharpInstance = sharpInstance.resize(newWidth, newHeight, {
          kernel: sharp.kernel.lanczos3,
          fit: 'fill',
          withoutEnlargement: false,
          withoutReduction: false
        });
      } else {
        // Standard enlargement
        sharpInstance = sharpInstance.resize(newWidth, newHeight);
      }
      
      // Apply format-specific settings
      if (outputFormat === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ 
          quality: 95,
          trellisQuantisation: true,
          overshootDeringing: true,
          optimizeScans: true,
          mozjpeg: true,
          chromaSubsampling: '4:4:4'
        });
      } else if (outputFormat === 'png') {
        sharpInstance = sharpInstance.png({ 
          quality: 9,
          adaptiveFiltering: true
        });
      } else if (outputFormat === 'webp') {
        sharpInstance = sharpInstance.webp({ 
          quality: 90,
          alphaQuality: 100,
          smartSubsample: true
        });
      }
      
      // Process and save the image
      await sharpInstance.toFile(outputPath);
      
      // Get file stats for size
      const stats = await fs.stat(outputPath);
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${outputFormat}`,
        fileSize: stats.size,
        width: newWidth,
        height: newHeight
      };
    } catch (error) {
      console.error('Error enlarging image:', error);
      throw new Error('Failed to enlarge image');
    }
  }
  
  /**
   * Rotate an image
   */
  async rotateImage(filePath: string, angle: number): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const metadata = await sharp(filePath).metadata();
      const originalFormat = metadata.format || 'jpeg';
      
      let outputFileName = `rotated-${Date.now()}.${originalFormat}`;
      let outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // Process and save the image
      await sharp(filePath)
        .rotate(angle)
        .toFile(outputPath);
      
      // Get file stats and metadata for the processed image
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${originalFormat}`,
        fileSize: stats.size,
        width: newMetadata.width || 0,
        height: newMetadata.height || 0
      };
    } catch (error) {
      console.error('Error rotating image:', error);
      throw new Error('Failed to rotate image');
    }
  }
  
  /**
   * Blur faces or areas in an image
   * Note: Face detection would require additional libraries like opencv or a cloud service
   * This is a simplified version that just blurs rectangles specified
   */
  async blurFaces(filePath: string, options: BlurFaceOptions, faceRectangles?: {x: number, y: number, width: number, height: number}[]): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    try {
      const { intensity, mode } = options;
      const metadata = await sharp(filePath).metadata();
      const originalFormat = metadata.format || 'jpeg';
      
      let outputFileName = `blurred-${Date.now()}.${originalFormat}`;
      let outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      if (!faceRectangles || faceRectangles.length === 0) {
        // For demo purposes, blur a rectangle in the center if no faces detected
        // In a real app, this would use a proper face detection library
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        const centerX = Math.floor(width / 2 - width * 0.15);
        const centerY = Math.floor(height / 2 - height * 0.15);
        faceRectangles = [{
          x: centerX,
          y: centerY,
          width: Math.floor(width * 0.3),
          height: Math.floor(height * 0.3)
        }];
      }
      
      // Create a mask for the areas to blur
      const maskSVG = `
        <svg width="${metadata.width}" height="${metadata.height}">
          <rect width="${metadata.width}" height="${metadata.height}" fill="black"/>
          ${faceRectangles.map(rect => 
            `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="white"/>`
          ).join('')}
        </svg>
      `;
      
      // Create the mask buffer
      const maskBuffer = await sharp(Buffer.from(maskSVG))
        .toColorspace('b-w')
        .toBuffer();
      
      // Create the blurred version of the image
      let blurred;
      if (mode === 'blur') {
        blurred = await sharp(filePath)
          .blur(intensity)
          .toBuffer();
      } else if (mode === 'pixelate') {
        // Pixelate by resizing down and up
        const pixelSize = Math.max(1, Math.ceil(intensity / 10));
        blurred = await sharp(filePath)
          .resize(
            Math.ceil((metadata.width || 0) / pixelSize),
            Math.ceil((metadata.height || 0) / pixelSize),
            { fit: 'fill' }
          )
          .resize(metadata.width, metadata.height, { fit: 'fill' })
          .toBuffer();
      } else { // blackout
        // Create a solid color buffer for blackout
        blurred = await sharp({
          create: {
            width: metadata.width || 0,
            height: metadata.height || 0,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
          }
        }).toBuffer();
      }
      
      // Alternative approach for face blurring without using mask in composite
      // First create the blurred version
      const overlayImage = await sharp(blurred)
        .resize(metadata.width, metadata.height, { fit: 'fill' })
        .toBuffer();
        
      // Then apply it directly as an overlay
      await sharp(filePath)
        .composite([{
          input: overlayImage,
          blend: 'over',
          gravity: 'center'
        }])
        .toFile(outputPath);
      
      // Get file stats for size
      const stats = await fs.stat(outputPath);
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: `image/${originalFormat}`,
        fileSize: stats.size,
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (error) {
      console.error('Error blurring faces:', error);
      throw new Error('Failed to blur faces');
    }
  }
  
  /**
   * Remove background from an image
   * Uses color analysis and transparency to identify and remove background
   */
  async removeBackground(filePath: string, options: {
    threshold?: number; // عتبة الحساسية اللونية (0-100)
    feather?: number;   // تنعيم الحواف (0-20)
    tolerance?: number; // تسامح الألوان (0-100)
  } = {}): Promise<ProcessedResult> {
    await this.ensureDirectories();
    
    const { 
      threshold = 30, 
      feather = 3,
      tolerance = 10
    } = options;
    
    try {
      const originalFormat = path.extname(filePath).substring(1);
      const outputFileName = `bg_removed_${Date.now()}.png`; // دائمًا PNG للحفاظ على الشفافية
      const outputPath = path.join(PROCESSED_DIR, outputFileName);
      
      // الحصول على معلومات الصورة
      const metadata = await sharp(filePath).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      
      // تحليل الصورة لاكتشاف الخلفية
      // نحتاج أولاً للحصول على البيانات الخام للصورة
      const { data, info } = await sharp(filePath)
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // استخراج ألوان الحدود للكشف عن الخلفية
      const edgeColors = this.extractEdgeColors(data, info.width, info.height, info.channels);
      
      // تحديد اللون الأكثر شيوعًا في الحدود (على الأرجح هو لون الخلفية)
      const backgroundColor = this.findDominantColor(edgeColors);
      
      // تحديد نطاق الألوان التي تعتبر جزءًا من الخلفية
      const colorRange = tolerance / 100;
      
      // إنشاء قناع للخلفية
      const mask = await this.createBackgroundMask(
        data, 
        info.width, 
        info.height, 
        info.channels, 
        backgroundColor, 
        colorRange
      );
      
      // تطبيق القناع على الصورة الأصلية
      await sharp(filePath)
        .ensureAlpha() // التأكد من وجود قناة ألفا
        .joinChannel(mask) // دمج القناع كقناة ألفا
        .blur(feather) // تنعيم الحواف
        .png() // حفظ بتنسيق PNG
        .toFile(outputPath);
      
      // الحصول على إحصائيات الملف
      const stats = await fs.stat(outputPath);
      const newMetadata = await sharp(outputPath).metadata();
      
      return {
        filePath: outputPath,
        fileName: outputFileName,
        fileType: 'image/png',
        fileSize: stats.size,
        width: newMetadata.width || width,
        height: newMetadata.height || height
      };
    } catch (error) {
      console.error('Error removing background:', error);
      
      // إذا فشلت الطريقة الأولى، نجرب طريقة بديلة
      try {
        return await this.removeBackgroundAlternative(filePath, options);
      } catch (fallbackError) {
        console.error('Alternative background removal also failed:', fallbackError);
        throw new Error('Failed to remove background');
      }
    }
  }
  
  /**
   * طريقة بديلة لإزالة الخلفية باستخدام كشف الحواف
   */
  private async removeBackgroundAlternative(filePath: string, options: any): Promise<ProcessedResult> {
    const { threshold = 30, feather = 3 } = options;
    
    const originalFormat = path.extname(filePath).substring(1);
    const outputFileName = `bg_removed_alt_${Date.now()}.png`;
    const outputPath = path.join(PROCESSED_DIR, outputFileName);
    
    // الحصول على معلومات الصورة
    const metadata = await sharp(filePath).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    
    // استخدام خوارزمية كشف الحواف لتحديد الكائن الأمامي
    await sharp(filePath)
      .ensureAlpha() // التأكد من وجود قناة ألفا
      .sharpen(2) // تحسين الحواف
      .blur(0.5) // تقليل الضجيج
      .toBuffer()
      .then(async (sharpened) => {
        // كشف الحواف
        const edges = await sharp(sharpened)
          .negate() // قلب الألوان
          .threshold(threshold) // تطبيق العتبة للحصول على الأسود والأبيض
          .blur(feather) // تنعيم
          .toBuffer();
          
        // تطبيق التمويه على خلفية الصورة
        await sharp(filePath)
          .ensureAlpha()
          .composite([{
            input: edges,
            blend: 'dest-in'
          }])
          .png()
          .toFile(outputPath);
      });
      
    // الحصول على إحصائيات الملف
    const stats = await fs.stat(outputPath);
    const newMetadata = await sharp(outputPath).metadata();
    
    return {
      filePath: outputPath,
      fileName: outputFileName,
      fileType: 'image/png',
      fileSize: stats.size,
      width: newMetadata.width || width,
      height: newMetadata.height || height
    };
  }
  
  /**
   * استخراج ألوان من حواف الصورة
   */
  private extractEdgeColors(data: Buffer, width: number, height: number, channels: number): Uint8Array {
    const edgeSize = Math.min(width, height, 30); // عدد البكسلات من الحواف التي سنستخدمها
    const edgePixels = new Uint8Array(edgeSize * 4 * 4 * 3); // أعلى، أسفل، يسار، يمين
    
    let pixelIdx = 0;
    const step = Math.max(1, Math.floor(width / edgeSize));
    
    // الحافة العلوية
    for (let x = 0; x < width && pixelIdx < edgePixels.length; x += step) {
      const idx = (x + width * 0) * channels;
      edgePixels[pixelIdx++] = data[idx];     // R
      edgePixels[pixelIdx++] = data[idx + 1]; // G
      edgePixels[pixelIdx++] = data[idx + 2]; // B
    }
    
    // الحافة السفلية
    for (let x = 0; x < width && pixelIdx < edgePixels.length; x += step) {
      const idx = (x + width * (height - 1)) * channels;
      edgePixels[pixelIdx++] = data[idx];     // R
      edgePixels[pixelIdx++] = data[idx + 1]; // G
      edgePixels[pixelIdx++] = data[idx + 2]; // B
    }
    
    // الحافة اليسرى
    for (let y = 0; y < height && pixelIdx < edgePixels.length; y += step) {
      const idx = (0 + width * y) * channels;
      edgePixels[pixelIdx++] = data[idx];     // R
      edgePixels[pixelIdx++] = data[idx + 1]; // G
      edgePixels[pixelIdx++] = data[idx + 2]; // B
    }
    
    // الحافة اليمنى
    for (let y = 0; y < height && pixelIdx < edgePixels.length; y += step) {
      const idx = ((width - 1) + width * y) * channels;
      edgePixels[pixelIdx++] = data[idx];     // R
      edgePixels[pixelIdx++] = data[idx + 1]; // G
      edgePixels[pixelIdx++] = data[idx + 2]; // B
    }
    
    return edgePixels.slice(0, pixelIdx);
  }
  
  /**
   * العثور على اللون الغالب في مجموعة من البكسلات
   */
  private findDominantColor(pixels: Uint8Array): [number, number, number] {
    const colorBins: {[key: string]: number} = {};
    
    // تجميع الألوان في فئات للتعامل مع التباينات الطفيفة
    for (let i = 0; i < pixels.length; i += 3) {
      // تقريب القيم للتقليل من التباينات الطفيفة
      const r = Math.floor(pixels[i] / 10) * 10;
      const g = Math.floor(pixels[i + 1] / 10) * 10;
      const b = Math.floor(pixels[i + 2] / 10) * 10;
      
      const colorKey = `${r},${g},${b}`;
      colorBins[colorKey] = (colorBins[colorKey] || 0) + 1;
    }
    
    // البحث عن اللون الأكثر تكرارًا
    let maxCount = 0;
    let dominantColor: [number, number, number] = [255, 255, 255]; // افتراضيًا أبيض
    
    for (const colorKey in colorBins) {
      if (colorBins[colorKey] > maxCount) {
        maxCount = colorBins[colorKey];
        const [r, g, b] = colorKey.split(',').map(Number);
        dominantColor = [r, g, b];
      }
    }
    
    return dominantColor;
  }
  
  /**
   * إنشاء قناع للخلفية استنادًا إلى لون معين ونطاق تسامح
   */
  private async createBackgroundMask(
    data: Buffer, 
    width: number, 
    height: number, 
    channels: number,
    bgColor: [number, number, number],
    tolerance: number
  ): Promise<Buffer> {
    // إنشاء مصفوفة للقناع (8 بت لكل بكسل)
    const maskData = new Uint8Array(width * height);
    const [bgR, bgG, bgB] = bgColor;
    
    // تعيين قيمة ألفا لكل بكسل
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x);
        const pixelIdx = i * channels;
        
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];
        
        // حساب المسافة اللونية
        const distance = this.colorDistance([r, g, b], [bgR, bgG, bgB]);
        
        // تحديد شفافية البكسل
        if (distance < tolerance * 255) {
          // هذا البكسل جزء من الخلفية - نجعله شفافًا
          maskData[i] = 0;
        } else {
          // هذا البكسل جزء من المقدمة - نبقيه معتمًا
          maskData[i] = 255;
        }
      }
    }
    
    // تحويل المصفوفة إلى صورة قناع
    return await sharp(maskData, {
      raw: {
        width,
        height,
        channels: 1
      }
    }).toBuffer();
  }
  
  /**
   * حساب المسافة بين لونين
   */
  private colorDistance(color1: [number, number, number], color2: [number, number, number]): number {
    // استخدام مسافة اقليدية بسيطة
    const rDiff = color1[0] - color2[0];
    const gDiff = color1[1] - color2[1];
    const bDiff = color1[2] - color2[2];
    
    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  }
  
  /**
   * Helper functions for positioning
   */
  private getPositionX(position: string, width: number, padding: number): number {
    if (position.includes('left')) {
      return padding;
    } else if (position.includes('right')) {
      return width - padding;
    } else {
      return width / 2;
    }
  }
  
  private getPositionY(position: string, height: number, padding: number): number {
    if (position.includes('top')) {
      return padding + 20; // Add font size offset
    } else if (position.includes('bottom')) {
      return height - padding;
    } else {
      return height / 2;
    }
  }
  
  private getSharpGravity(position: string): string {
    // Return gravity as a string that matches Sharp's accepted values
    switch (position) {
      case 'topLeft': return 'northwest';
      case 'topRight': return 'northeast';
      case 'bottomLeft': return 'southwest';
      case 'bottomRight': return 'southeast';
      case 'center': return 'center';
      default: return 'southeast';
    }
  }
}

export const imageProcessor = new ImageProcessor();
