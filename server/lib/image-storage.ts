import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage';
import { dirname } from 'path';

// Fix for ESM modules that don't have __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

class ImageStorage {
  /**
   * Initialize storage directories
   */
  async initialize() {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      
      // Start a cleanup job to run every hour
      setInterval(this.cleanupExpiredFiles.bind(this), 1000 * 60 * 60); // Every hour
    } catch (error) {
      console.error('Failed to initialize image storage:', error);
    }
  }
  
  /**
   * Save an uploaded file to disk
   */
  async saveUploadedFile(
    file: Express.Multer.File, 
    userId?: number
  ): Promise<{ 
    filePath: string, 
    fileName: string, 
    fileId: number 
  }> {
    try {
      // Ensure uploads directory exists
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      
      console.log('Saving uploaded file:', {
        fileName: file.originalname,
        tempPath: file.path,
        size: file.size,
        type: file.mimetype
      });
      
      // Generate a unique filename to avoid collisions
      const fileExt = path.extname(file.originalname) || this.getExtensionFromMimetype(file.mimetype);
      const fileName = `${Date.now()}-${uuidv4()}${fileExt}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      
      // Check if temp file exists before trying to read it
      try {
        await fs.access(file.path);
      } catch (err) {
        console.error(`Temp file doesn't exist: ${file.path}`, err);
        throw new Error(`Temporary file doesn't exist or can't be accessed: ${file.path}`);
      }
      
      // Move the file from the temp upload location to our storage
      try {
        const fileData = await fs.readFile(file.path);
        await fs.writeFile(filePath, fileData);
        console.log(`File successfully written to: ${filePath}`);
      } catch (writeErr) {
        console.error('Error reading/writing file:', writeErr);
        throw writeErr;
      }
      
      // Remove the temp file
      try {
        await fs.unlink(file.path);
        console.log(`Temp file removed: ${file.path}`);
      } catch (unlinkErr) {
        console.warn(`Could not remove temp file (${file.path}):`, unlinkErr);
        // Continue even if we couldn't delete the temp file
      }
      
      // Set expiration date to 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      // Store file metadata in our database
      const savedImage = await storage.createImage({
        userId,
        originalName: file.originalname,
        fileName,
        filePath,
        fileSize: file.size,
        fileType: file.mimetype,
        width: 0, // Will be filled later
        height: 0, // Will be filled later
        expiresAt,
        processed: false
      });
      
      return {
        filePath,
        fileName,
        fileId: savedImage.id
      };
    } catch (error) {
      console.error('Error saving uploaded file:', error);
      throw new Error(`Failed to save the uploaded file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get file extension from mimetype when needed
   */
  private getExtensionFromMimetype(mimetype: string): string {
    const mimetypeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/webp': '.webp',
      'image/avif': '.avif',
      'image/heic': '.heic',
      'image/heif': '.heif'
    };
    
    return mimetypeMap[mimetype] || '.jpg'; // Default to jpg if unknown
  }
  
  /**
   * Delete a file from disk
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
  
  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles() {
    try {
      const deletedCount = await storage.deleteExpiredImages();
      console.log(`Cleaned up ${deletedCount} expired files`);
    } catch (error) {
      console.error('Error in cleanup job:', error);
    }
  }
  
  /**
   * Update image metadata with dimensions
   */
  async updateImageDimensions(imageId: number, width: number, height: number) {
    const image = await storage.getImage(imageId);
    if (image) {
      image.width = width;
      image.height = height;
      image.processed = true;
    }
  }
}

export const imageStorage = new ImageStorage();
// Initialize the storage when the server starts
imageStorage.initialize().catch(console.error);
