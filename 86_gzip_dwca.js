/*
Upload gzip files to server with scp:

scp -i "C:\Users\jloomis\.ssh\vce_live_aws_key_pair.pem" ./*.tar.gz ubuntu@vtatlasoflife.org:/srv/vtatlasoflife.org/www/gbif-split

*/
const fs = require('fs');
var readline = require('readline');
const child_process = require("child_process");
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
  
  for (var idx=1; idx < dArr.length; idx++) {
    
    console.log(`Zipping contents of ${dArr[idx]} into ${dArr[idx]}.tar.gz...`);

    child_process.execSync(`tar -zcvf ${dArr[idx]}.tar.gz ${dArr[idx]}`,
      {
        cwd: sDir
      });
  }
});
