import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

// Fast upload - minimal processing
export async function uploadImageToCloudinary(
  buffer: Buffer,
  filename: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'chat-images',
            resource_type: 'image',
            public_id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(buffer);
    });

    // Add optimization params to URL for CDN delivery
    // f_auto = auto format, q_auto = auto quality (applied on edge, not upload)
    const optimizedUrl = result.secure_url.replace(
      '/upload/',
      '/upload/f_auto,q_auto/'
    );

    return {
      url: optimizedUrl,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
}
