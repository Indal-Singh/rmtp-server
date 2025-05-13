import { configDotenv } from "dotenv";
import fs from "fs/promises";
configDotenv();

export async function makePostRequest(data) {
  const url = process.env.MAIN_BACKEND_SERVER_API_END_POINT;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server Response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error("Error making POST request:", error.message);
    throw error;
  }
}

export async function updateThumbnail(filePath, streamKey) {
  const fileBuffer = await fs.readFile(filePath);
  const base64Image = fileBuffer.toString("base64");

  const mimeType = "image/jpeg"; // Or detect dynamically

  const data = {
    streamKey,
    apiKey: process.env.MAIN_BACKEND_SERVER_API_KEY,
    thumbnail: `data:${mimeType};base64,${base64Image}`, // or just base64Image if that's what backend expects
  };

  const response = await makePostRequest(data);
    if (response.success) {
        // unlink the file
        try {
            await fs.unlink(filePath);
            console.log(`File ${filePath} deleted successfully`);
        } catch (err) {
            console.error(`Error deleting file ${filePath}:`, err);
        }
    }
}


export async function uploadRecordedStream(filePath, streamKey) {
  const fileStream = await fs.readFile(filePath);

  const formData = new FormData();
  formData.append("streamKey", streamKey);
  formData.append("apiKey", process.env.MAIN_BACKEND_SERVER_API_KEY);
  formData.append("recordingfile", new Blob([fileStream]), filePath);

  const url = process.env.MAIN_BACKEND_SERVER_API_END_POINT;

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server Response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    if (responseData.success) {
      // unlink the file
      try {
        await fs.unlink(filePath);
        console.log(`File ${filePath} deleted successfully`);
      } catch (err) {
        console.error(`Error deleting file ${filePath}:`, err);
      }
    }
  } catch (error) {
    console.error("Error uploading recorded stream:", error.message);
    throw error;
  }
}
