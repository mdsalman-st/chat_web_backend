import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

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
    if (!base64String) {
      throw new Error("Base64 string is empty");
    }

    // Agar string me data:image prefix nahi hai, toh add karo
    let uploadString = base64String;
    if (!base64String.startsWith('data:image')) {
      uploadString = `data:image/jpeg;base64,${base64String}`;
    }

    const result = await cloudinary.uploader.upload(uploadString, {
      folder: folderName,
      resource_type: 'image',
      timeout: 120000, // 👈 2 Minute timeout (Badi photos ke liye zaroori hai)
      transformation: [
        { width: 1600, crop: "limit" }, // Max width 1600px (Compression)
        { quality: "auto" }             // Auto quality
      ]
    });
    
    return result.secure_url; 
  } catch (error) {
    console.error("Cloudinary Upload Error Details:", error);
    // Exact error message bhejo frontend ko
    throw new Error(error.message || "Image upload failed to Cloudinary");
  }
}