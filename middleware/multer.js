/*global process */
import multer from "multer";
import path from "path";
const storage = multer.memoryStorage();

// initializing disc storage
//const AUDIO_PATH = path.join(process.cwd(), "./audios");

// const audioStorage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, AUDIO_PATH);
//   },
//   filename: function (req, file, cb) {
//     cb(null, Date.now() + path.extname(file.originalname));
//   },
// });

export const singleUpload = multer({
  storage,
  limits: {
    fileSize: 100* 1024 * 1024, // 100 MB
  },
}).single("file");

export const multipleFileUploads = multer({
  storage,  
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB limit per file
  },
}).fields([
    { name: "files", maxCount: 10 }, // Limit to 10 files
]);


// export const singleAudio = multer({
//   storage: audioStorage,
// }).single("file");

export const uploads = multer({ storage }).array("files");
export const largeUploads = multer({
  storage: storage,
  // limits: { fileSize: 52428800.02  },  //50MB
}).array("files");

export const forms = multer({ dest: "./upload/" });