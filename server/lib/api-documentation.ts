/**
 * API Documentation Generator
 * Generates documentation for the API endpoints
 */

export interface APIEndpoint {
  path: string;
  method: string;
  description: string;
  requiresAuth: boolean;
  requiresSubscription: boolean;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    location: 'query' | 'body' | 'path' | 'header';
  }[];
  responses?: {
    status: number;
    description: string;
    example?: any;
  }[];
}

export interface APIDocumentation {
  title: string;
  version: string;
  baseUrl: string;
  authentication: string;
  endpoints: APIEndpoint[];
}

/**
 * Generate API documentation
 */
export function generateApiDocumentation(baseUrl: string = '/api'): APIDocumentation {
  return {
    title: 'Image Processing API',
    version: '1.0.0',
    baseUrl,
    authentication: 'API keys can be provided in the X-API-Key header or as an api_key query parameter.',
    endpoints: [
      {
        path: '/api/upload',
        method: 'POST',
        description: 'Upload one or more images for processing',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'files',
            type: 'file[]',
            required: true,
            description: 'Image files to upload (multipart/form-data)',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully uploaded images',
            example: {
              success: true,
              message: 'Images uploaded successfully',
              data: [
                {
                  id: 1,
                  fileName: 'image.jpg',
                  fileSize: 102400,
                  fileType: 'image/jpeg',
                  width: 800,
                  height: 600
                }
              ]
            }
          }
        ]
      },
      {
        path: '/api/compress/:id',
        method: 'POST',
        description: 'Compress an image with specified options',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to compress',
            location: 'path'
          },
          {
            name: 'format',
            type: 'string',
            required: true,
            description: 'Output format (jpg, png, webp)',
            location: 'body'
          },
          {
            name: 'quality',
            type: 'number',
            required: true,
            description: 'Compression quality (1-100)',
            location: 'body'
          },
          {
            name: 'keepMetadata',
            type: 'boolean',
            required: false,
            description: 'Whether to preserve image metadata',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully compressed image',
            example: {
              success: true,
              message: 'Image compressed successfully',
              data: {
                id: 1,
                fileName: 'compressed-123456789.jpg',
                fileSize: 51200,
                fileType: 'image/jpeg',
                width: 800,
                height: 600,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/resize/:id',
        method: 'POST',
        description: 'Resize an image with specified options',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to resize',
            location: 'path'
          },
          {
            name: 'width',
            type: 'number',
            required: false,
            description: 'Target width in pixels',
            location: 'body'
          },
          {
            name: 'height',
            type: 'number',
            required: false,
            description: 'Target height in pixels',
            location: 'body'
          },
          {
            name: 'maintainAspectRatio',
            type: 'boolean',
            required: false,
            description: 'Whether to maintain the aspect ratio',
            location: 'body'
          },
          {
            name: 'resizeMode',
            type: 'string',
            required: false,
            description: 'Resize mode (exact, fit, percent)',
            location: 'body'
          },
          {
            name: 'percent',
            type: 'number',
            required: false,
            description: 'Percentage of original size if using percent mode',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully resized image',
            example: {
              success: true,
              message: 'Image resized successfully',
              data: {
                id: 2,
                fileName: 'resized-123456789.jpg',
                fileSize: 61440,
                fileType: 'image/jpeg',
                width: 400,
                height: 300,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/crop/:id',
        method: 'POST',
        description: 'Crop an image with specified coordinates',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to crop',
            location: 'path'
          },
          {
            name: 'x',
            type: 'number',
            required: true,
            description: 'X coordinate of crop start point',
            location: 'body'
          },
          {
            name: 'y',
            type: 'number',
            required: true,
            description: 'Y coordinate of crop start point',
            location: 'body'
          },
          {
            name: 'width',
            type: 'number',
            required: true,
            description: 'Width of the crop area',
            location: 'body'
          },
          {
            name: 'height',
            type: 'number',
            required: true,
            description: 'Height of the crop area',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully cropped image',
            example: {
              success: true,
              message: 'Image cropped successfully',
              data: {
                id: 3,
                fileName: 'cropped-123456789.jpg',
                fileSize: 30720,
                fileType: 'image/jpeg',
                width: 300,
                height: 200,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/convert/:id',
        method: 'POST',
        description: 'Convert an image to a different format',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to convert',
            location: 'path'
          },
          {
            name: 'format',
            type: 'string',
            required: true,
            description: 'Target format (jpg, png, webp, gif, tiff)',
            location: 'body'
          },
          {
            name: 'quality',
            type: 'number',
            required: false,
            description: 'Output quality (1-100)',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully converted image',
            example: {
              success: true,
              message: 'Image converted successfully',
              data: {
                id: 4,
                fileName: 'converted-123456789.webp',
                fileSize: 25600,
                fileType: 'image/webp',
                width: 800,
                height: 600,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/watermark/:id',
        method: 'POST',
        description: 'Apply watermark to an image',
        requiresAuth: true,
        requiresSubscription: true,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to watermark',
            location: 'path'
          },
          {
            name: 'type',
            type: 'string',
            required: true,
            description: 'Watermark type (text, image)',
            location: 'body'
          },
          {
            name: 'text',
            type: 'string',
            required: false,
            description: 'Text content for text watermark',
            location: 'body'
          },
          {
            name: 'fontFamily',
            type: 'string',
            required: false,
            description: 'Font family for text watermark',
            location: 'body'
          },
          {
            name: 'fontSize',
            type: 'number',
            required: false,
            description: 'Font size for text watermark',
            location: 'body'
          },
          {
            name: 'fontColor',
            type: 'string',
            required: false,
            description: 'Font color for text watermark',
            location: 'body'
          },
          {
            name: 'opacity',
            type: 'number',
            required: false,
            description: 'Opacity of the watermark (0-1)',
            location: 'body'
          },
          {
            name: 'position',
            type: 'string',
            required: false,
            description: 'Position of watermark (topLeft, topRight, bottomLeft, bottomRight, center)',
            location: 'body'
          },
          {
            name: 'padding',
            type: 'number',
            required: false,
            description: 'Padding from edges',
            location: 'body'
          },
          {
            name: 'watermarkImage',
            type: 'file',
            required: false,
            description: 'Image to use as watermark if type is image',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully applied watermark',
            example: {
              success: true,
              message: 'Watermark applied successfully',
              data: {
                id: 5,
                fileName: 'watermarked-123456789.jpg',
                fileSize: 71680,
                fileType: 'image/jpeg',
                width: 800,
                height: 600,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/enlarge/:id',
        method: 'POST',
        description: 'Enlarge an image with better quality',
        requiresAuth: true,
        requiresSubscription: true,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to enlarge',
            location: 'path'
          },
          {
            name: 'scale',
            type: 'number',
            required: true,
            description: 'Scale factor for enlargement (e.g., 1.5 = 150%)',
            location: 'body'
          },
          {
            name: 'mode',
            type: 'string',
            required: false,
            description: 'Enlargement mode (standard, highQuality)',
            location: 'body'
          },
          {
            name: 'format',
            type: 'string',
            required: false,
            description: 'Output format (jpg, png, webp)',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully enlarged image',
            example: {
              success: true,
              message: 'Image enlarged successfully',
              data: {
                id: 6,
                fileName: 'enlarged-123456789.jpg',
                fileSize: 122880,
                fileType: 'image/jpeg',
                width: 1200,
                height: 900,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/rotate/:id',
        method: 'POST',
        description: 'Rotate an image by specified angle',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'Image ID to rotate',
            location: 'path'
          },
          {
            name: 'angle',
            type: 'number',
            required: true,
            description: 'Rotation angle in degrees',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully rotated image',
            example: {
              success: true,
              message: 'Image rotated successfully',
              data: {
                id: 7,
                fileName: 'rotated-123456789.jpg',
                fileSize: 81920,
                fileType: 'image/jpeg',
                width: 600,
                height: 800,
                originalImageId: 1
              }
            }
          }
        ]
      },
      {
        path: '/api/user/api-keys',
        method: 'GET',
        description: 'Get all API keys for the authenticated user',
        requiresAuth: true,
        requiresSubscription: false,
        responses: [
          {
            status: 200,
            description: 'Successfully retrieved API keys',
            example: {
              success: true,
              data: [
                {
                  id: 1,
                  name: 'Development Key',
                  keyValue: 'xxx-partial-key-xxx',
                  createdAt: '2023-04-01T12:00:00Z',
                  lastUsed: '2023-04-15T08:30:00Z',
                  active: true
                }
              ]
            }
          }
        ]
      },
      {
        path: '/api/user/api-keys',
        method: 'POST',
        description: 'Create a new API key for the authenticated user',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'name',
            type: 'string',
            required: true,
            description: 'Name/description for the API key',
            location: 'body'
          }
        ],
        responses: [
          {
            status: 201,
            description: 'Successfully created a new API key',
            example: {
              success: true,
              message: 'API key created successfully',
              data: {
                id: 2,
                name: 'Production Key',
                keyValue: 'api_xxxxxxxxxxxxxxxxxxxx',
                createdAt: '2023-04-20T14:00:00Z',
                lastUsed: null,
                active: true
              }
            }
          }
        ]
      },
      {
        path: '/api/user/api-keys/:id',
        method: 'DELETE',
        description: 'Delete/deactivate an API key',
        requiresAuth: true,
        requiresSubscription: false,
        parameters: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'API key ID to delete',
            location: 'path'
          }
        ],
        responses: [
          {
            status: 200,
            description: 'Successfully deleted API key',
            example: {
              success: true,
              message: 'API key deleted successfully'
            }
          }
        ]
      },
      {
        path: '/api/documentation',
        method: 'GET',
        description: 'Get API documentation in JSON format',
        requiresAuth: false,
        requiresSubscription: false,
        responses: [
          {
            status: 200,
            description: 'Successfully retrieved API documentation',
            example: {
              title: 'Image Processing API',
              version: '1.0.0',
              baseUrl: '/api',
              authentication: 'API keys can be provided in the X-API-Key header or as an api_key query parameter.',
              endpoints: [
                {
                  path: '/api/upload',
                  method: 'POST',
                  description: 'Upload one or more images for processing',
                  // shortened for brevity
                }
              ]
            }
          }
        ]
      }
    ]
  };
}