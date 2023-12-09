// server/utils/rekognition.js
const AWS = require("../aws-config");

const rekognition = new AWS.Rekognition();

// Register a face with Rekognition
async function registerFaceWithRekognition(userId, imageUrl) {
  const params = {
    CollectionId: "justtryingfacedetection", // Replace with your Rekognition collection ID
    Image: {
      S3Object: {
        Bucket: "tryinfacedetection",
        Name: `user-images/${userId}.jpg`, // Path to the image in S3
      },
    },
    ExternalImageId: userId,
  };

  try {
    await rekognition.indexFaces(params).promise();
  } catch (error) {
    console.error("Error registering face with Rekognition:", error);
    throw error;
  }
}

// Detect faces in an image with Rekognition
async function detectFacesWithRekognition(imageUrl) {
  const params = {
    Image: {
      S3Object: {
        Bucket: "tryinfacedetection",
        Name: imageUrl, // Path to the image in S3
      },
    },
  };

  try {
    const response = await rekognition.detectFaces(params).promise();
    console.log(response.FaceDetails);
    return response.FaceDetails; // Returns face details if faces are detected
  } catch (error) {
    console.error("Error detecting faces with Rekognition:", error);
    throw error;
  }
}
async function matchFaceWithRekognitionCollection(imageBase64Data) {
  const params = {
    CollectionId: "justtryingfacedetection", // Replace with your Rekognition collection ID
    Image: {
      Bytes: Buffer.from(imageBase64Data, "base64"),
    },
    MaxFaces: 10, // Maximum number of faces to match
    FaceMatchThreshold: 90, // Adjust the threshold as needed
  };

  try {
    const response = await rekognition.searchFacesByImage(params).promise();
    return response.FaceMatches; // Returns matched faces if any
  } catch (error) {
    console.error("Error matching face with Rekognition collection:", error);
    throw error;
  }
}

module.exports = {
  registerFaceWithRekognition,
  detectFacesWithRekognition,
  matchFaceWithRekognitionCollection,
};
