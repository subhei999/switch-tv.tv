var request = require('request')
var fs = require('fs')
const express = require('express');
const app = express();
var handlebars = require('express-handlebars').create({defaultLayout:'main'});
const path = require('path');
const { TesseractWorker } = require('./node_modules/tesseract.js');
const cv = require('opencv4nodejs');
const Influx = require('influx');

const CLIENT_ID = '6mz2xshvsl9szrfiqvko5oa1gbwjhu';

const tessWorker = new TesseractWorker();

const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'ApexStreamer',
  schema: [
    {
      measurement: 'viewership',
      fields: { 
        user_name: Influx.FieldType.STRING,
        viewer_count: Influx.FieldType.INTEGER,
        remaining_players: Influx.FieldType.INTEGER
       },
       tags:['host']
      
    }
  ]
});
const OCR_CONF_THRESH = 85;
const NUMBER_OF_STREAMS = 500;
const REQUEST_TIMER = 10000;//ms

var stream_cursor = "";
var stream_count = 0;
var streams_per_request = 20;


app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

//Use the built-in express middleware for serving static files from './public'
app.use('/static', express.static('public'));

app.get('/', (req, res) => {
  res.render('home.handlebars');
});

app.get('/tv', (req, res) => {
  res.render('tv.handlebars');
});

app.get('/cvReadImg',(req,res) =>{
  let src = cv.imread(req.query.img);
  let imgPath = path.resolve(__dirname,"copy_"+req.query.img);
  
  cv.imwrite(imgPath, src,[cv.IMWRITE_JPEG_OPTIMIZE]);
  //this works but requires file to be on local disk
  res.sendFile(imgPath);

});

app.get('/cvTemplateMatch',(req,res) =>{
  
  let result = MatchTemplateOnImg(req.query.img, req.query.imgTemplate);
  //res.sendFile(result.path);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(result));
  //res.end(result.location);

});


app.get('/cvDirTemplateMatch',(req,res) =>{
  
  let result = MatchTemplateOnDir(req.query.imgDir,req.query.imgTemplate);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(result));
});



app.get('/cvReadPlayersRemaining',(req,res) =>{
  const tessWorker = new TesseractWorker();
  ReadPlayersRemaining(req.query.img, req.query.imgTemplate,tessWorker,res)

});

app.get('/switchChannel',(req,res) =>{

    influx.query(`
    select * from viewership   
    order by time desc
    limit 10
  `).then(data => {
    var minRemainingPlayers = 100;
    var chosenUser = ""
    data.forEach(result =>{
      if(result.remaining_players <= minRemainingPlayers)
      {
        minRemainingPlayers = result.remaining_players;
        chosenUser = result.user_name;
      }
      
    })
    res.json(chosenUser);
    
  }).catch(err => {
    res.status(500).send(err.stack)
  })

});

//matches template img to source img and draw rectangle around matched region
//returns img path of saved output match image
function MatchTemplateOnImg(sourcePath,templatePath)
{
  let src = cv.imread(sourcePath);
  let template = cv.imread(templatePath);
  let imgPath = path.resolve(__dirname,"match_"+sourcePath);

  // Match template (the brightest locations indicate the highest match)
  const matched = src.matchTemplate(template, 5);

  // Use minMaxLoc to locate the highest value (or lower, depending of the type of matching method)
  const minMax = matched.minMaxLoc();
  const { maxLoc: { x, y } } = minMax;

  // Draw bounding rectangle
  src.drawRectangle(
    new cv.Rect(x, y, template.cols, template.rows),
    new cv.Vec(0, 0, 255),
    2,
    cv.LINE_8
  );

  cv.imwrite(imgPath, src,[cv.IMWRITE_JPEG_OPTIMIZE]);
  let result = new Object();
  result.path = imgPath;
  result.location = minMax;
  return result;
}


//match template img to directory and draw rect around matched region
//return img paths/result location in array
function MatchTemplateOnDir(sourceDirPath,templatePath)
{
  let resultArray = new Array();
  const directory = path.join(__dirname, sourceDirPath);
  fs.readdirSync(directory).forEach((file)=>{
    console.log(file); 
    let result = MatchTemplateOnImg(path.join(sourceDirPath,file),templatePath);
    resultArray.push(result);
  });

  return resultArray;
}




// function ReadPlayersRemaining(sourcePath,templatePath,tessWorker,res)
// {
//   let imgPath = path.resolve(__dirname,"crop_"+sourcePath);
//   var cropWidth = 25;
//   var cropHeight = 30;

//   let src = cv.imread(sourcePath);
//   let template = cv.imread(templatePath);

//   //match template and get result
//   const matched = src.matchTemplate(template, 5);

//   // Use minMaxLoc to locate the highest value (or lower, depending of the type of matching method)
//   const minMax = matched.minMaxLoc();
//   const { maxLoc: { x, y } } = minMax;

//   //create rect over text
//   let rect = new cv.Rect(minMax.maxLoc.x + template.cols,minMax.maxLoc.y, cropWidth, cropHeight);

//   //crop image
//   let roi = src.getRegion(rect);

//   //filter image to improve OCR
//   let gray_roi = roi.cvtColor(cv.COLOR_RGBA2GRAY,0);
//   let roi_filtered = gray_roi.threshold(127,255,cv.THRESH_BINARY);

//   let size = new cv.Size(3,3);
//   let roi_filtered2 = roi_filtered.gaussianBlur(size,0.5,0.5);

//   //const image = path.resolve(__dirname, imgPath);

