/*
Author: Jason Loomis

Project: gbif_dwca_split
Parse aggregate GBIF download DWcA into individual datasets/providers.
Goal being then to ingest each dataset into VAL as a separate data resource.

File: 05_zip_dwca.js

- You will be prompted to zip Multimedia Datasets Only...oops, it doesn't work. (Commented the code.)
- Some files are enormous. On zipping large files, it will appear as if the process has hung. You may need to wait 30
  minutes, or more.

Upload gzip files to server with scp:

scp -i "C:\Users\jloomis\.ssh\vce_live_aws_key_pair.pem" ./*.zip ubuntu@vtatlasoflife.org:/srv/vtatlasoflife.org/www/gbif-split
*/
console.log('asdfdas');

const fs = require('fs');
const archiver = require('archiver');
const readline = require('readline');
const paths = require('./00_config').paths;

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var dArr = [];
var idx = 1; //file row index
var cnt = 1; //separate counter for zipped array elements
var output = [];
var archive = [];
var readFile = 'datasetKey_gbifArray.txt';

main();

/*
  Read datasetKey_gbifArray into local array and process files into zips for
  uploading.
*/
function main() {

  //read lines from datasetKey_... to get an array of datasetKeys
  var dRead = readline.createInterface({
    input: fs.createReadStream(`${sDir}/${readFile}`)
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

  /*
  NOTE: large files can take several minutes to compress. Sometimes, the 1st file is that large,
  and it appears to hang. It's not. Dataset keys that are large:

  4fa7b334-ce0d-4e88-aaae-2e0c138d049e
  50c9509d-22c7-4a22-a47d-8c48425ef4a7
  */
  function createNextZip(cnt) {

    console.log(`${cnt} Zipping contents of ${dArr[cnt]} into ${sDir}/${dArr[cnt]}.zip...`);

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
      if (cnt < dArr.length) {
        createNextZip(cnt); //recursion...
      } else {
        console.log(`Finished Zipping last folder: ${cnt-1}`);
      }
    });

    //registering this event callback does nothing... the API says it should...?
    output[cnt].on('progress', function(entries, fs) {
      console.log(`${cnt} Progress: ${entries.processed} entries, ${fs.totalBytes} bytes`);
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
}
