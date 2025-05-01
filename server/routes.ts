import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { upload, handleUploadErrors } from "./middlewares/upload";
import { imageProcessor } from "./lib/image-processor";
import { imageStorage } from "./lib/image-storage";
import fs from "fs/promises";
import path from "path";
import { 
  compressOptionsSchema, 
  resizeOptionsSchema, 
  cropOptionsSchema, 
  convertOptionsSchema, 
  watermarkOptionsSchema, 
  enlargeOptionsSchema, 
  blurFaceOptionsSchema
} from "@shared/schema";
import { setupAuth } from "./auth";
import { log } from "./vite";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Fix for ESM modules that don't have __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import API related middleware
import { apiKeyAuth, subscriptionCheck } from './middlewares/api-auth';
import { generateApiDocumentation } from './lib/api-documentation';
import { randomBytes } from 'crypto';

export async function registerRoutes(app: Express): Promise<Server> {
  // API documentation endpoint
  app.get('/api/documentation', (req: Request, res: Response) => {
    const documentation = generateApiDocumentation();
    res.json(documentation);
  });
  const httpServer = createServer(app);

  // Set up authentication (includes session setup)
  setupAuth(app);

  // Health check route
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // API endpoints for image processing
  
  // Upload endpoint that handles single or multiple files
  app.post("/api/upload", upload.array("files", 10), handleUploadErrors, async (req: Request, res: Response) => {
    try {
      // Enhanced detailed logging for debugging upload issues
      console.log("Upload endpoint called:", {
        hasFiles: req.files !== undefined,
        fileCount: req.files ? (Array.isArray(req.files) ? req.files.length : 'not array') : 0,
        requestContentType: req.get('content-type')
      });
      
      if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
        console.log('No files provided in request');
        return res.status(400).json({
          success: false,
          message: "لم يتم توفير أي ملفات للرفع"
        });
      }

      // Ensure files is an array
      const files = Array.isArray(req.files) ? req.files : [req.files];
      log(`Processing ${files.length} uploaded files`, 'upload');
      
      // Use authenticated user ID if available, or default to null (guest upload)
      const userId = req.isAuthenticated() ? req.user.id : null;
      
      const results = [];
      
      for (const file of files) {
        try {
          log(`Processing file: ${file.originalname}, mimetype: ${file.mimetype}, size: ${file.size} bytes`, 'upload');
          
          // Manually ensure directories exist (failsafe)
          await fs.mkdir(path.join(__dirname, '../uploads'), { recursive: true });
          await fs.mkdir(path.join(__dirname, '../uploads/processed'), { recursive: true });
          await fs.mkdir(path.join(__dirname, '../temp'), { recursive: true });
          
          // Save the uploaded file
          const savedFile = await imageStorage.saveUploadedFile(file, userId);
          log(`File saved at: ${savedFile.filePath}`, 'upload');
          
          // Get image dimensions if possible
          let width = 0;
          let height = 0;
          try {
            const info = await imageProcessor.getImageInfo(savedFile.filePath);
            width = info.width || 0;
            height = info.height || 0;
            await imageStorage.updateImageDimensions(savedFile.fileId, width, height);
            log(`Image dimensions: ${width}x${height}`, 'upload');
          } catch (dimensionError) {
            log(`Error getting image dimensions: ${dimensionError}`, 'upload');
            // Continue without dimensions
          }
          
          // Record tool usage analytics
          try {
            await storage.incrementToolUsage("upload");
            log(`Analytics recorded for upload`, 'upload');
          } catch (analyticsError) {
            log(`Failed to record analytics: ${analyticsError}`, 'upload');
            // Continue without analytics
          }
          
          results.push({
            id: savedFile.fileId,
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            width,
            height
          });
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
          log(`Error processing file ${file.originalname}: ${fileError}`, 'upload');
          // Continue with next file
        }
      }
      
      if (results.length === 0) {
        return res.status(500).json({
          success: false,
          message: "فشل معالجة جميع الملفات المرفوعة"
        });
      }

      log(`Successfully processed ${results.length} files`, 'upload');
      res.json({
        success: true,
        message: `تم رفع ${results.length} ملف/ملفات بنجاح`,
        data: results
      });
    } catch (error) {
      console.error("Error in upload handler:", error);
      log(`Error in upload handler: ${error}`, 'upload');
      res.status(500).json({
        success: false,
        message: `حدث خطأ أثناء معالجة الملفات المرفوعة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
      });
    }
  });

  // Retrieve image by ID
  app.get("/api/images/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Serve the image file
      res.sendFile(image.filePath);
    } catch (error) {
      console.error("Error retrieving image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء استرجاع الصورة"
      });
    }
  });

  // Serve processed image by ID
  app.get("/api/processed/:id", async (req: Request, res: Response) => {
    try {
      const processedId = parseInt(req.params.id);
      if (isNaN(processedId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      const processedImage = await storage.getProcessedImage(processedId);
      if (!processedImage) {
        return res.status(404).json({
          success: false,
          message: "الصورة المعالجة غير موجودة"
        });
      }

      // Serve the processed image file
      res.sendFile(processedImage.filePath);
    } catch (error) {
      console.error("Error retrieving processed image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء استرجاع الصورة المعالجة"
      });
    }
  });

  // Compress image endpoint
  app.post("/api/compress/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = compressOptionsSchema.safeParse(req.body);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات الضغط غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("compress");

      // Process the image
      const result = await imageProcessor.compressImage(
        image.filePath,
        parsedOptions.data
      );

      // Calculate compression ratio
      const compressionRatio = ((image.fileSize - result.fileSize) / image.fileSize) * 100;

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "compress",
        processingOptions: parsedOptions.data,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم ضغط الصورة بنجاح",
        data: {
          id: savedProcessedImage.id,
          originalSize: image.fileSize,
          compressedSize: result.fileSize,
          compressionRatio: compressionRatio.toFixed(2),
          width: result.width,
          height: result.height
        }
      });
    } catch (error) {
      console.error("Error compressing image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء ضغط الصورة"
      });
    }
  });

  // Resize image endpoint
  app.post("/api/resize/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = resizeOptionsSchema.safeParse(req.body);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات تغيير الحجم غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("resize");

      // Process the image
      const result = await imageProcessor.resizeImage(
        image.filePath,
        parsedOptions.data
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "resize",
        processingOptions: parsedOptions.data,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم تغيير حجم الصورة بنجاح",
        data: {
          id: savedProcessedImage.id,
          originalWidth: image.width,
          originalHeight: image.height,
          newWidth: result.width,
          newHeight: result.height,
          fileSize: result.fileSize
        }
      });
    } catch (error) {
      console.error("Error resizing image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تغيير حجم الصورة"
      });
    }
  });

  // Crop image endpoint
  app.post("/api/crop/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = cropOptionsSchema.safeParse(req.body);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات القص غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("crop");

      // Process the image
      const result = await imageProcessor.cropImage(
        image.filePath,
        parsedOptions.data
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "crop",
        processingOptions: parsedOptions.data,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم قص الصورة بنجاح",
        data: {
          id: savedProcessedImage.id,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize
        }
      });
    } catch (error) {
      console.error("Error cropping image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء قص الصورة"
      });
    }
  });

  // Convert image endpoint
  app.post("/api/convert/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = convertOptionsSchema.safeParse(req.body);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات التحويل غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("convert");

      // Process the image
      const result = await imageProcessor.convertImage(
        image.filePath,
        parsedOptions.data
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "convert",
        processingOptions: parsedOptions.data,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم تحويل الصورة بنجاح",
        data: {
          id: savedProcessedImage.id,
          format: parsedOptions.data.format,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize
        }
      });
    } catch (error) {
      console.error("Error converting image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحويل الصورة"
      });
    }
  });

  // Apply watermark endpoint
  app.post("/api/watermark/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = watermarkOptionsSchema.safeParse(req.body);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات العلامة المائية غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("watermark");

      // Get watermark image if provided
      let watermarkImagePath: string | undefined;
      if (parsedOptions.data.type === "image" && parsedOptions.data.imageId) {
        const watermarkImage = await storage.getImage(parsedOptions.data.imageId);
        if (watermarkImage) {
          watermarkImagePath = watermarkImage.filePath;
        }
      }

      // Process the image
      const result = await imageProcessor.applyWatermark(
        image.filePath,
        parsedOptions.data,
        watermarkImagePath
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "watermark",
        processingOptions: parsedOptions.data,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم إضافة العلامة المائية بنجاح",
        data: {
          id: savedProcessedImage.id,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize
        }
      });
    } catch (error) {
      console.error("Error applying watermark:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء إضافة العلامة المائية"
      });
    }
  });

  // Enlarge image endpoint
  app.post("/api/enlarge/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = enlargeOptionsSchema.safeParse(req.body);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات التكبير غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("enlarge");

      // Process the image
      const result = await imageProcessor.enlargeImage(
        image.filePath,
        parsedOptions.data
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "enlarge",
        processingOptions: parsedOptions.data,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم تكبير الصورة بنجاح",
        data: {
          id: savedProcessedImage.id,
          originalWidth: image.width,
          originalHeight: image.height,
          newWidth: result.width,
          newHeight: result.height,
          fileSize: result.fileSize,
          scale: parsedOptions.data.scale
        }
      });
    } catch (error) {
      console.error("Error enlarging image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تكبير الصورة"
      });
    }
  });

  // Rotate image endpoint
  app.post("/api/rotate/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate angle
      const angle = parseInt(req.body.angle);
      if (isNaN(angle)) {
        return res.status(400).json({
          success: false,
          message: "زاوية الدوران غير صالحة"
        });
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("rotate");

      // Process the image
      const result = await imageProcessor.rotateImage(
        image.filePath,
        angle
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "rotate",
        processingOptions: { angle },
        expiresAt
      });

      res.json({
        success: true,
        message: "تم تدوير الصورة بنجاح",
        data: {
          id: savedProcessedImage.id,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize,
          angle
        }
      });
    } catch (error) {
      console.error("Error rotating image:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تدوير الصورة"
      });
    }
  });

  // Blur faces endpoint
  app.post("/api/blur-face/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Validate options
      const parsedOptions = blurFaceOptionsSchema.safeParse(req.body.options);
      if (!parsedOptions.success) {
        return res.status(400).json({
          success: false,
          message: "خيارات طمس الوجه غير صالحة",
          errors: parsedOptions.error.format()
        });
      }

      // Get face rectangles
      let faceRectangles = req.body.faces;
      if (!Array.isArray(faceRectangles)) {
        faceRectangles = [];
      }

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("blur-face");

      // Process the image
      const result = await imageProcessor.blurFaces(
        image.filePath,
        parsedOptions.data,
        faceRectangles
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "blur-face",
        processingOptions: {
          ...parsedOptions.data,
          faces: faceRectangles
        },
        expiresAt
      });

      res.json({
        success: true,
        message: "تم طمس الوجوه بنجاح",
        data: {
          id: savedProcessedImage.id,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize,
          blurredAreas: faceRectangles.length
        }
      });
    } catch (error) {
      console.error("Error blurring faces:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء طمس الوجوه"
      });
    }
  });
  
  // Remove background endpoint
  app.post("/api/remove-bg/:id", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({
          success: false,
          message: "معرف الصورة غير صالح"
        });
      }

      // Parse options
      const options = {
        threshold: req.body.threshold || 30,
        feather: req.body.feather || 3,
        tolerance: req.body.tolerance || 10
      };

      const image = await storage.getImage(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "الصورة غير موجودة"
        });
      }

      // Track tool usage
      await storage.incrementToolUsage("remove-bg");

      // Process the image
      const result = await imageProcessor.removeBackground(
        image.filePath,
        options
      );

      // Save the processed image metadata
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const savedProcessedImage = await storage.createProcessedImage({
        originalImageId: imageId,
        userId: image.userId,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        fileType: result.fileType,
        width: result.width,
        height: result.height,
        processingType: "remove-bg",
        processingOptions: options,
        expiresAt
      });

      res.json({
        success: true,
        message: "تم إزالة الخلفية بنجاح",
        data: {
          id: savedProcessedImage.id,
          width: result.width,
          height: result.height,
          fileSize: result.fileSize
        }
      });
    } catch (error) {
      console.error("Error removing background:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء إزالة الخلفية"
      });
    }
  });

  // Get stats endpoint
  app.get("/api/stats", async (_req: Request, res: Response) => {
    try {
      const allStats = await storage.getAllStats();
      
      // Group stats by tool
      const toolStats: Record<string, any> = {};
      
      allStats.forEach(stat => {
        if (!toolStats[stat.toolName]) {
          toolStats[stat.toolName] = {
            totalUsage: 0,
            dailyStats: []
          };
        }
        
        toolStats[stat.toolName].totalUsage += stat.usageCount;
        toolStats[stat.toolName].dailyStats.push({
          date: stat.date.toISOString().split('T')[0],
          count: stat.usageCount
        });
      });
      
      res.json({
        success: true,
        data: toolStats
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء جلب الإحصائيات"
      });
    }
  });

  // ===== Subscription related endpoints =====
  
  // Demo subscription endpoint - for testing only (when Stripe is not configured)
  app.post("/api/demo-subscribe", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "يجب تسجيل الدخول أولاً"
        });
      }

      const { planId } = req.body;
      if (!planId || !['free', 'pro', 'business'].includes(planId)) {
        return res.status(400).json({
          success: false,
          message: "نوع الاشتراك غير صالح"
        });
      }

      // Set subscription expiry date to 30 days from now for paid plans
      let subscriptionExpiresAt = null;
      if (planId !== 'free') {
        subscriptionExpiresAt = new Date();
        subscriptionExpiresAt.setDate(subscriptionExpiresAt.getDate() + 30);
      }

      // Update user's subscription in database (simplified for demo)
      // In a real app, you'd update the user record with proper subscription data
      console.log(`Updating user ${req.user.id} subscription to ${planId}`);
      
      // Return success response for demo purposes
      res.json({
        success: true,
        message: "تم تحديث الاشتراك بنجاح",
        data: {
          subscription: planId,
          expiresAt: subscriptionExpiresAt,
          dailyUsageLimit: planId === 'free' ? 10 : planId === 'pro' ? 100 : 1000,
          maxFileSize: planId === 'free' ? 10 * 1024 * 1024 : planId === 'pro' ? 50 * 1024 * 1024 : 150 * 1024 * 1024
        }
      });
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحديث الاشتراك"
      });
    }
  });

  // Cancel subscription endpoint
  app.post("/api/cancel-subscription", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "يجب تسجيل الدخول أولاً"
        });
      }

      // Check if user has a stripe subscription that needs to be canceled
      // This is a placeholder - in a real implementation, you would cancel in Stripe
      console.log(`Canceling subscription for user ${req.user.id}`);

      // Return success response
      res.json({
        success: true,
        message: "تم إلغاء الاشتراك بنجاح",
        data: {
          subscription: 'free'
        }
      });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء إلغاء الاشتراك"
      });
    }
  });

  // Create Stripe payment intent (for actual payment integration)
  app.post("/api/create-subscription", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "يجب تسجيل الدخول أولاً"
        });
      }

      // Check if Stripe is configured
      if (!process.env.STRIPE_SECRET_KEY || !process.env.VITE_STRIPE_PUBLIC_KEY) {
        return res.status(400).json({
          success: false,
          message: "بوابة الدفع غير مكونة. يرجى استخدام النسخة التجريبية للاختبار."
        });
      }

      const { planId } = req.body;
      if (!planId || !['pro', 'business'].includes(planId)) {
        return res.status(400).json({
          success: false,
          message: "نوع الاشتراك غير صالح"
        });
      }

      // In a real implementation, you would:
      // 1. Create a customer in Stripe if they don't exist
      // 2. Create a subscription or setup a payment intent
      // 3. Return the client secret to the frontend

      // Placeholder response for testing
      res.json({
        success: true,
        clientSecret: "demo_secret_" + Date.now(), // Would be a real secret from Stripe
        redirectUrl: "/subscriptions?success=pending", // For demo only
        message: "تمت إحالتك إلى صفحة الدفع"
      });
    } catch (error) {
      console.error("Error creating subscription payment:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء إعداد الدفع"
      });
    }
  });

  // Stats endpoint for admin dashboard
  app.get("/api/stats", async (req: Request, res: Response) => {
    // Check if user is logged in and is an admin
    if (!req.isAuthenticated() || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "غير مصرح بالوصول",
        error: "forbidden"
      });
    }
    
    try {
      // Get stats from storage
      const stats = await storage.getAllStats();
      
      // If no stats are available, generate some demo stats for testing
      if (!stats || stats.length === 0) {
        const demoStats = [
          { id: 1, date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), toolName: 'compress', usageCount: 32 },
          { id: 2, date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), toolName: 'resize', usageCount: 24 },
          { id: 3, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), toolName: 'compress', usageCount: 28 },
          { id: 4, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), toolName: 'crop', usageCount: 15 },
          { id: 5, date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), toolName: 'watermark', usageCount: 10 },
          { id: 6, date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), toolName: 'convert', usageCount: 18 },
          { id: 7, date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), toolName: 'enlarge', usageCount: 12 },
          { id: 8, date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), toolName: 'compress', usageCount: 35 },
          { id: 9, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), toolName: 'resize', usageCount: 29 },
          { id: 10, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), toolName: 'convert', usageCount: 22 },
          { id: 11, date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), toolName: 'compress', usageCount: 41 },
          { id: 12, date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), toolName: 'watermark', usageCount: 14 },
        ];
        
        res.json({
          success: true,
          data: demoStats
        });
        return;
      }
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error retrieving stats:', error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء استرجاع الإحصائيات",
        error: "server_error"
      });
    }
  });
  
  // Get subscription plans endpoint
  // API key management endpoints
  app.get('/api/user/api-keys', async (req: Request, res: Response) => {
    // Check if user is logged in
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'يجب تسجيل الدخول للوصول إلى مفاتيح API',
        error: 'unauthorized'
      });
    }

    try {
      const userId = req.user.id;
      const apiKeys = await storage.getApiKeysByUser(userId);
      
      // Mask key values for security, only showing the first and last few characters
      const maskedKeys = apiKeys.map(key => ({
        ...key,
        keyValue: key.keyValue.substring(0, 4) + '...' + key.keyValue.substring(key.keyValue.length - 4)
      }));
      
      res.json({
        success: true,
        data: maskedKeys
      });
    } catch (error) {
      console.error('Error retrieving API keys:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء استرجاع مفاتيح API'
      });
    }
  });
  
  // Create a new API key
  app.post('/api/user/api-keys', async (req: Request, res: Response) => {
    // Check if user is logged in
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'يجب تسجيل الدخول لإنشاء مفاتيح API',
        error: 'unauthorized'
      });
    }
    
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'يجب توفير اسم للمفتاح',
          error: 'invalid_request'
        });
      }
      
      // Generate a secure random API key
      const keyValue = 'api_' + randomBytes(24).toString('hex');
      
      // Save the API key
      const apiKey = await storage.createApiKey({
        name,
        userId: req.user.id,
        keyValue,
        active: true,
        lastUsed: null
      });
      
      res.status(201).json({
        success: true,
        message: 'تم إنشاء مفتاح API بنجاح',
        data: apiKey
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء إنشاء مفتاح API'
      });
    }
  });
  
  // Delete an API key
  app.delete('/api/user/api-keys/:id', async (req: Request, res: Response) => {
    // Check if user is logged in
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'يجب تسجيل الدخول لحذف مفاتيح API',
        error: 'unauthorized'
      });
    }
    
    try {
      const keyId = parseInt(req.params.id);
      
      if (isNaN(keyId)) {
        return res.status(400).json({
          success: false,
          message: 'معرف المفتاح غير صالح',
          error: 'invalid_request'
        });
      }
      
      // Check if this key belongs to the user
      const keys = await storage.getApiKeysByUser(req.user.id);
      const keyExists = keys.some(k => k.id === keyId);
      
      if (!keyExists) {
        return res.status(404).json({
          success: false,
          message: 'مفتاح API غير موجود أو لا يملكه المستخدم الحالي',
          error: 'not_found'
        });
      }
      
      // Delete the key
      await storage.deleteApiKey(keyId);
      
      res.json({
        success: true,
        message: 'تم حذف مفتاح API بنجاح'
      });
    } catch (error) {
      console.error('Error deleting API key:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء حذف مفتاح API'
      });
    }
  });
  
  app.get("/api/subscription-plans", async (_req: Request, res: Response) => {
    try {
      const plans = [
        {
          id: "free",
          name: "الباقة المجانية",
          price: 0,
          currency: "USD",
          interval: "month",
          features: [
            "معالجة ١٠ صور يومياً",
            "حجم أقصى للملف 10 ميجابايت",
            "الوصول لجميع الأدوات الأساسية",
          ],
          limitations: [
            "بدون دعم للواجهة البرمجية API",
            "لا تشمل أدوات متقدمة مثل إزالة الخلفية"
          ]
        },
        {
          id: "pro",
          name: "الباقة المتقدمة",
          price: 9.99,
          currency: "USD",
          interval: "month",
          features: [
            "معالجة غير محدودة للصور",
            "حجم أقصى للملف 50 ميجابايت",
            "الوصول لجميع الأدوات المتقدمة",
            "معالجة دفعية للصور"
          ],
          limitations: [
            "وصول محدود للواجهة البرمجية"
          ]
        },
        {
          id: "business",
          name: "باقة الأعمال",
          price: 19.99,
          currency: "USD",
          interval: "month",
          features: [
            "جميع مزايا الباقة المتقدمة",
            "حجم أقصى للملف 150 ميجابايت",
            "وصول API غير محدود",
            "أولوية المعالجة السريعة"
          ],
          limitations: []
        }
      ];

      res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء استرجاع خطط الاشتراكات"
      });
    }
  });

  // ==== Site Settings API Endpoints ====
  
  // Get all site settings
  app.get('/api/site-settings', async (req: Request, res: Response) => {
    try {
      // Only admin users can view all settings
      if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(401).json({
          success: false,
          message: "غير مصرح بالوصول إلى إعدادات الموقع"
        });
      }
      
      const settings = await storage.getAllSiteSettings();
      
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('Error retrieving site settings:', error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء استرجاع إعدادات الموقع"
      });
    }
  });

  // Get a specific site setting by key
  app.get('/api/site-settings/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      
      // Public settings can be retrieved by anyone, private only by admins
      const setting = await storage.getSiteSetting(key);
      
      if (!setting) {
        return res.status(404).json({
          success: false,
          message: "الإعداد غير موجود"
        });
      }
      
      // Check if this is a private setting that requires admin access
      if (setting.category === 'private' && (!req.isAuthenticated() || req.user.role !== 'admin')) {
        return res.status(401).json({
          success: false,
          message: "غير مصرح بالوصول إلى هذا الإعداد"
        });
      }
      
      res.json({
        success: true,
        data: setting
      });
    } catch (error) {
      console.error('Error retrieving site setting:', error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء استرجاع إعداد الموقع"
      });
    }
  });

  // Create a new site setting
  app.post('/api/site-settings', async (req: Request, res: Response) => {
    try {
      // Only admin users can create settings
      if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(401).json({
          success: false,
          message: "غير مصرح بإنشاء إعدادات للموقع"
        });
      }
      
      const { key, value, category, description } = req.body;
      
      if (!key) {
        return res.status(400).json({
          success: false,
          message: "مفتاح الإعداد مطلوب"
        });
      }
      
      // Check if setting already exists
      const existingSetting = await storage.getSiteSetting(key);
      if (existingSetting) {
        return res.status(400).json({
          success: false,
          message: "الإعداد موجود بالفعل، استخدم طلب التحديث بدلاً من ذلك"
        });
      }
      
      const newSetting = await storage.createSiteSetting({
        key,
        value,
        category: category || 'general',
        description,
        updatedBy: req.user.id
      });
      
      res.status(201).json({
        success: true,
        data: newSetting,
        message: "تم إنشاء إعداد جديد بنجاح"
      });
    } catch (error) {
      console.error('Error creating site setting:', error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء إنشاء إعداد الموقع"
      });
    }
  });

  // Update an existing site setting
  app.put('/api/site-settings/:key', async (req: Request, res: Response) => {
    try {
      // Only admin users can update settings
      if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(401).json({
          success: false,
          message: "غير مصرح بتحديث إعدادات الموقع"
        });
      }
      
      const { key } = req.params;
      const { value } = req.body;
      
      // Check if setting exists
      const existingSetting = await storage.getSiteSetting(key);
      if (!existingSetting) {
        return res.status(404).json({
          success: false,
          message: "الإعداد غير موجود"
        });
      }
      
      const updatedSetting = await storage.updateSiteSetting(key, value, req.user.id);
      
      res.json({
        success: true,
        data: updatedSetting,
        message: "تم تحديث الإعداد بنجاح"
      });
    } catch (error) {
      console.error('Error updating site setting:', error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحديث إعداد الموقع"
      });
    }
  });

  // Delete a site setting
  app.delete('/api/site-settings/:key', async (req: Request, res: Response) => {
    try {
      // Only admin users can delete settings
      if (!req.isAuthenticated() || req.user.role !== 'admin') {
        return res.status(401).json({
          success: false,
          message: "غير مصرح بحذف إعدادات الموقع"
        });
      }
      
      const { key } = req.params;
      
      // Check if setting exists
      const existingSetting = await storage.getSiteSetting(key);
      if (!existingSetting) {
        return res.status(404).json({
          success: false,
          message: "الإعداد غير موجود"
        });
      }
      
      const deleted = await storage.deleteSiteSetting(key);
      
      if (deleted) {
        res.json({
          success: true,
          message: "تم حذف الإعداد بنجاح"
        });
      } else {
        res.status(500).json({
          success: false,
          message: "فشل حذف الإعداد"
        });
      }
    } catch (error) {
      console.error('Error deleting site setting:', error);
      res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء حذف إعداد الموقع"
      });
    }
  });

  return httpServer;
}
