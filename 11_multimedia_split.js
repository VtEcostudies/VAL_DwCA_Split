/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: multimedia_split.js

  Specifics:
  Split multimedia.txt into datasetKey directories using gbifId-to-datesetKey
  array-in-file generated from processing occurrence.txt, which contains the
  only link between gbifId and datasetKey.

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds in multimedia.txt are a subset of those in occurrence.txt
  - gbifIds uniquely map to a single GBIF datasetKey
*/

//https://nodejs.org/api/readline.html
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;

console.log(`config paths: ${JSON.stringify(paths)}`);

var dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var wStream = []; //array of write streams, one for each datasetKey
var gbifArr = []; //array of gbifIds, value is datasetKey
var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds
var idx = 0; //file row index
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var gbifObj = {};
var gbifId = 0;
var dKey = "";
var dRead = readline.createInterface({
  input: fs.createReadStream(`${sDir}/gbifId_datasetKey.txt`)
});

//load the gbifId-to-datasetKey file into local array
dRead.on('line', function (row) {
  idx++;
  arr = row.split(":");
  mod = arr.slice(); //using .slice() copies by value, not by reference

  gbifId = mod[0];
  dKey = mod[1];
  gbifArr[gbifId] = dKey;

  //console.log(`${idx} Adding multimedia file for gbifId: ${gbifId} to datasetKey: ${dKey}`);
});

//when the gibfId-to-datasetKey file is done loading, process multimedia.txt
dRead.on('close', function() {
  top = "";
  idx = 0;

  var vRead = readline.createInterface({
    input: fs.createReadStream(`${dDir}/multimedia.txt`)
  });

  vRead.on('line', function (row) {
      if (idx == 0) {
        top = row; //save the 1st row for each dKey/multimedia.txt
      } else {
        //<field index="0" term="http://rs.gbif.org/terms/1.0/gbifID"/>
        arr = row.split("\t");
        mod = arr.slice(); //using .slice() copies by value, not by reference

        gbifId = mod[0];
        dKey = gbifArr[gbifId];

        //console.log(`${idx} | multimedia.txt | ${dKey} | ${gbifId}`);

        //look for already-open dKey write stream
        if (!wStream[dKey]) {
          wStream[dKey] = fs.createWriteStream(`${sDir}/${dKey}/multimedia.txt`);
          wStream[dKey].write(`${top}\n`);
        }
        wStream[dKey].write(`${row}\n`);
      }
      idx++;
  });
  
  vRead.on('close', function() {
    console.log(`Done reading aggregate multimedia.txt`);
  });

});
