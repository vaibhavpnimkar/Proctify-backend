const express = require("express");
const app = express();
const { BadRequestError, UnauthenticatedError } = require("./errors/index");
const xlsx = require("xlsx");
const bodyParser = require("body-parser");
const multer = require("multer");
const pool = require("./db");
const https = require('httpolyglot')

const fs = require("fs");
const path = require("path");

const {Server} = require("socket.io");
const mediasoup = require("mediasoup");



const { Server } = ('socket.io')
const mediasoup =( 'mediasoup')
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
  const response = await pool.query(
    `select * from chat where sid = '${sid}' order by timestamp;`
  );
  res.status(200).json({ res: response.rows });
});

//routes admin
app.use("/api/v1/admin", adminRouter);
//routes student
app.use("/api/v1/student", studentRouter);

app.post('/api/v1/webcam_detect', async (req, res) => {
  const { image, sid } = req.body;
  image = image.replace(/^data:image\/jpeg;base64,/, "");
  fetch('http://localhost:5000/', {
    method: 'POST',
    body: JSON.stringify({
      image: image,
      sid: sid
    }),
    headers: { 'Content-Type': 'application/json' }
  }).then(res => res.json())
    .then(json => {
      console.log(json);
      res.status(200).json({ res: json });
    }
    ).catch(err => console.log(err));
});

// error handler
const notFoundMiddleware = require("./middleware/not-found");
const errorHandlerMiddleware = require("./middleware/error-handler");

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);




// const port = process.env.PORT || 3002;

// app.listen(port, () => console.log(`Server is listening on port ${port}...`));
const options = {}

const httpsServer = https.createServer(options, app)
httpsServer.listen(3002, () => {
  console.log('listening on port: ' + 3002)
})

const io = new Server(httpsServer)

// socket.io namespace (could represent a room?)
const peers = io.of('/mediasoup')

/**
 * Worker
 * |-> Router(s)
 *     |-> Producer Transport(s)
 *         |-> Producer
 *     |-> Consumer Transport(s)
 *         |-> Consumer 
 **/
let worker
let router
let producerTransport
let consumerTransport
let producer
let consumer

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  })
  console.log(`worker pid ${worker.pid}`)

  worker.on('died', error => {
    // This implies something serious happened, so kill the application
    console.error('mediasoup worker has died')
    setTimeout(() => process.exit(1), 2000) // exit in 2 seconds
  })

  return worker
}

// We create a Worker as soon as our application starts
worker = createWorker()

// This is an Array of RtpCapabilities
// https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/#RtpCodecCapability
// list of media codecs supported by mediasoup ...
// https://github.com/versatica/mediasoup/blob/v3/src/supportedRtpCapabilities.ts
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]

peers.on('connection', async socket => {
  console.log(socket.id)
  socket.emit('connection-success', {
    socketId: socket.id,
    existsProducer: producer ? true : false,
  })

  socket.on('disconnect', () => {
    // do some cleanup
    console.log('peer disconnected')
  })

  socket.on('createRoom', async (callback) => {
    if (router === undefined) {
      // worker.createRouter(options)
      // options = { mediaCodecs, appData }
      // mediaCodecs -> defined above
      // appData -> custom application data - we are not supplying any
      // none of the two are required
      router = await worker.createRouter({ mediaCodecs, })
      console.log(`Router ID: ${router.id}`)
    }

    getRtpCapabilities(callback)
  })

  const getRtpCapabilities = (callback) => {
    const rtpCapabilities = router.rtpCapabilities

    callback({ rtpCapabilities })
  }

  // Client emits a request to create server side Transport
  // We need to differentiate between the producer and consumer transports
  socket.on('createWebRtcTransport', async ({ sender }, callback) => {
    console.log(`Is this a sender request? ${sender}`)
    // The client indicates if it is a producer or a consumer
    // if sender is true, indicates a producer else a consumer
    if (sender)
      producerTransport = await createWebRtcTransport(callback)
    else
      consumerTransport = await createWebRtcTransport(callback)
  })

  // see client's socket.emit('transport-connect', ...)
  socket.on('transport-connect', async ({ dtlsParameters }) => {
    console.log('DTLS PARAMS... ', { dtlsParameters })
    await producerTransport.connect({ dtlsParameters })
  })

  // see client's socket.emit('transport-produce', ...)
  socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
    // call produce based on the prameters from the client
    producer = await producerTransport.produce({
      kind,
      rtpParameters,
    })

    console.log('Producer ID: ', producer.id, producer.kind)

    producer.on('transportclose', () => {
      console.log('transport for this producer closed ')
      producer.close()
    })

    // Send back to the client the Producer's id
    callback({
      id: producer.id
    })
  })

  // see client's socket.emit('transport-recv-connect', ...)
  socket.on('transport-recv-connect', async ({ dtlsParameters }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`)
    await consumerTransport.connect({ dtlsParameters })
  })

  socket.on('consume', async ({ rtpCapabilities }, callback) => {
    try {
      // check if the router can consume the specified producer
      if (router.canConsume({
        producerId: producer.id,
        rtpCapabilities
      })) {
        // transport can now consume and return a consumer
        consumer = await consumerTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: true,
        })

        consumer.on('transportclose', () => {
          console.log('transport close from consumer')
        })

        consumer.on('producerclose', () => {
          console.log('producer of consumer closed')
        })

        // from the consumer extract the following params
        // to send back to the Client
        const params = {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }

        // send the parameters to the client
        callback({ params })
      }
    } catch (error) {
      console.log(error.message)
      callback({
        params: {
          error: error
        }
      })
    }
  })

  socket.on('consumer-resume', async () => {
    console.log('consumer resume')
    await consumer.resume()
  })
})

const createWebRtcTransport = async (callback) => {
  try {
    // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: '0.0.0.0', // replace with relevant IP address
          announcedIp: '127.0.0.1',
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    }

    // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
    let transport = await router.createWebRtcTransport(webRtcTransport_options)
    console.log(`transport id: ${transport.id}`)

    transport.on('dtlsstatechange', dtlsState => {
      if (dtlsState === 'closed') {
        transport.close()
      }
    })

    transport.on('close', () => {
      console.log('transport closed')
    })

    // send back to the client the following prameters
    callback({
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      }
    })

    return transport

  } catch (error) {
    console.log(error)
    callback({
      params: {
        error: error
      }
    })
  }
}