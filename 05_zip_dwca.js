/*
Upload gzip files to server with scp:

scp -i "C:\Users\jloomis\.ssh\vce_live_aws_key_pair.pem" ./*.zip ubuntu@vtatlasoflife.org:/srv/vtatlasoflife.org/www/gbif-split

*/
var fs = require('fs');
var archiver = require('archiver');
var readline = require('readline');
var paths = require('./config').paths;

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var dArr = [];
var idx = 0; //file row index
var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/datasetKey_gbifArray.txt`)
});

//load the datasetKey_gbifArray file into local array
dRead.on('line', function (row) {
  idx++;
  var arr = row.split(":");
  var mod = arr.slice(); //using .slice() copies by value, not by reference

  var dKey = mod[0];
  dArr[idx] = dKey;

  console.log(`read line: ${idx} datasetKey: ${dKey}`);
});

dRead.on('close', async function() {
  
  var output = [];
  var archive = [];
  
  for (var idx=1; idx < dArr.length; idx++) {
    
    console.log(`${idx} Zipping contents of ${dArr[idx]} into ${dArr[idx]}.zip...`);

    // create a file to stream archive data to.
    output[idx] = fs.createWriteStream(`${sDir}/${dArr[idx]}.zip`);
    archive[idx] = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });
  
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output[idx].on('close', function() {
      //console.log(archive[idx].pointer() + ' total bytes');
      //console.log('archiver has been finalized and the output file descriptor has closed.');
    });
     
    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    output[idx].on('end', function() {
      console.log('Data has been drained');
    });
     
    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive[idx].on('warning', function(err) {
      if (err.code === 'ENOENT') {
        // log warning
      } else {
        // throw error
        throw err;
      }
    });
     
    // good practice to catch this error explicitly
    archive[idx].on('error', function(err) {
      throw err;
    });

    // pipe archive data to the file
    archive[idx].pipe(output[idx]);

    // append files from a sub-directory, putting its contents at the root of archive
    archive[idx].directory(`${sDir}/${dArr[idx]}/`, false);
     
    // finalize the archive (ie we are done appending files but streams have to finish yet)
    // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
    archive[idx].finalize();
  }
});
