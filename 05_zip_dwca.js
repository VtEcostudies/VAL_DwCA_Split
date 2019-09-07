/*
Upload gzip files to server with scp:

scp -i "C:\Users\jloomis\.ssh\vce_live_aws_key_pair.pem" ./*.zip ubuntu@vtatlasoflife.org:/srv/vtatlasoflife.org/www/gbif-split

*/
var fs = require('fs');
var archiver = require('archiver');
var readline = require('readline');
var paths = require('./00_config').paths;

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var dArr = [];
var idx = 1; //file row index
var cnt = 1; //separate counter for zipped array elements
var output = [];
var archive = [];

//read lines from datasetKey_... to get an array of datasetKeys
var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/datasetKey_gbifArray.txt`)
});

//load the datasetKey_gbifArray file into local array
dRead.on('line', function (row) {
  var arr = row.split(":");
  var mod = arr.slice(); //using .slice() copies by value, not by reference

  var dKey = mod[0];
  dArr[idx] = dKey;

  console.log(`read line: ${idx} datasetKey: ${dKey}`);

  idx++; //post-increment, starting from 1...
});

dRead.on('close', async function() {

      createNextZip(cnt);

});

function createNextZip(cnt) {
    
  console.log(`${cnt} Zipping contents of ${dArr[cnt]} into ${dArr[cnt]}.zip...`);

  // create the next file to stream archive data to, and the archiver to do the job.
  output[cnt] = fs.createWriteStream(`${sDir}/${dArr[cnt]}.zip`);
  archive[cnt] = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });
  
  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  output[cnt].on('close', function() {
    console.log(`${cnt} closed. ${archive[cnt].pointer()} total bytes.`);
    //console.log('archiver has been finalized and the output file descriptor has closed.');
    cnt++;
    if (cnt <= dArr.length) {
      createNextZip(cnt); //recursion...
    } else {
      console.log(`Finished Zipping last folder: ${cnt}`);
    }
  });
  
  // This event is fired when the data source is drained no matter what was the data source.
  // It is not part of this library but rather from the NodeJS Stream API.
  // @see: https://nodejs.org/api/stream.html#stream_event_end
  output[cnt].on('end', function() {
    console.log('Data has been drained');
  });
   
  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive[cnt].on('warning', function(err) {
    if (err.code === 'ENOENT') {
      // log warning
      console.log('WARNING - Entity not found', err);
    } else {
      // throw error
      throw err;
    }
  });
   
  // good practice to catch this error explicitly
  archive[cnt].on('error', function(err) {
    throw err;
  });

  // pipe archive data to the file
  archive[cnt].pipe(output[cnt]);

  // append files from a sub-directory, putting its contents at the root of archive
  archive[cnt].directory(`${sDir}/${dArr[cnt]}/`, false);
   
  // finalize the archive (ie we are done appending files but streams have to finish yet)
  // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
  archive[cnt].finalize();

}