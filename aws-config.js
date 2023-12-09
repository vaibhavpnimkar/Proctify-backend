const AWS = require("aws-sdk");

AWS.config.update({
  accessKeyId: "AKIARSA6ALIHK75PTKLX",
  secretAccessKey: "lAIn2umCcT4bNnGriwzA6DAqdTn54lJsNtKRrznu",
  region: "ap-south-1", // Change to your desired region
});

module.exports = AWS;
