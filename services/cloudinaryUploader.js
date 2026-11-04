import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Base64 string ko Cloudinary par upload karta hai (Image ya PDF)
 * @param {string} base64String 
 * @param {string} folderName 
 * @param {string} mimeType - 'image/jpeg' ya 'application/pdf'
 * @returns {Promise<string>} - Cloudinary URL
 */
export async function uploadBase64Image(base64String, folderName = 'nexus_answersheets', mimeType = 'image/jpeg') {
  try {
    if (!base64String) throw new Error("Base64 string is empty");

    let uploadString = base64String;
    // Agar base64 string me 'data:' prefix nahi hai, toh mimeType ke hisaab se add karo
    if (!base64String.startsWith('data:')) {
      uploadString = `data:${mimeType};base64,${base64String}`;
    }

    const uploadOptions = {
      folder: folderName,
      resource_type: 'auto', // 👈 AUTO use karo taaki Cloudinary khud pehchane
      timeout: 120000, 
    };

    // Sirf images par compression lagao
    if (mimeType.startsWith('image/')) {
      uploadOptions.transformation = [
        { width: 1600, crop: "limit" },
        { quality: "auto" }
      ];
    }

    const result = await cloudinary.uploader.upload(uploadString, uploadOptions);
    return result.secure_url; 
  } catch (error) {
    console.error("Cloudinary Upload Error Details:", error);
    throw new Error(error.message || "File upload failed to Cloudinary");
  }
}