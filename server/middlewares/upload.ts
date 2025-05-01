import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { NextFunction, Request, Response } from 'express';
import { log } from '../vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const TEMP_DIR = path.join(__dirname, '../../temp');

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(path.join(UPLOADS_DIR, 'processed'), { recursive: true });
    log('Upload directories created successfully', 'multer');
  } catch (error) {
    log(`Error creating upload directories: ${error}`, 'multer');
  }
}

// Initialize directories
ensureDirectories();

// Configure multer storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
      // Log upload attempt
      log(`Upload attempt: ${file.originalname}, mimetype: ${file.mimetype}`, 'multer');
      cb(null, TEMP_DIR);
    } catch (error) {
      log(`Error in multer destination: ${error}`, 'multer');
      cb(error as Error, TEMP_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    const filename = `${uniqueSuffix}${path.extname(file.originalname)}`;
    // Store original filename in file object for later reference
    file.originalname = file.originalname;
    cb(null, filename);
  }
});

// File filter to only allow images (including AVIF and HEIC)
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Expanded list of supported image formats
  const supportedMimeTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/webp', 
    'image/svg+xml',
    'image/avif',
    'image/heic',
    'image/heif'
  ];
  
  // Log the mimetype of the uploaded file
  log(`File filter checking: ${file.originalname}, mimetype: ${file.mimetype}`, 'multer');
  
  if (supportedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
    log(`File accepted: ${file.originalname}`, 'multer');
    cb(null, true);
  } else {
    log(`File rejected: ${file.originalname}, unsupported mimetype: ${file.mimetype}`, 'multer');
    cb(new Error(`تنسيق الملف غير مدعوم. التنسيقات المدعومة: JPEG, PNG, GIF, WebP, SVG, AVIF, HEIC`));
  }
};

// Configure the multer middleware with improved error handling
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max file size (increased)
  }
});

// Enhanced error handling middleware
export const handleUploadErrors = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log all errors for debugging
  if (err) {
    log(`Upload error: ${err.message || 'Unknown error'}`, 'multer');
  }
  
  // Check if any files were uploaded successfully (partial success)
  const successfulFiles = req.files;
  
  if (err instanceof multer.MulterError) {
    // Handle specific Multer errors
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'حجم الملف كبير جدًا. الحد الأقصى هو 20 ميجابايت',
          partialSuccess: successfulFiles ? true : false,
          files: successfulFiles
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'تم تجاوز الحد الأقصى لعدد الملفات',
          partialSuccess: successfulFiles ? true : false,
          files: successfulFiles
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'اسم الحقل غير صحيح. استخدم "files" كاسم للحقل',
          partialSuccess: successfulFiles ? true : false,
          files: successfulFiles
        });
      default:
        return res.status(400).json({
          success: false,
          message: `خطأ في تحميل الملفات: ${err.code}`,
          partialSuccess: successfulFiles ? true : false,
          files: successfulFiles
        });
    }
  } else if (err) {
    // Handle generic errors
    return res.status(400).json({
      success: false,
      message: err.message || 'حدث خطأ أثناء رفع الملف',
      partialSuccess: successfulFiles ? true : false,
      files: successfulFiles
    });
  }
  
  // No error, continue
  next();
};