//   cv.imwrite(imgPath, roi_filtered2,[cv.IMWRITE_JPEG_OPTIMIZE]);


//   tessWorker.recognize(imgPath)
//     .progress((info) => {
//       console.log(info);
//     })
//     .then((data) => {
//       console.log(data.text);
//       res.writeHead(200,{'Content-Type':'application/json'});
//       res.end(JSON.stringify(data.text));
//     })
//     .catch((err) => {
//       console.log('Error\n', err);
//     });

   
// }


function ReadPlayersRemaining(streamer,sourcePath,templatePath)
{
  let imgPath = path.resolve(__dirname,"crop_"+sourcePath);
  var cropWidth = 25;
  var cropHeight = 25;

  let src = cv.imread(sourcePath);
  let template = cv.imread(templatePath);

  //match template and get result
  const matched = src.matchTemplate(template, 5);

  // Use minMaxLoc to locate the highest value (or lower, depending of the type of matching method)
  const minMax = matched.minMaxLoc();
  const { maxLoc: { x, y } } = minMax;

  //create rect over text
  let rect = new cv.Rect(minMax.maxLoc.x + template.cols,minMax.maxLoc.y, cropWidth, cropHeight);

  //crop image
  if(rect.x + rect.width >= src.cols || rect.y + rect.height >= src.rows)
    return;

  let roi = src.getRegion(rect);

  //filter image to improve OCR
  let gray_roi = roi.cvtColor(cv.COLOR_RGBA2GRAY,0);
  let roi_filtered = gray_roi.threshold(127,255,cv.THRESH_BINARY);

  let size = new cv.Size(3,3);
  let roi_filtered2 = roi_filtered.gaussianBlur(size,0.5,0.5);

  //const image = path.resolve(__dirname, imgPath);

  cv.imwrite(imgPath, roi_filtered2,[cv.IMWRITE_JPEG_OPTIMIZE]);

  tessWorker.recognize(imgPath)
    //  .progress((info) => {
    //    console.log(info);
    //  })
    .then((data) => {
      if((!isNaN(data.text)) && data.text != "" && data.confidence > OCR_CONF_THRESH )
      {

        console.log(sourcePath.split("/")[2].split(".")[0] + " " + data.text + " " + data.confidence );
        PushToInflux(streamer,data);
      }
    })
    .catch((err) => {
      console.log('Error\n', err);
    });

   
}

function PushToInflux(streamer,ocrResult)
{
  influx.writePoints([
    {
      measurement: 'viewership',
      fields: { user_name:streamer.user_name, viewer_count:streamer.viewer_count, remaining_players: parseInt(ocrResult.text.split('\\')[0]) }
    }
  ]).catch(err => {
    console.error(`Error saving data to InfluxDB! ${err.stack}`)
  })
}

function GetRequest(url,qParams,qValues,callback)
{
  var reqStr = url + '?';

  if(qParams.length != qValues.length)
  {
      console.log("Invalid Get Request");
      return;
  }

  for (let index = 0; index < qParams.length; index++) {
      const param = qParams[index];
      const value = qValues[index];

      reqStr += param + '=' + value;
      
      if(index != qParams.length - 1)
          reqStr += '&';

  }
  request({
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Client-ID': CLIENT_ID
    },
    uri: reqStr,
    method: 'GET'
  }, function (err, res, body) {
    var data = JSON.parse(body);
    if(data.pagination.cursor != null && data.pagination.cursor != "")
    {
      stream_cursor = data.pagination.cursor
      callback(data);
    }
  });

}

function ExampleCallback(data)
{
    console.log(data);
}

function DownloadImage(streamer,url,outputPath)
{
  var writeFileStream = fs.createWriteStream(outputPath)
  request(url).pipe(writeFileStream).on('close', function() {
    console.log(url, 'saved to', outputPath)
    var templatePath = "templ.png";
    ReadPlayersRemaining(streamer,outputPath, templatePath);
  })
}

function DownloadThumbnails(data)
{
  var randomOffsetHeight = Math.round(Math.random()*10) - 5;
  var randomOffsetWidth = Math.round(Math.random()*10) - 5;
  var resolutionHeight = 1080 + randomOffsetHeight;
  var resolutionWidth = 1920 + randomOffsetWidth;

  data.data.forEach((streamer)=>{
    var url = streamer.thumbnail_url.split("{")[0];
    url+=resolutionWidth+"x"+resolutionHeight+".jpg";
    var outputPath = "public/thumbnails/"+streamer.thumbnail_url.split("_")[2].split("-")[0]+".jpg";
   // DownloadImage(url,outputPath);
   DownloadImage(streamer,url,outputPath)

  });
}

function doSomething()
{
  console.log("Getting streamer data from Apex Legends..");
  GetRequest('https://api.twitch.tv/helix/streams', ['game_id','first','after'], [511224,streams_per_request,stream_cursor], DownloadThumbnails );
  stream_count += streams_per_request;
  if(stream_count >= NUMBER_OF_STREAMS)
  {
    stream_cursor = "";
    stream_count = 0;
  }
}
//GetRequest('https://api.twitch.tv/helix/streams', ['game_id','first','after'], [511224,,stream_cursor], DownloadThumbnails );
//GetRequest('https://api.twitch.tv/helix/games/top', [], [], ExampleCallback);
setInterval(doSomething, REQUEST_TIMER); // Time in milliseconds

influx.getDatabaseNames()
  .then(names => {
    if (!names.includes('ApexStreamer')) {
      return influx.createDatabase('ApexStreamer');
    }
  })
  .catch(err => {
    console.error(`Error creating Influx database!`);
  })

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});


