/*
  Project: gbif_dwca_split
  Parse aggregate GBIF download DWcA into individual datasets/providers.
  Goal being then to ingest each dataset into VAL as a separate data resource.

  File: 03_citations_rights_get.js

  Specifics:
  Create citations.txt and rights.txt for each datasetKey in a subdirectory with
  that name using the datasetKey array datesetKey_gbifArray array-in-file
  generated from processing occurrence.txt, which contains the only link
  between gbifId and datasetKey.

  At the start, detect a prior file of errors, 'citations_rights_get.err'. If it
  exists, open and process just the datasetKeys in errFile. If it does not exist,
  open and use the file of all datasetKeys, 'datasetKey_gbifArray.txt'.

  For each datasetKey, query the GBIF API http://api.gbif.org/v1/dataset/datasetKey
  to retrieve citations and rights information for the dataset.

  Assumptions:
  - occurrence_split has successfully run against occurrence.txt.
  - gbifIds in citation.txt are a subset of those in occurrence.txt
  - gbifIds uniquely map to a single GBIF datasetKey
  - datasetKey is a persistent, immutable value we can use to create
    citation.txt (and others)
*/

//https://nodejs.org/api/readline.html
var readline = require('readline');
var fs = require('fs');
var paths = require('./00_config').paths;
var Request = require("request");
const moment = require('moment');
var dDir = paths.dwcaDir; //path to directory holding extracted GBIF DWcA files
var sDir = paths.splitDir; //path to directory to hold split GBIF DWcA files

var wsCitations = []; //array of write streams, one for each datasetKey
var wsRights = []; //array of write streams, rights.txt
var wStream = []; //array of generic write streams (log)
var gbifArr = []; //array of gbifIds, value is datasetKey
var dKeyArr = {}; //object as array of datasetKeys. value is array of gbifIds
var wRead = null; //file read object
var idx = 0; //file row index
var top = ""; //1st line in file - field names
var arr = [];
var mod = null;
var gbifObj = {};
var gbifId = 0;
var dKey = "";
var logFile = "citations_rights_get.log";
var errFile = "citations_rights_get.err";
var logToConsole = true; //console logging slows processing a lot
var processErrors = fs.existsSync(`${sDir}/${errFile}`); //check for error file from previous run

log(`config paths: ${JSON.stringify(paths)}`, true);

/*
  On clean exit, if we processed an error file, rename it.
*/
process.on('exit', function(code) {
  if (processErrors) {
    wRead.close();
    var newErrFile = `processed_${moment().format('YYYYMMDD-hhmmss')}_${errFile}`;
    fs.renameSync(`${sDir}/${errFile}`, `${sDir}/${newErrFile}`);
    log(`Error File Renamed to ${sDir}/${newErrFile}`, true);
  }
  return console.log(`Process exit with code ${code}`);
});

if (processErrors) {
  log(`Processing Error File ${sDir}/${errFile}`, true);
  wRead = readline.createInterface({
    input: fs.createReadStream(`${sDir}/${errFile}`) //process errors
  });
} else {
  wRead = readline.createInterface({
    input: fs.createReadStream(`${sDir}/datasetKey_gbifArray.txt`) //process all
  });
}

//load the datasetKey_gbifArray (or error) file into local array
wRead.on('line', function (row) {
  idx++;
  arr = row.split(":");
  mod = arr.slice(); //using .slice() copies by value, not by reference

  dKey = mod[0];
  dKeyArr[dKey] = mod[1];

  log(`${idx} datasetKey: ${dKey}`);
});

//when the datasetKey-to-gibfId file is done loading, create a new citations.txt
wRead.on('close', async function() {
  idx = 1;
  await Object.keys(dKeyArr).forEach(async function(dKey) {
    //request citation object from GBIF dataset API
    await Request.get(`http://api.gbif.org/v1/dataset/${dKey}`, async (err, res, body) => {
        if (err) {
            log(`${idx} | GBIF http GET ERROR | ${err}`, true);
            logErr(dKey);
            idx++;
            return err;
        }
        try {
          var jBod = JSON.parse(body);
          log(`${idx} | ${dKey} | citation | ${jBod.citation.text}`, true);
          //open a write stream (create the file)
          wsCitations[dKey] = fs.createWriteStream(`${sDir}/${dKey}/citations.txt`);
          wsCitations[dKey].write("When using this dataset please use the following citation and pay attention to the rights documented in the rights.txt:\n");
          wsCitations[dKey].write(`${jBod.citation.text}\n`);

          log(`${idx} | ${dKey} | rights | title | ${jBod.title}`, true);
          log(`${idx} | ${dKey} | rights | license | ${jBod.license}`, true);
          log(`\n`);
          wsRights[dKey] = fs.createWriteStream(`${sDir}/${dKey}/rights.txt`);
          wsRights[dKey].write(`${jBod.title}\n`);
          wsRights[dKey].write(`${jBod.license}\n`);
          idx++;
        } catch(err) {
          log(`Error processing GBIF GET Request: ${err}`, true);
        }
    });
  });
});

function log(txt, override=false) {
  try {
    if (logToConsole || override) {console.log(txt);}
    if (!wStream['log']) {
      wStream['log'] = fs.createWriteStream(`${sDir}/${logFile}`);
    }
    wStream['log'].write(txt + '\n');
  } catch(error) {
    throw error;
  }
}

function logErr(txt) {
  try {
    console.log(`datasetKey Added to Error File: ${txt}`);
    if (!wStream['err']) {
      wStream['err'] = fs.createWriteStream(`${sDir}/${errFile}`);
    }
    wStream['err'].write(txt + '\n');
  } catch(error) {
    throw error;
  }
}
