const express = require("express");
const app = express();
const { BadRequestError, UnauthenticatedError } = require("./errors/index");
const xlsx = require("xlsx");
const bodyParser = require("body-parser");
const multer = require("multer");
const pool = require("./db");
const https = require('httpolyglot')






// for cold start issue
async function queryDatabase() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW() as current_time");
    // console.log("Database is warm. Current time:", result.rows[0].current_time);
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    client.release();
  }
}

const queryInterval = 10000;

setInterval(queryDatabase, queryInterval);

//dependencies
require("dotenv").config();
require("express-async-errors");
const { StatusCodes } = require("http-status-codes");

// extra security packages
const helmet = require("helmet");
const cors = require("cors");

// routers
const adminRouter = require("./routes/Admin");
const studentRouter = require("./routes/Student");

//middleware
app.use(express.json());
app.use(helmet());
app.use(cors());

//excel upload
app.use(bodyParser.urlencoded({ extended: true }));

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public");
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split("/")[1];
    cb(null, `${file.originalname}`);
  },
});

const upload = multer({ storage: multerStorage });

//route for extracting questions from excel and adding into database
app.post(
  "/api/v1/admin/addquestionsfromexcel/:examcode",
  upload.single("excel"),
  async (req, res) => {
    const { examcode } = req.params;
    const checkexamcode = await pool.query(
      `select * from exam where examcode = '${examcode}';`
    );
    if (checkexamcode.rowCount == 0) {
      throw new BadRequestError("Please provide valid examcode");
    }
    const workbook = xlsx.readFile(`public/${req.file.originalname}`);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = xlsx.utils.decode_range(worksheet["!ref"]);
    for (let row = range.s.r + 1; row <= range.e.r; ++row) {
      let data = {};
      for (let col = range.s.c; col <= range.e.c; ++col) {
        let cell = worksheet[xlsx.utils.encode_cell({ r: row, c: col })];
        //in the below line for each cell it checks its heading and in object 'data' is does data[heading] = value at the cell whose heading we found
        data[worksheet[xlsx.utils.encode_cell({ r: 0, c: col })].v] = cell.v;
        if (
          worksheet[xlsx.utils.encode_cell({ r: 0, c: col })].v ==
          "number_of_options"
        ) {
          let options = [];
          //in the below code it iterates in the right cells of "number_of_options" field in excel according to the values present in "number_of_options" field and creates "options" array
          for (let i = 1; i <= Number(cell.v); ++i) {
            let value =
              worksheet[xlsx.utils.encode_cell({ r: row, c: col + i })];
            options.push(value.v);
          }
          data["options"] = options;
          break;
        }
      }
      //below code simply pushes each row of excel i.e each question in database for the exam whose examcode is passed in paramter
      let options_str = "array[";
      for (let i = 0; i < data.number_of_options; ++i) {
        options_str += `'${data.options[i]}'`;
        if (i != data.number_of_options - 1) {
          options_str += ",";
        }
      }
      options_str += "]";
      const response = await pool.query(
        `insert into questions(examcode,description,number_of_options,options,answer) values('${examcode}','${data.description}',${data.number_of_options},${options_str},${data.answer});`
      );
    }
    res.status(200).json({ res: "Success" });
  }
);

// route for chat message getting and posting in DB.
app.post("/api/v1/chat", async (req, res) => {
  const { admin_name, message, sid } = req.body;
  const response = await pool.query(
    `insert into chat(admin,message,sid,timestamp) values('${admin_name}','${message}','${sid}', '${new Date().toTimeString()}');`
  );
  res.status(200).json({ res: "Success" });
});

app.get("/api/v1/chat/:sid", async (req, res) => {
  const { sid } = req.params;
  let response
  if (sid == '-1') {
    response = await pool.query(
      `(select distinct c.sid,s.name, message from chat as c inner join student as s on c.sid = s.sid where c.message like '#!%' order by c.sid);`
    );
  }
  else {
    response = await pool.query(
      `select * from chat where sid = '${sid}' order by timestamp;`
    );
  }
  res.status(200).json({ res: response.rows });
});

//routes admin
app.use("/api/v1/admin", adminRouter);
//routes student
app.use("/api/v1/student", studentRouter);

// app.post('/api/v1/webcam_detect', async (req, res) => {
//   let { image, sid } = req.body;
//   image = image.replace(/^data:image\/jpeg;base64,/, "");
//   fetch('http://localhost:5000/', {
//     method: 'POST',
//     body: JSON.stringify({
//       image: image,
//       sid: sid
//     }),
//     headers: { 'Content-Type': 'application/json' }
//   }).then(res => res.json())
//     .then(json => {
//       console.log(json);
//       res.status(200).json({ res: json });
//     }
//     ).catch(err => console.log(err));
// });

app.post('/api/v1/createRoom', async (req, res) => {
  const { roomName, data } = req.json;
  console.log('createRoom', roomName, data);
  const response = await pool.query('insert into rooms(room_name, data) values($1, $2)', [roomName, data]);
  res.status(200).json({ res: "Success" });
});

app.get('/api/v1/getRoom/:roomName', async (req, res) => {
  const { roomName } = req.params;
  const response = await pool.query('select * from rooms where room_name = $1', [roomName]);
  res.status(200).json({ res: response.rows });
});


// error handler
const notFoundMiddleware = require("./middleware/not-found");
const errorHandlerMiddleware = require("./middleware/error-handler");

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);




const port = process.env.PORT || 3002;

app.listen(port, () => console.log(`Server is listening on port ${port}...`));
