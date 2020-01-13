/*
  Author: Jason Loomis

  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: verbatim_split.js

  Specifics:
  Split verbatim.txt into datasetKey directories using gbifId-to-datesetKey
  array-in-file generated from processing occurrence.txt, which contains the
  only link between gbifId and datasetKey.

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds in verbatim.txt are a subset of those in occurrence.txt
  - gbifIds uniquely map to a single GBIF datasetKey
*/

//https://nodejs.org/api/readline.html
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;
var dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var wStream = []; //array of write streams, one for each datasetKey
var gbifArr = []; //array of gbifIds, value is datasetKey
var idx = 0; //file row index
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var gbifId = 0;
var dKey = "";
var logToConsole = false; //console logging slows processing a lot

log(`config paths: ${JSON.stringify(paths)}`);

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

  //console.log(`${idx} Split verbatim.txt for gbifId: ${gbifId} into datasetKey: ${dKey}`);
});

//when the gibfId-to-datasetKey file is done loading, process verbatim.txt
dRead.on('close', function() {
  top = "";
  idx = 0;

  var vRead = readline.createInterface({
    input: fs.createReadStream(`${dDir}/verbatim.txt`)
  });

  vRead.on('line', function (row) {
      if (idx == 0) {
        top = row; //save the 1st row for each dKey/verbatim.txt
      } else {
        //<field index="0" term="http://rs.gbif.org/terms/1.0/gbifID"/>
        arr = row.split("\t");
        mod = arr.slice(); //using .slice() copies by value, not by reference

        gbifId = mod[0];
        dKey = gbifArr[gbifId];

        //log(`${idx} | verbatim.txt | ${dKey} | ${gbifId}`);

        //look for already-open dKey write stream
        if (!wStream[dKey]) {
          wStream[dKey] = fs.createWriteStream(`${sDir}/${dKey}/verbatim.txt`);
          wStream[dKey].write(`${top}\n`);
          log(`${idx} | verbatim.txt | ${dKey}`, true);
        }
        wStream[dKey].write(`${row}\n`);
      }
      idx++;
  });
});

async function log(txt, override=false) {
  try {
    if (logToConsole || override) {console.log(txt);}
    if (!wStream['log']) {
      wStream['log'] = await fs.createWriteStream(`${sDir}/verbatim_split.log`);
    }
    wStream['log'].write(txt + '\n');
  } catch(err) {
    throw err;
  }
}
