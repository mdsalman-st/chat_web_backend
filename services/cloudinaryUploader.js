import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

// Cloudinary config (Agar pehle se config hai toh ye skip kar sakte ho)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Base64 image string ko Cloudinary par upload karta hai
 * @param {string} base64String - Base64 image (data:image/jpeg;base64,...)
 * @param {string} folderName - Cloudinary folder name
 * @returns {Promise<string>} - Cloudinary URL
 */
export async function uploadBase64Image(base64String, folderName = 'nexus_answersheets') {
  try {
    const result = await cloudinary.uploader.upload(base64String, {
      folder: folderName,
      resource_type: 'image'
    });
    return result.secure_url; // Direct link
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw new Error("Image upload failed to Cloudinary");
  }
}