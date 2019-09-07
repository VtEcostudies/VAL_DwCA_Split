/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: multimedia_init.js

  Specifics:
  Create blank multimedia.txt files for each datasetKey to prevent errors on
  ingestion.

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
*/

var readline = require('readline');
var fs = require('fs');
var paths = require('./config').paths;

console.log(`config paths: ${JSON.stringify(paths)}`);

var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var wStream = []; //array of write streams, one for each datasetKey
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

  console.log(`${idx} Init multimedia.txt for datasetKey: ${dKey}`);
  
  if (!wStream[dKey]) {
    wStream[dKey] = fs.createWriteStream(`${sDir}/${dKey}/multimedia.txt`);
  }
});
