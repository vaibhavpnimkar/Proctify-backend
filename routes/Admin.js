const express = require("express");
const router = express.Router();

const {
  forgotPasswordAdmin,
  loginAdmin,
  registerAdmin,
  changeAdminPassword,
  adminVerifyOTP,
  getAdminDetails,
  updateAdminDetails,
  createNewExam,
  createQuestions,
  createFromExistingExam,
  setThreshold,
  getThreshold,
  getExamsCreatedByAdmin,
  getQuestions,
  updateQuestion,
  deleteQuestion,
  getExam,
  setStudentThreshold,
  getThresholdValueOfAllStudentsExamWise,
  publishResult,
  getPastExamsByAdmin,
  getNewExamsByAdmin,
  deleteExam,
  updateExam,
  getRegisteredStudents,
  getQuestion,
  getAttemptedAndNotAttemptedQuestionWiseBar,
  getStudentCountInPercentageRangeLine,
  emailVerification
} = require("../controllers/Admin");

const adminMiddleware = require("../middleware/authentication_admin");

//authentication admin
router.route("/login").post(loginAdmin);
router.route("/register").post(registerAdmin);
router.route("/forgotpassword").patch(forgotPasswordAdmin);
router.route("/changepassword").post(changeAdminPassword);
router.route("/verifyotp").post(adminVerifyOTP);

//profile screen
router.route("/getdetails").get(adminMiddleware, getAdminDetails);
router.route("/updatedetails").post(adminMiddleware, updateAdminDetails);

//create exams
router.route("/createnewexam").post(adminMiddleware, createNewExam);
router
  .route("/createfromexistingexam")
  .post(adminMiddleware, createFromExistingExam);

//create Questions
router.route("/createquestion").post(adminMiddleware, createQuestions);

//set and get threshold for the exam
router.route("/setthreshold").post(adminMiddleware, setThreshold);
router.route("/getthreshold/:examcode").get(adminMiddleware, getThreshold);

//get exam created by particular admin - pass examcode after ? in url eg: localhost:3002/api/v1/admin/getexams?examcode=b it will return only examcode in array
router.route("/getexams").get(adminMiddleware, getExamsCreatedByAdmin);

//get all the questions of a particular exam and update or delete any particular question
router.route("/getquestions/:examcode").get(adminMiddleware, getQuestions);
router.route("/updatequestion").post(adminMiddleware, updateQuestion);
router
  .route("/deletequestion/:questionid")
  .delete(adminMiddleware, deleteQuestion);

//get details of particular exam based on examcode
router.route("/getexam/:examcode").get(adminMiddleware, getExam);

//set the value of threshold of a particular student once the student gets disconnected from webRTC server
router.route("/setstudentthreshold").post(adminMiddleware, setStudentThreshold);

//get all the logs of exam including student_name and all threshold value of students who appeared for a particuar exam based on examcode
router
  .route("/getexamlog/:examcode")
  .get(adminMiddleware, getThresholdValueOfAllStudentsExamWise);

//publish result
router.route("/publishresult/:examcode").post(adminMiddleware, publishResult);

//get all the past exam created by particular admin - it will return array of object
router.route("/getallpastexams").get(adminMiddleware,getPastExamsByAdmin)

//get all the past exam created by particular admin - it will return array of object
router.route("/getallnewexams").get(adminMiddleware,getNewExamsByAdmin)

//delete exam based on examcode
router.route("/deleteexam/:examcode").delete(adminMiddleware,deleteExam)

//update exam
router.route("/updateexam/:examcode").post(adminMiddleware,updateExam)

//get all the registered students
router.route("/getregisteredstudent/:examcode").get(adminMiddleware,getRegisteredStudents)

//get individual question based on question id
router.route("/getquestion/:questionid").get(adminMiddleware,getQuestion)

//get the data which states how many times a particular question is attempted an not attempted - this data will be fed in bar graph
router.route("/getattemptedandnotattemptedquestionwisebar/:examcode").get(adminMiddleware,getAttemptedAndNotAttemptedQuestionWiseBar)

//get the data that how many students are their in particular range of percentage - this data will be fed in bar graph
router.route("/getstudentcountinpercentagerangeline/:examcode") .get(adminMiddleware,getStudentCountInPercentageRangeLine)

//this screen will take otp and will verify email written by user in previous screen
router.route("/emailverification").post(emailVerification)


module.exports = router;
