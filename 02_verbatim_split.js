/*
  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: 02_verbatim_split.js

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
const readline = require('readline');
const fs = require('fs');
const log = require('./VAL_Utilities/93_log_utilities').log;
const init = require('./VAL_Utilities/93_log_utilities').init;
const paths = require('./00_config').paths;
const dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
const sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files
const logDir = paths.logDir;
const logName = 'verbatim_split';

var wStream = []; //array of write streams, one for each datasetKey
var gbifArr = []; //array of gbifIds, value is datasetKey
var idx = 0; //file row index
var ctD = 0; //count of Datasets
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var gbifId = 0;
var test_gbifId = 0; //3334176463 from dataSet 
var dKey = "";
var logToConsole = false; //console logging slows processing a lot

process.on('exit', function(code) {
  return log(1,`Exiting with code ${code}.`, 'Verbatim Records', idx, 'Datasets', ctD);
});

init(logName, logDir) //init's error does not throw error, allowing this to proceed on error
  .then((logStream) => {

    log(1, `config paths: ${JSON.stringify(paths)}`);

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

            dKey = gbifArr[gbifId]; //get datasetKey from gbifArr. if verbatim has gbifIds not in occurrence, this can be undefined

            //added this when we had missing data. verbatim.txt can have bad data that mucks prior processing steps.
            if (test_gbifId && test_gbifId==Number(gbifId)) {
              log(1, `${idx} Found ${test_gbifId} in verbatim.txt. dKey=${dKey}`);
            }

            if (dKey) { //dKey can be undefined now that we down-sample occurrence.txt and verbatim.txt for VT polygons
              //look for already-open dKey write stream
              if (!wStream[dKey]) {
                ctD++; //new Dataset: increment
                wStream[dKey] = fs.createWriteStream(`${sDir}/${dKey}/verbatim.txt`);
                wStream[dKey].write(`${top}\n`);
                //log_local(`${idx} | verbatim.txt | ${dKey}`, true);
                log(1, `${idx} | verbatim.txt | ${dKey}`, `Dataset Count: ${ctD}`);
              }
              wStream[dKey].write(`${row}\n`);
            } else {
              //log_local(`${idx} | ERROR | verbatim.txt | gbifId ${gbifId} not found in ${sDir}/gbifId_datasetKey.txt`, true);
              log(1, `${idx} | ERROR | verbatim.txt | gbifId ${gbifId} not found in ${sDir}/gbifId_datasetKey.txt`);
            }
          }
          idx++;
      });
    });
})

function log_local(txt, override=false) {
  try {
    if (logToConsole || override) {console.log(txt);}
    if (!wStream['log']) {
      //wStream['log'] = await fs.createWriteStream(`${sDir}/verbatim_split.log`);
      wStream['log'] = fs.createWriteStream(`${sDir}/verbatim_split.log`);
    }
    wStream['log'].write(txt + '\n');
  } catch(err) {
    throw err;
  }
}
