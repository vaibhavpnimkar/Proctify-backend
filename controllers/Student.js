const { StatusCodes } = require("http-status-codes");
const {
  BadRequestError,
  UnauthenticatedError,
  NotFoundError,
} = require("../errors/index");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const e = require("express");
require("dotenv").config();
const AWS = require("../aws-config.js");
const rekognition = new AWS.Rekognition();
const {
  matchFaceWithRekognitionCollection,
  detectFacesWithRekognition,
} = require("../utils/rekognition");
const { uploadImageToS3 } = require("../utils/s3");
const { registerFaceWithRekognition } = require("../utils/rekognition");
const moment = require("moment");
//utility
function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex > 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

//authentication user
const registerStudent = async (req, res) => {
  let { name, email, password, phoneno } = req.body;
  if (!email || !name || !password || !phoneno) {
    throw new BadRequestError("Please provide necessary credentials");
  }
  const ownerx = await pool.query(
    `Select * from student where email like '${email}';`
  );
  if (ownerx.rowCount > 0) {
    throw new BadRequestError("This Email already Exists");
  }
  const salt = await bcrypt.genSalt(10);
  password = await bcrypt.hash(password, salt);
  const response = await pool.query(
    `insert into student(name,email,password,phoneno) values ('${name}','${email}','${password}','${phoneno}') returning sid;`
  );
  const token = jwt.sign(
    { sid: response.rows[0].sid },
    process.env.JWT_SECRET_STUDENT,
    { expiresIn: process.env.JWT_LIFETIME }
  );
  res
    .status(StatusCodes.CREATED)
    .json({ user: { id: response.rows[0].sid }, token });
};

const createCollection = async (req, res) => {
  const createCollectionParams = {
    CollectionId: "justtryingfacedetection",
  };

  rekognition.createCollection(createCollectionParams, (err, data) => {
    if (err) {
      console.error("Error creating collection:", err);
      res.status(500).json({ error: "Error creating collection" });
    } else {
      console.log("Collection created successfully:", data);
      res.json({ message: "Collection created successfully" });
    }
  });
};
const faceLogin = async (req, res) => {
  const { studentId } = req.user;
  const { imageBase64Data } = req.body;

  // Match the captured face with the Rekognition collection
  const base64ImageData = imageBase64Data; // Replace with your actual Base64 data

  // Decode the Base64 data (remove the data:image/jpeg;base64, prefix)
  const base64Image = base64ImageData.replace(/^data:image\/\w+;base64,/, "");
  const matchedFaces = await matchFaceWithRekognitionCollection(base64Image);
  // await detectFacesWithRekognition(imageUrl);
  let max = 0.0;
  let index = -1;
  for (let i = 0; i < matchedFaces.length; ++i) {
    if (matchedFaces[i].Similarity > max) {
      index = i;
    }
  }
  if (Number(matchedFaces[index].Face.ExternalImageId) != studentId) {
    throw new BadRequestError("Face not verified");
  }
  // Determine if the face matches any registered user
  //   if (matchedFaces.length > 0) {
  //     res.json({ message: "Login successful" });
  //   } else {
  //     res.status(401).json({ error: "Login failed: Face not recognized" });
  //   }
  // } catch (error) {
  //   console.error("Login error:", error);
  //   res.status(500).json({ error: "Internal Server Error" });
  // }
  res.status(StatusCodes.OK).json({ res: "Success" });
};
const faceRegister = async (req, res) => {
  const { studentId } = req.user;
  const { imageBase64Data } = req.body;
  // console.log(imageBase64Data);
  try {
    // Upload image to S3
    const imageUrl = await uploadImageToS3(
      JSON.stringify(studentId),
      String(imageBase64Data)
    );

    // Register face with Rekognition
    await registerFaceWithRekognition(JSON.stringify(studentId), imageUrl);

    // Store user data in DynamoDB
    // await createUserInDynamoDB(userId, imageUrl);

    res.json({ message: "Registration successful" });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const forgotPasswordStudent = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new BadRequestError("Please provide email");
  }
  const otp = Math.floor(Math.random() * (10000 - 1000 + 1) + 1000);
  const check = await pool.query(
    `select * from student where email like '${email}';`
  );
  if (check.rowCount == 0) {
    throw new BadRequestError("Email does not exists");
  }
  const owner = await pool.query(
    `update student set otp = '${otp}' where email like '${email}';`
  );

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", // hostname
    secureConnection: false, // TLS requires secureConnection to be false
    port: 587, // port for secure SMTP
    tls: {
      ciphers: "SSLv3",
    },
    auth: {
      user: "proctorsih@gmail.com",
      pass: "opuueiosrtjuwntj",
    },
  });

  const mailOptions = {
    from: '"Proctify " <proctorsih@gmail.com>', // sender address (who sends)
    to: `${email}`, // list of receivers (who receives)
    subject: "OTP for Reseting Your website's Password ", // Subject line
    text: `Your OTP for reseting the password for website is ${otp}, please enter this OTP in your website to reset your password.
  -Thanks,
  Team Proctify  `, // plaintext body
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      return console.log(error);
    }

    res.status(StatusCodes.OK).json({ otpsent: true });
  });
};

const loginStudent = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new BadRequestError("Please provide email and password");
  }
  const response = await pool.query(
    `select * from student where email like '${email}';`
  );
  if (response.rowCount == 0) {
    throw new BadRequestError("Please provide valid credentials");
  }
  const isPasswordCorrect = await bcrypt.compare(
    password,
    response.rows[0].password
  );
  if (!isPasswordCorrect) {
    throw new BadRequestError("Please provide valid credentials");
  }
  const token = jwt.sign(
    { sid: response.rows[0].sid },
    process.env.JWT_SECRET_STUDENT,
    { expiresIn: process.env.JWT_LIFETIME }
  );
  res
    .status(StatusCodes.CREATED)
    .json({ user: { id: response.rows[0].sid }, token });
};

const studentVerifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    throw new BadRequestError("Please provide neccesary Credentials");
  }
  const response = await pool.query(
    `select * from student where email like '${email}';`
  );
  if (response.rowCount == 0) {
    throw new BadRequestError("Please provide valid Email");
  }
  if (response.rows[0].otp != Number(otp)) {
    throw new BadRequestError("Please provide valid OTP");
  }
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const changeStudentPassword = async (req, res) => {
  let { email, password } = req.body;
  if (!password || !email) {
    throw new BadRequestError("Please provide required credentials");
  }
  const salt = await bcrypt.genSalt(10);
  password = await bcrypt.hash(password, salt);
  const response = await pool.query(
    `update student set password = '${password}' where email like '${email}';`
  );
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const getStudentDetails = async (req, res) => {
  const { studentId } = req.user;
  const response = await pool.query(
    `select sid,email,name,phoneno from student where sid = ${studentId}`
  );
  res.status(StatusCodes.OK).json({ res: "Success", data: response.rows });
};

const updateStudentDetails = async (req, res) => {
  const { email, phoneno, name } = req.body;
  const { studentId } = req.user;
  if (!email || !phoneno || !name) {
    throw new BadRequestError("Please provide required credentials");
  }
  const response = await pool.query(
    `update student set email = '${email}',phoneno='${phoneno}',name='${name}' where sid=${studentId};`
  );
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const getAllQuestionsBasedOnExam = async (req, res) => {
  const { examcode } = req.params;
  const checkexamcode = await pool.query(
    `select * from exam where examcode = '${examcode}';`
  );
  if (checkexamcode.rowCount == 0) {
    throw new BadRequestError("Please provide valid examcode");
  }
  const response = await pool.query(
    `select * from questions where examcode = '${examcode}';`
  );
  for (let i = 0; i < response.rows.length; ++i) {
    response.rows[i]["selectedoption"] = -1;
  }
  //if admin has selected random question then random questions will be send
  if (checkexamcode.rows[0].israndom) {
    response.rows = shuffle(response.rows);
  }
  res.status(StatusCodes.OK).json({ res: "Success", data: response.rows });
};

const canGiveExam = async (req, res) => {
  const { examcode } = req.params;
  const { studentId } = req.user;
  const checkexamcode = await pool.query(
    `select * from exam where examcode = '${examcode}';`
  );
  if (checkexamcode.rowCount == 0) {
    throw new BadRequestError("Please provide valid examcode");
  }
  // let yourDate = new Date();
  // const check = yourDate
  //   .toLocaleString(undefined, { timeZone: "Asia/Kolkata" })
  //   .split(",")[0];

  // // Input date in 'dd/mm/yyyy' format
  // const inputDateStr = `'${check}'`;

  // // Parse the input date and format it as 'yyyy-mm-dd'
  // const outputDateStr = moment(inputDateStr, "MM/DD/YYYY").format("YYYY-MM-DD");
  const date = new Date()
  const outputDateStr = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`

  // Get the current hour, minute, and second
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  // Create the time string in hh:mm:ss format
  const currentTime = `${hours}:${minutes}:${seconds}`;
  const response = await pool.query(
    `select * from exam where startdate = '${outputDateStr}' and starttime<='${currentTime}' and endtime>='${currentTime}' and examcode='${examcode}';`
  );
  if (response.rowCount == 0) {
    throw new BadRequestError("Check the exam schedule and try again");
  }
  //check whether student is registered or not
  const studentregistered = await pool.query(`select * from registered_exams where examcode='${examcode}' and sid = ${studentId};`)
  if (studentregistered.rowCount == 0) {
    throw new BadRequestError("You are not registered for this exam")
  }
  //check whether student has appeared or not
  const studentappeared = await pool.query(
    `select * from result where sid = ${studentId} and examcode = '${examcode}';`
  );
  if (studentappeared.rowCount == 1) {
    throw new BadRequestError("You have already attempted this test.");
  }
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const calculateResult = async (req, res) => {
  const { studentId } = req.user;
  const data = req.body;
  const examcode = data[0].examcode;
  const response = await pool.query(
    `select * from exam where examcode like '${examcode}';`
  );
  let negativemarks = response.rows[0].negative_marks;
  let questionweightage = response.rows[0].question_weightage;
  let marks = 0;
  let totalmarks = 0
  for (let i = 0; i < data.length; ++i) {
    if (data[i].answer == data[i].selectedoption) {
      marks += questionweightage;
    } else if (data[i].selectedoption == -1) {
      marks += 0;
    } else {
      marks -= negativemarks;
    }
    totalmarks += questionweightage
    let attempted = data[i].attempted == undefined ? 0 : data[i].attempted;
    let not_attempted = data[i].not_attempted == undefined ? 0 : data[i].not_attempted;
    if (data[i].selectedoption == -1) {
      not_attempted++;
    }
    else {
      attempted++;
    }
    const updatecount = await pool.query(`update questions set attempted=${attempted},not_attempted=${not_attempted} where questionid=${data[i].questionid}`)
  }
  let percentage = (marks / totalmarks) * 100
  const resultupdate = await pool.query(
    `insert into result values('${examcode}',${studentId},${marks},${percentage});`
  );
  // const deleteenrty = await pool.query(`delete from registered_exams where examcode like '${examcode}' and sid=${studentId};`)
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const getExamResults = async (req, res) => {
  const { studentId } = req.user;
  const response = await pool.query(
    `select r.totalmarks,e.exam_name,e.examcode,e.startdate,e.publish_result from result as r inner join exam as e on r.examcode = e.examcode where r.sid = ${studentId};`
  );
  res.status(StatusCodes.OK).json({ res: "Success", data: response.rows });
};

const getSpecificExamResult = async (req, res) => {
  const { studentId } = req.user;
  const { examcode } = req.params;
  const checkexamcode = await pool.query(
    `select * from exam where examcode = '${examcode}';`
  );
  if (checkexamcode.rowCount == 0) {
    throw new BadRequestError("Please provide valid examcode");
  }
  const response = await pool.query(
    `select max(totalmarks),min(totalmarks),avg(totalmarks),count(totalmarks) from result group by examcode having examcode='${examcode}';`
  );
  const marks = await pool.query(
    `select totalmarks,percentage from result where sid = ${studentId};`
  );
  const user_marks = marks.rows[0].totalmarks;
  // console.log(user_marks)
  // const percentile_calc = await pool.query(`select totalmarks from result where examcode = '${examcode}' order by totalmarks desc;`)
  // let index=0
  // for(let i=0;i<percentile_calc.rows.size;++i){
  //   if(user_marks<=percentile_calc.rows[i]['totalmarks']){
  //     index = Number(response.rows[0].count) - i - 1;
  //     break;
  //   }
  // }
  // console.log(index / Number(response.rows[0].count))
  // let percentile = (index / Number(response.rows[0].count))*100
  // console.log(percentile_calc.rows)
  // console.log(percentile)
  let status = ''

  if (checkexamcode.rows[0].cutoff <= user_marks) {
    status = 'PASS'
  }
  else {
    status = 'FAIL'
  }

  res.status(StatusCodes.OK).json({
    res: "Success",
    data: {
      max: response.rows[0].max,
      min: response.rows[0].min,
      avg: response.rows[0].avg,
      count: response.rows[0].count,
      marks: user_marks,
      cutoff: checkexamcode.rows[0].cutoff,
      percentage: marks.rows[0].percentage,
      status
    },
  });
};

const reportProblem = async (req, res) => {
  const { studentId } = req.user;
  const { description } = req.body;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", // hostname
    secureConnection: false, // TLS requires secureConnection to be false
    port: 587, // port for secure SMTP
    tls: {
      ciphers: "SSLv3",
    },
    auth: {
      user: "proctorsih@gmail.com",
      pass: "opuueiosrtjuwntj",
    },
  });

  const response = await pool.query(
    `select * from student where sid = ${studentId};`
  );

  const mailOptions = {
    from: '"Proctify " <proctorsih@gmail.com>', // sender address (who sends)
    to: "shahkandarp24@gmail.com", // list of receivers (who receives)
    subject: `Issue Raised by a student whose name is ${response.rows[0].name} and id is ${studentId}`, // Subject line
    text: `${description}`, // plaintext body
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      return console.log(error);
    }

    res.status(StatusCodes.OK).json({ res: "Success" });
  });
};

const getExamDetails = async (req, res) => {
  const { examcode } = req.params;
  const response = await pool.query(
    `select * from exam where examcode like '${examcode}';`
  );
  res.status(StatusCodes.OK).json({ res: "Success", data: response.rows[0] });
};

const registerExam = async (req, res) => {
  const { studentId } = req.user;
  const { examcode } = req.params;
  const data = JSON.stringify(req.body)
  const response = await pool.query(
    `insert into registered_exams values(${studentId},'${examcode}','${data}');`
  );
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const getRegisteredExam = async (req, res) => {
  const { studentId } = req.user;
  // let yourDate = new Date();
  // const check = yourDate
  //   .toLocaleString(undefined, { timeZone: "Asia/Kolkata" })
  //   .split(",")[0];

  // // Input date in 'dd/mm/yyyy' format
  // const inputDateStr = `'${check}'`;

  // // Parse the input date and format it as 'yyyy-mm-dd'
  // const outputDateStr = moment(inputDateStr, "DD/MM/YYYY").format("YYYY-MM-DD");
  const date = new Date()
  const outputDateStr = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`
  const response = await pool.query(
    `select * from registered_exams as r inner join exam as e on e.examcode = r.examcode where r.sid = ${studentId} and e.startdate >= '${outputDateStr}';`
  );
  res.status(StatusCodes.OK).json({ res: "Success", data: response.rows });
};

const getAllExams = async (req, res) => {
  const { studentId } = req.user;
  // let yourDate = new Date();
  // const check = yourDate
  //   .toLocaleString(undefined, { timeZone: "Asia/Kolkata" })
  //   .split(",")[0];

  // // Input date in 'mm/dd/yyyy' format
  // const inputDateStr = `'${check}'`;
  // // Parse the input date and format it as 'yyyy-mm-dd'
  // const outputDateStr = moment(inputDateStr, "MM/DD/YYYY").format("YYYY-MM-DD");
  const date = new Date()
  const outputDateStr = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`
//   const response = await pool.query(
//     `SELECT e.examcode, e.startdate, e.starttime, e.endtime,e.exam_name,e.negative_marks,e.question_weightage,e.duration,e.details
// FROM exam e
// LEFT JOIN registered_exams rs ON e.examcode = rs.examcode
// WHERE e.last_registeration_date >= '${outputDateStr}' AND (rs.sid IS NULL OR rs.sid != ${studentId});
// `
//   );
const response = await pool.query(`SELECT e.examcode, e.startdate, e.starttime, e.endtime, e.last_registeration_date,e.exam_name,e.negative_marks,e.question_weightage,e.duration,e.details
FROM exam e
LEFT JOIN registered_exams rs ON e.examcode = rs.examcode AND rs.sid = ${studentId}
WHERE e.last_registeration_date >= '${outputDateStr}'
  AND rs.sid IS NULL;`)
  res.status(StatusCodes.OK).json({ res: "Success", data: response.rows });
};

const resetPassword = async (req, res) => {
  let { password, newpassword } = req.body;
  const { studentId } = req.user;
  const response = await pool.query(
    `select * from student where sid = '${studentId}';`
  );
  const isPasswordCorrect = await bcrypt.compare(
    password,
    response.rows[0].password
  );
  if (!isPasswordCorrect) {
    throw new BadRequestError("Please enter correct password");
  }
  const salt = await bcrypt.genSalt(10);
  newpassword = await bcrypt.hash(newpassword, salt);
  const update = await pool.query(
    `update student set password = '${newpassword}' where sid = ${studentId};`
  );
  res.status(StatusCodes.OK).json({ res: "Success" });
};

const emailVerification = async(req,res)=>{
  const {email} = req.body
  if (!email) {
    throw new BadRequestError("Please provide email");
  }
  const otp = Math.floor(Math.random() * (10000 - 1000 + 1) + 1000);
  const check = await pool.query(`select * from student where email like '${email}';`)
  if (check.rowCount == 1) {
    throw new BadRequestError("This email already exists");
  }
  const owner = await pool.query(`update student set otp = '${otp}' where email like '${email}';`)

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", // hostname
    secureConnection: false, // TLS requires secureConnection to be false
    port: 587, // port for secure SMTP
    tls: {
      ciphers: "SSLv3",
    },
    auth: {
      user: "proctorsih@gmail.com",
      pass: "opuueiosrtjuwntj",
    },
  });

  const mailOptions = {
    from: '"Proctify " <proctorsih@gmail.com>', // sender address (who sends)
    to: `${email}`, // list of receivers (who receives)
    subject: "OTP for Validating your email ", // Subject line
    text: `Your OTP for validating the email for Student website is ${otp}, please enter this OTP in your Student website to validate your email.
  -Thanks,
  Team Proctify  `, // plaintext body
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      return console.log(error);
    }

    res.status(StatusCodes.OK).json({ otp });
  });
  
}

module.exports = {
  forgotPasswordStudent,
  loginStudent,
  registerStudent,
  changeStudentPassword,
  studentVerifyOTP,
  getStudentDetails,
  updateStudentDetails,
  getAllQuestionsBasedOnExam,
  canGiveExam,
  calculateResult,
  getExamResults,
  getSpecificExamResult,
  reportProblem,
  getExamDetails,
  createCollection,
  faceLogin,
  faceRegister,
  registerExam,
  getRegisteredExam,
  getAllExams,
  resetPassword,
  emailVerification
};
